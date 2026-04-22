import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import type { Template } from '../core/schemas';
import { applyMasterEnrichmentIfNeeded } from '../core/enrichMasterPayload';
import { fallbackPayload, validateParsedPayload } from '../core/payloadValidation';
import { transcribeAudioFile, completeLLM, fetchHealth } from '../services/transcribe';
import { getLearnedSchemaSnapshot } from '../services/schemaLearning';
import { getMasterDbPromptBlock } from '../services/masterDbCache';
import type { ParseResult } from './cactus';

// ── JSON extraction helpers ───────────────────────────────────────────────────

function extractJsonObject(text: string): string {
  let t = text.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)```$/m.exec(t);
  if (fenced) t = fenced[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) return t.slice(start, end + 1);
  return t;
}

function jsonSchemaPrompt(template: Template): string {
  switch (template.type) {
    case 'checklist':
      return `Return a single JSON object only:
{"kind":"checklist","steps":[{"title":"string","notes":"string","completed":boolean}],"summary":"string"}
Use short titles for steps inferred from the transcript.`;
    case 'notes':
      return `Return a single JSON object only:
{"kind":"notes","body":"string","title":"optional string"}
Put the main content in body.`;
    case 'database_entry': {
      if (template.id === 'master-dolphin_observations') {
        return `Return ONLY one JSON object (no markdown, no prose).
Examples:
Transcript "6 dolphins spotted near location 12"
→ {"kind":"database_entry","fields":{"observation_type":"dolphin","dolphin_count":6,"location":"12","buoy":null}}

Transcript "pod of 4 spotted near location 1"
→ {"kind":"database_entry","fields":{"observation_type":"dolphin","dolphin_count":4,"location":"1","buoy":null}}

Rules:
- Keys MUST be exactly: observation_type, dolphin_count, location, buoy.
- dolphin_count: integer (from "6 dolphins", "pod of 4", etc.).
- location: digits after the word "location" (e.g. location 12 → "12").
- buoy: digits after "buoy" if spoken; else null.
- observation_type: "dolphin" when dolphins/pods are described.`;
      }
      if (
        template.id === 'master-costco_inventory' ||
        template.id.endsWith('-costco_inventory')
      ) {
        return `Return ONLY one JSON object (no markdown, no prose).
Examples:
Transcript "brand Kirkland Signature type toilet paper count 12"
→ {"kind":"database_entry","fields":{"brand":"Kirkland Signature","product_type":"toilet paper","product_name":null,"quantity":12}}

Transcript "Charmin ultra soft quantity three"
→ {"kind":"database_entry","fields":{"brand":"Charmin","product_type":"toilet paper","product_name":"ultra soft","quantity":3}}

Transcript "count five Kirkland frozen berries"
→ {"kind":"database_entry","fields":{"brand":"Kirkland","product_type":"frozen","product_name":"berries","quantity":5}}

Rules:
- Keys MUST be exactly: brand, product_type, product_name, quantity (snake_case).
- quantity: integer only. Map spoken numbers to integers (one→1, two→2, three→3, … twenty→20).
- brand: manufacturer or Kirkland-style label spoken after "brand" or at start.
- product_type: category (toilet paper, chicken, beverages, snacks, frozen, …).
- product_name: specific line/SKU if stated; else null.
Never leave fields empty objects; use null only when truly unknown.`;
      }
      const defs = template.schemaDefinition ?? [];
      if (defs.length > 0) {
        const inner = defs
          .map(f => {
            const t = f.valueType ? ` [type: ${f.valueType}]` : '';
            return `    "${f.key}": <${f.label}>${t}  // column "${f.key}"`;
          })
          .join(',\n');
        return `Return a single JSON object only. Keys MUST match these database column names exactly:
{"kind":"database_entry","fields":{
${inner}
}}
Use JSON numbers for integer/real fields, booleans where appropriate, strings for text. Use null only when unknown.`;
      }
      return `Return a single JSON object only:
{"kind":"database_entry","fields":{"key":"value",...}}
Use string values unless clearly numeric or boolean.`;
    }
    default:
      return '{"kind":"notes","body":"string"}';
  }
}

const GARBAGE_TERMS = [
  'background noise', 'background', 'noise', 'unclear', 'inaudible',
  'conversation', 'unknown', 'n/a', 'not applicable', 'unintelligible',
  'random', 'chatter', 'talking', 'undefined', 'none provided',
];

function isGarbageValue(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const lower = v.toLowerCase().trim();
  return GARBAGE_TERMS.some(t => lower === t || lower.includes(t));
}

function isGarbagePayload(template: Template, parsed: unknown): boolean {
  if (template.type !== 'database_entry') return false;
  if (typeof parsed !== 'object' || parsed === null) return false;
  const fields = (parsed as Record<string, unknown>).fields;
  if (typeof fields !== 'object' || fields === null) return false;
  const values = Object.values(fields as Record<string, unknown>).filter(v => v !== null);
  if (values.length === 0) return true;
  const garbageCount = values.filter(isGarbageValue).length;
  // Reject if more than half the non-null fields are garbage words.
  return garbageCount > 0 && garbageCount >= values.length / 2;
}

function schemaIdFromTemplate(template: Template): string | null {
  if (template.type !== 'database_entry') return null;
  if (template.id.startsWith('master-')) return template.id.slice('master-'.length);
  return null;
}

// ── Context type ──────────────────────────────────────────────────────────────

