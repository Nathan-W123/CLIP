import type { SQLiteDatabase } from 'expo-sqlite';
import type { ClipRecord } from '../core/schemas';

export type CaptureSource = 'voice_capture' | 'record_screen';

export async function insertCapture(
  db: SQLiteDatabase,
  row: ClipRecord,
  source: CaptureSource,
  projectId?: string | null,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO captures (
      id, template_id, template_name, project_id, raw_transcript, parsed_json,
      confidence, validated, synced, source, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id,
    row.templateId,
    row.templateName,
    projectId ?? null,
    row.rawTranscript,
    JSON.stringify(row.payload),
    row.confidenceScore,
    row.validated ? 1 : 0,
    row.synced ? 1 : 0,
    source,
    row.capturedAt,
  );
}

export async function countPendingSync(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM captures WHERE synced = 0`,
  );
  return row?.c ?? 0;
}

export type CaptureRow = {
  id: string;
  template_id: string;
  template_name: string;
  project_id: string | null;
  raw_transcript: string;
  parsed_json: string;
  confidence: number;
  validated: number;
  synced: number;
  source: string;
  created_at: string;
};

export async function listUnsyncedCaptures(db: SQLiteDatabase, limit = 50): Promise<CaptureRow[]> {
  return db.getAllAsync<CaptureRow>(
    `SELECT * FROM captures WHERE synced = 0 ORDER BY created_at ASC LIMIT ?`,
    limit,
  );
}

export async function markCapturesSynced(db: SQLiteDatabase, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const ph = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE captures SET synced = 1 WHERE id IN (${ph})`,
    ...ids,
  );
}
