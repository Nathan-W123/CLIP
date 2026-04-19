import type { ClipRecord } from './schemas';

/** Minimal validation — extend when backend/SQLite rules are wired. */
export function validateRecord(record: ClipRecord): { valid: boolean; errors?: string[] } {
  const base = Boolean(
    record.templateId && record.templateName && record.capturedAt,
  );
  if (!base) {
    return { valid: false, errors: ['missing required fields'] };
  }
  if (record.payload === undefined || record.payload === null) {
    return { valid: false, errors: ['missing payload'] };
  }
  return { valid: true };
}
