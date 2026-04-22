// Types for voice parse results.

export interface ParseResult {
  record: {
    templateId: string;
    templateName: string;
    payload: unknown;
    rawTranscript: string;
  };
  confidence: number;
  latencyMs: number;
  /** True when the LLM determined the transcript is not a valid data entry. */
  invalid?: boolean;
  invalidReason?: string;
}
