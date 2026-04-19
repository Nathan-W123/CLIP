import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { useCactusLM } from 'cactus-react-native';
import type { Template } from '../core/schemas';
import { applyMasterEnrichmentIfNeeded } from '../core/enrichMasterPayload';
import { fallbackPayload, validateParsedPayload } from '../core/payloadValidation';
import { transcribeAudioFile } from '../services/transcribe';
import { getLearnedSchemaSnapshot } from '../services/schemaLearning';
import type { ParseResult } from './cactus';

const MODEL_ID =
  process.env.EXPO_PUBLIC_CACTUS_MODEL ?? 'google/gemma-4-E2B-it';

function extractJsonObject(text: string): string {
  let t = text.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)```$/m.exec(t);
  if (fenced) {
    t = fenced[1].trim();
  }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return t.slice(start, end + 1);
  }
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
- brand: manufacturer or Kirkland-style label spoken after "brand" or at start (e.g. Kirkland Signature, Charmin).
- product_type: category (toilet paper, chicken, beverages, snacks, frozen, …).
- product_name: specific line/SKU if stated after "called", "product name", or mid-phrase; else null.
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

function schemaIdFromTemplate(template: Template): string | null {
  if (template.type !== 'database_entry') return null;
  if (template.id.startsWith('master-')) return template.id.slice('master-'.length);
  return null;
}

export type VoiceParserContextValue = {
  parseVoice: (uri: string, template: Template) => Promise<ParseResult | null>;
  parseTranscript: (transcript: string, template: Template) => Promise<ParseResult | null>;
  isReady: boolean;
  isLoading: boolean;
  downloadProgress: number;
  error: string | null;
};

const VoiceParserContext = createContext<VoiceParserContextValue | null>(null);

export function VoiceParserProvider({ children }: { children: React.ReactNode }) {
  const {
    complete,
    init,
    download,
    isDownloaded,
    isDownloading,
    downloadProgress,
    isInitializing,
    error: lmError,
  } = useCactusLM({
    model: MODEL_ID,
    cacheIndex: false,
    options: { pro: false },
  });

  const [lmInitialized, setLmInitialized] = useState(false);

  useEffect(() => {
    if (isDownloaded || isDownloading) return;
    void download().catch(() => {});
  }, [isDownloaded, isDownloading, download]);

  useEffect(() => {
    let cancelled = false;
    if (!isDownloaded) return;
    (async () => {
      try {
        await init();
        if (!cancelled) setLmInitialized(true);
      } catch {
        if (!cancelled) setLmInitialized(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDownloaded, init]);

  const parseTranscript = useCallback(
    async (transcript: string, template: Template): Promise<ParseResult | null> => {
      const trimmed = transcript.trim();
      if (!trimmed) return null;
      const schemaId = schemaIdFromTemplate(template);
      const learned = getLearnedSchemaSnapshot(schemaId);
      const learnedBlock = learned
        ? `\nUse this historical extraction memory to improve recall on unstructured speech:\n${learned.promptSummary}\n`
        : '';

      const system = `You convert voice transcripts into structured JSON for an app template.
${jsonSchemaPrompt(template)}
${learnedBlock}
Rules: Output ONLY the JSON object. No markdown, no commentary.`;

      const messages = [
        { role: 'system' as const, content: system },
        {
          role: 'user' as const,
          content: `Transcript:\n${trimmed}`,
        },
      ];

      try {
        const result = await complete({
          messages,
          options: { temperature: 0, maxTokens: 1024 },
        });
        if (!result.success) {
          const fb = applyMasterEnrichmentIfNeeded(
            template,
            trimmed,
            fallbackPayload(template, trimmed),
          );
          return {
            record: {
              templateId: template.id,
              templateName: template.name,
              payload: fb,
              rawTranscript: trimmed,
            },
            confidence: 0.22,
            latencyMs: result.totalTimeMs ?? 0,
          };
        }
        const jsonText = extractJsonObject(result.response);
        let parsed: unknown;
        try {
          parsed = JSON.parse(jsonText);
        } catch {
          const fb = applyMasterEnrichmentIfNeeded(template, trimmed, fallbackPayload(template, trimmed));
          return {
            record: {
              templateId: template.id,
              templateName: template.name,
              payload: fb,
              rawTranscript: trimmed,
            },
            confidence: 0.4,
            latencyMs: 0,
          };
        }

        const v = validateParsedPayload(template, parsed);
        let payload = v.ok ? v.payload : fallbackPayload(template, trimmed);
        payload = applyMasterEnrichmentIfNeeded(template, trimmed, payload);
        const modelConf =
          typeof result.confidence === 'number' && !Number.isNaN(result.confidence)
            ? result.confidence
            : v.ok
              ? 0.88
              : 0.45;
        return {
          record: {
            templateId: template.id,
            templateName: template.name,
            payload,
            rawTranscript: trimmed,
          },
          confidence: modelConf,
          latencyMs: result.totalTimeMs ?? 0,
        };
      } catch {
        const fb = applyMasterEnrichmentIfNeeded(template, trimmed, fallbackPayload(template, trimmed));
        return {
          record: {
            templateId: template.id,
            templateName: template.name,
            payload: fb,
            rawTranscript: trimmed,
          },
          confidence: 0.35,
          latencyMs: 0,
        };
      }
    },
    [complete],
  );

  const parseVoice = useCallback(
    async (uri: string, template: Template): Promise<ParseResult | null> => {
      const isIos = Platform.OS === 'ios';
      const filename = isIos ? 'capture.wav' : 'capture.m4a';
      const mime = isIos ? 'audio/wav' : 'audio/mp4';
      try {
        const { transcript } = await transcribeAudioFile(uri, filename, mime);
        return parseTranscript(transcript, template);
      } catch {
        return null;
      }
    },
    [parseTranscript],
  );

  const isLoading = isDownloading || !isDownloaded || isInitializing || !lmInitialized;
  const isReady = isDownloaded && lmInitialized && !isInitializing && !isDownloading;

  const value = useMemo<VoiceParserContextValue>(
    () => ({
      parseVoice,
      parseTranscript,
      isReady,
      isLoading,
      downloadProgress,
      error: lmError,
    }),
    [
      parseVoice,
      parseTranscript,
      isReady,
      isLoading,
      downloadProgress,
      lmError,
    ],
  );

  return (
    <VoiceParserContext.Provider value={value}>{children}</VoiceParserContext.Provider>
  );
}

export function useVoiceParser(): VoiceParserContextValue {
  const ctx = useContext(VoiceParserContext);
  if (!ctx) {
    throw new Error('useVoiceParser must be used within VoiceParserProvider');
  }
  return ctx;
}
