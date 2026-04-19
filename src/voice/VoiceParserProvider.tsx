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
import { fallbackPayload, validateParsedPayload } from '../core/payloadValidation';
import { transcribeAudioFile } from '../services/transcribe';
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
    case 'database_entry':
      return `Return a single JSON object only:
{"kind":"database_entry","fields":{"key":"value",...}}
Use string values unless clearly numeric or boolean.`;
    default:
      return '{"kind":"notes","body":"string"}';
  }
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

      const system = `You convert voice transcripts into structured JSON for an app template.
${jsonSchemaPrompt(template)}
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
        if (!result.success) return null;
        const jsonText = extractJsonObject(result.response);
        let parsed: unknown;
        try {
          parsed = JSON.parse(jsonText);
        } catch {
          const fb = fallbackPayload(template, trimmed);
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
        const payload = v.ok ? v.payload : fallbackPayload(template, trimmed);
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
        const fb = fallbackPayload(template, trimmed);
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