export type VoiceParserContextValue = {
  parseVoice: (uri: string, template: Template) => Promise<ParseResult | null>;
  parseTranscript: (transcript: string, template: Template) => Promise<ParseResult | null>;
  isReady: boolean;
  isLoading: boolean;
  downloadProgress: number;
  error: string | null;
};

const VoiceParserContext = createContext<VoiceParserContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function VoiceParserProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      try {
        const ok = await fetchHealth();
        if (!cancelled) {
          setIsReady(ok);
          setError(ok ? null : 'Backend not reachable — start the Clip server');
        }
      } catch {
        if (!cancelled) {
          setIsReady(false);
          setError('Backend not reachable — start the Clip server');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const parseTranscript = useCallback(
    async (transcript: string, template: Template): Promise<ParseResult | null> => {
      const trimmed = transcript.trim();
      if (!trimmed) return null;

      const schemaId = schemaIdFromTemplate(template);
      const learned = getLearnedSchemaSnapshot(schemaId);
      const learnedBlock = learned
        ? `\nUse this historical extraction memory to improve recall on unstructured speech:\n${learned.promptSummary}\n`
        : '';

      const dbExamplesBlock = getMasterDbPromptBlock(schemaId);
      const dbBlock = dbExamplesBlock
        ? `\n${dbExamplesBlock}\n`
        : '';

      const system = `STEP 1 — VALIDITY CHECK (do this first, before anything else):
If the transcript is casual conversation, background noise, silence, filler words ("um", "uh", "okay", "yeah"), or clearly not someone logging a data entry, you MUST return ONLY:
{"kind":"invalid","reason":"<one sentence>"}
Do NOT attempt to fill in any fields. Do NOT guess.

STEP 2 — Only if it IS a real data entry attempt, convert it to this format:
${jsonSchemaPrompt(template)}
${dbBlock}${learnedBlock}
Output ONLY the JSON object. No markdown, no commentary.`;

      const messages = [
        { role: 'system', content: system },
        { role: 'user', content: `Transcript:\n${trimmed}` },
      ];

      const t0 = Date.now();
      try {
        const result = await completeLLM(messages, { temperature: 0, maxTokens: 1024 });
        const latencyMs = Date.now() - t0;

        if (!result.success) {
          const fb = applyMasterEnrichmentIfNeeded(
            template, trimmed, fallbackPayload(template, trimmed),
          );
          return {
            record: { templateId: template.id, templateName: template.name, payload: fb, rawTranscript: trimmed },
            confidence: 0.22,
            latencyMs,
          };
        }

        const jsonText = extractJsonObject(result.response);
        let parsed: unknown;
        try {
          parsed = JSON.parse(jsonText);
        } catch {
          const fb = applyMasterEnrichmentIfNeeded(template, trimmed, fallbackPayload(template, trimmed));
          return {
            record: { templateId: template.id, templateName: template.name, payload: fb, rawTranscript: trimmed },
            confidence: 0.4,
            latencyMs,
          };
        }

        // LLM explicitly flagged this as not a data entry.
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          (parsed as Record<string, unknown>).kind === 'invalid'
        ) {
          const reason = (parsed as Record<string, unknown>).reason;
          return {
            record: { templateId: template.id, templateName: template.name, payload: {}, rawTranscript: trimmed },
            confidence: 0,
            latencyMs,
            invalid: true,
            invalidReason: typeof reason === 'string' ? reason : 'Not a data entry',
          };
        }

        // Programmatic fallback: catch garbage field values the model forced in.
        if (isGarbagePayload(template, parsed)) {
          return {
            record: { templateId: template.id, templateName: template.name, payload: {}, rawTranscript: trimmed },
            confidence: 0,
            latencyMs,
            invalid: true,
            invalidReason: 'Could not extract valid fields from transcript',
          };
        }

        const v = validateParsedPayload(template, parsed);
        let payload = v.ok ? v.payload : fallbackPayload(template, trimmed);
        payload = applyMasterEnrichmentIfNeeded(template, trimmed, payload);
        return {
          record: { templateId: template.id, templateName: template.name, payload, rawTranscript: trimmed },
          confidence: v.ok ? 0.88 : 0.45,
          latencyMs,
        };
      } catch {
        const fb = applyMasterEnrichmentIfNeeded(template, trimmed, fallbackPayload(template, trimmed));
        return {
          record: { templateId: template.id, templateName: template.name, payload: fb, rawTranscript: trimmed },
          confidence: 0.35,
          latencyMs: 0,
        };
      }
    },
    [],
  );

  const parseVoice = useCallback(
    async (uri: string, template: Template): Promise<ParseResult | null> => {
      const isIos = Platform.OS === 'ios';
      try {
        const { transcript } = await transcribeAudioFile(
          uri,
          isIos ? 'capture.wav' : 'capture.m4a',
          isIos ? 'audio/wav' : 'audio/mp4',
        );
        return parseTranscript(transcript, template);
      } catch {
        return null;
      }
    },
    [parseTranscript],
  );

  const value = useMemo<VoiceParserContextValue>(
    () => ({
      parseVoice,
      parseTranscript,
      isReady,
      isLoading,
      downloadProgress: 1,
      error,
    }),
    [parseVoice, parseTranscript, isReady, isLoading, error],
  );

  return (
    <VoiceParserContext.Provider value={value}>{children}</VoiceParserContext.Provider>
  );
}

export function useVoiceParser(): VoiceParserContextValue {
  const ctx = useContext(VoiceParserContext);
  if (!ctx) throw new Error('useVoiceParser must be used within VoiceParserProvider');
  return ctx;
}
