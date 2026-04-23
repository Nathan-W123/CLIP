import type { Template } from '../core/schemas';
import { applyMasterEnrichmentIfNeeded } from '../core/enrichMasterPayload';
import { fallbackPayload } from '../core/payloadValidation';
import type { ParseResult } from './cactus';

/**
 * Structured parse without LLM: heuristics + template fallback only.
 * Used when the Clip backend is unreachable or transcript came from on-device STT.
 */
export function parseTranscriptHeuristic(
  transcript: string,
  template: Template,
): ParseResult | null {
  const trimmed = transcript.trim();
  if (!trimmed) return null;

  const payload = applyMasterEnrichmentIfNeeded(
    template,
    trimmed,
    fallbackPayload(template, trimmed),
  );

  return {
    record: {
      templateId: template.id,
      templateName: template.name,
      payload,
      rawTranscript: trimmed,
    },
    confidence: 0.42,
    latencyMs: 0,
  };
}
