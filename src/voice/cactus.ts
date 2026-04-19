// Types for on-device parse results (Gemma / Cactus). Stub hook fills these today.

export interface ParseResult {
  record: {
    templateId: string;
    templateName: string;
    payload: unknown;
    rawTranscript: string;
  };
  confidence: number;
  latencyMs: number;
}
