import type { SQLiteDatabase } from 'expo-sqlite';
import type { FieldDefinition } from '../core/schemas';
import type { Template } from '../core/schemas';

/** Parsed database_entry.fields from payload JSON. */
export function extractDatabaseFields(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as { kind?: unknown; fields?: unknown };
  if (p.kind !== 'database_entry') return null;
  if (typeof p.fields !== 'object' || p.fields === null || Array.isArray(p.fields)) return null;
  return p.fields as Record<string, unknown>;
}

export function isNumericFieldDef(d: FieldDefinition): boolean {
  return d.valueType === 'integer' || d.valueType === 'real';
}

/** Text / categorical keys used to bucket rows (e.g. product type, brand). */
export function stratifierKeysFromTemplate(template: Template): string[] {
  if (template.type !== 'database_entry') return [];
  return (template.schemaDefinition ?? [])
    .filter(d => !isNumericFieldDef(d))
    .map(d => d.key);
}

export function numericKeysFromTemplate(template: Template): string[] {
  if (template.type !== 'database_entry') return [];
  return (template.schemaDefinition ?? []).filter(isNumericFieldDef).map(d => d.key);
}

function normStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim().toLowerCase();
}

/** Whether historical row matches current stratification bucket (same category attributes). */
export function rowMatchesStratum(
  histFields: Record<string, unknown>,
  stratKeys: string[],
  bucket: Record<string, unknown>,
): boolean {
  if (stratKeys.length === 0) return true;
  for (const k of stratKeys) {
    if (normStr(histFields[k]) !== normStr(bucket[k])) return false;
  }
  return true;
}

function parseNumeric(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Collect prior numeric samples for `numericKey` within the same categorical bucket as `currentFields`.
 * Scoped to the same `template_id` so different projects using the same master table share history.
 */
export async function collectStratumNumericSamples(
  db: SQLiteDatabase,
  templateId: string,
  currentFields: Record<string, unknown>,
  numericKey: string,
  stratKeys: string[],
  excludeCaptureId?: string,
  scanLimit = 450,
): Promise<number[]> {
  const bucket: Record<string, unknown> = {};
  for (const k of stratKeys) {
    bucket[k] = currentFields[k];
  }

  const rows = await db.getAllAsync<{ id: string; parsed_json: string }>(
    `SELECT id, parsed_json FROM captures
     WHERE template_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    templateId,
    scanLimit,
  );

  const out: number[] = [];
  for (const row of rows) {
    if (excludeCaptureId && row.id === excludeCaptureId) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.parsed_json);
    } catch {
      continue;
    }
    const fields = extractDatabaseFields(parsed);
    if (!fields) continue;
    if (!rowMatchesStratum(fields, stratKeys, bucket)) continue;
    const n = parseNumeric(fields[numericKey]);
    if (n !== null) out.push(n);
  }

  return out;
}

/** Tukey-style fence with wide multiplier — flags only extreme outliers within the bucket. */
export function isExtremeNumericOutlier(samples: number[], candidate: number): boolean {
  if (samples.length < 4) return false;
  const sorted = [...samples].sort((a, b) => a - b);
  const qIdx = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];
  const q1 = qIdx(0.25);
  const q3 = qIdx(0.75);
  const iqr = q3 - q1;
  const med = qIdx(0.5);

  if (iqr === 0) {
    return Math.abs(candidate - med) > 1e-9 && Math.abs(candidate - med) >= Math.max(Math.abs(med) * 0.5, 10);
  }

  const mult = 3;
  const low = q1 - mult * iqr;
  const high = q3 + mult * iqr;
  return candidate < low || candidate > high;
}

export function summarizeSamplesForPrompt(label: string, values: number[]): string {
  if (values.length === 0) {
    return `${label}: no prior samples in this bucket (new category).`;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mid = sorted[Math.floor(sorted.length / 2)];
  const tail = sorted.slice(-8).map(v => (Number.isInteger(v) ? String(v) : v.toFixed(2)));
  return `${label}: n=${values.length}, min=${min}, median≈${mid}, max=${max}, recent=${tail.join(', ')}`;
}
