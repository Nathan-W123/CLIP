import type { SQLiteDatabase } from 'expo-sqlite';
import type { DataQualityIssue } from '../core/dataQuality';
import type { Template } from '../core/schemas';
import { runNumericStatScreening } from '../core/runDataQualityAnalysis';
import { getMasterSchema, listMasterSchemaIds } from '../core/masterSchemas';
import { speakText } from './tts';

function isMissingFieldValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return !v.trim();
  if (typeof v === 'number') return !Number.isFinite(v);
  return false;
}

function databaseEntryFieldDescriptors(template: Template): { key: string; label: string }[] {
  if (template.type !== 'database_entry') return [];
  if (template.schemaDefinition?.length) {
    return template.schemaDefinition.map(f => ({ key: f.key, label: f.label }));
  }
  if (template.id.startsWith('master-')) {
    const m = getMasterSchema(template.id.slice('master-'.length));
    if (m) return m.fields.map(f => ({ key: f.key, label: f.label }));
  }
  for (const schemaId of listMasterSchemaIds()) {
    if (
      template.id === schemaId ||
      template.id === `master-${schemaId}` ||
      template.id.endsWith(`-${schemaId}`) ||
      template.id.endsWith(`_${schemaId}`)
    ) {
      const m = getMasterSchema(schemaId);
      if (m) return m.fields.map(f => ({ key: f.key, label: f.label }));
    }
  }
  return [];
}

/** Human-readable labels for schema fields that are null / empty / non-finite number. */
export function missingDatabaseEntryLabels(template: Template, payload: unknown): string[] {
  if (template.type !== 'database_entry') return [];
  const p = payload as { kind?: string; fields?: unknown };
  if (p?.kind !== 'database_entry' || typeof p.fields !== 'object' || p.fields === null) {
    return [];
  }
  const fields = p.fields as Record<string, unknown>;
  const descriptors = databaseEntryFieldDescriptors(template);
  if (descriptors.length === 0) return [];

  const missing: string[] = [];
  for (const { key, label } of descriptors) {
    if (key === 'raw') continue;
    if (isMissingFieldValue(fields[key])) {
      missing.push(label);
    }
  }
  return missing;
}

function buildAnomalySpeech(issues: DataQualityIssue[]): string | null {
  const flagged = issues.filter(
    i => i.source === 'stats' && (i.severity === 'warn' || i.severity === 'error'),
  );
  if (flagged.length === 0) return null;
  const bits = flagged.map(i => {
    const sev = i.severity === 'error' ? 'well outside' : 'somewhat outside';
    return `${i.fieldLabel} is ${sev} your usual range for this category`;
  });
  return `Statistical check: ${bits.join('; ')}. Please confirm those numbers are correct.`;
}

/**
 * After a successful save: TTS for missing fields, stratified numeric outlier warnings
 * (Tukey/IQR vs prior SQLite captures in the same template + category bucket), then a short ack.
 * Run after `insertCapture` so `excludeCaptureId` can omit the new row from its own baseline.
 */
export async function speakSavedCaptureFeedback(
  db: SQLiteDatabase,
  template: Template,
  payload: unknown,
  transcriptPreview: string,
  options?: { excludeCaptureId?: string },
): Promise<void> {
  const parts: string[] = [];
  const missing = missingDatabaseEntryLabels(template, payload);
  if (missing.length === 1) {
    parts.push(`Saved, but ${missing[0]} was missing. Please say it clearly next time.`);
  } else if (missing.length > 1) {
    parts.push(`Saved, but these were missing: ${missing.join(', ')}. Please include them next time.`);
  }

  if (template.type === 'database_entry') {
    try {
      const dq = await runNumericStatScreening(template, payload, db, options);
      const anomaly = buildAnomalySpeech(dq.issues);
      if (anomaly) parts.push(anomaly);
    } catch {
      /* ignore DB / analysis errors */
    }
  }

  if (parts.length === 0) {
    parts.push(transcriptPreview.trim().slice(0, 120) || 'Saved.');
  }

  void speakText(parts.join(' ').slice(0, 500)).catch(() => {});
}
