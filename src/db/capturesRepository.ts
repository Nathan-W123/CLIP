import type { SQLiteDatabase } from 'expo-sqlite';
import type { ClipRecord } from '../core/schemas';

export type CaptureSource = 'voice_capture' | 'record_screen' | 'project_screen';

export async function insertCapture(
  db: SQLiteDatabase,
  row: ClipRecord,
  source: CaptureSource,
  projectId?: string | null,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO captures (
      id, template_id, template_name, project_id, raw_transcript, parsed_json,
      confidence, validated, synced, source, created_at, master_table
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    row.masterTable ?? null,
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
  master_table: string | null;
  sync_attempts?: number;
  last_sync_error?: string | null;
  next_sync_at?: string | null;
};

export async function listUnsyncedCaptures(db: SQLiteDatabase, limit = 50): Promise<CaptureRow[]> {
  const nowIso = new Date().toISOString();
  return db.getAllAsync<CaptureRow>(
    `SELECT * FROM captures
     WHERE synced = 0
       AND (next_sync_at IS NULL OR next_sync_at <= ?)
     ORDER BY COALESCE(next_sync_at, created_at) ASC, created_at ASC
     LIMIT ?`,
    nowIso,
    limit,
  );
}

export async function markCapturesSynced(db: SQLiteDatabase, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const ph = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE captures
     SET synced = 1,
         sync_attempts = 0,
         last_sync_error = NULL,
         next_sync_at = NULL
     WHERE id IN (${ph})`,
    ...ids,
  );
}

export async function markCapturesSyncFailed(
  db: SQLiteDatabase,
  ids: string[],
  error: string,
  retryAfterMs: number,
): Promise<void> {
  if (ids.length === 0) return;
  const ph = ids.map(() => '?').join(',');
  const nextSyncAt = new Date(Date.now() + retryAfterMs).toISOString();
  await db.runAsync(
    `UPDATE captures
     SET sync_attempts = COALESCE(sync_attempts, 0) + 1,
         last_sync_error = ?,
         next_sync_at = ?
     WHERE id IN (${ph})`,
    error.slice(0, 400),
    nextSyncAt,
    ...ids,
  );
}
