import NetInfo from '@react-native-community/netinfo';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  countPendingSync,
  listUnsyncedCaptures,
  markCapturesSyncFailed,
  markCapturesSynced,
  type CaptureRow,
} from '../db/capturesRepository';
import { coerceFieldValues, getMasterSchema } from '../core/masterSchemas';
import { getSupabaseClient } from './supabaseClient';

const missingSupabaseTablesUntil = new Map<string, number>();
const MISSING_TABLE_RETRY_MS = 30_000;
const TRANSIENT_RETRY_MS = 8_000;
const MALFORMED_PAYLOAD_RETRY_MS = 60_000;

function parsePayloadJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function isDatabaseEntryPayload(
  p: unknown,
): p is { kind: 'database_entry'; fields: Record<string, string | number | boolean | null> } {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as { kind?: unknown; fields?: unknown };
  return (
    o.kind === 'database_entry' &&
    typeof o.fields === 'object' &&
    o.fields !== null &&
    !Array.isArray(o.fields)
  );
}

function buildLegacyUpsertPayload(r: CaptureRow) {
  const parsedJson = parsePayloadJson(r.parsed_json);
  return {
    id: r.id,
    template_id: r.template_id,
    template_name: r.template_name,
    project_id: r.project_id,
    raw_transcript: r.raw_transcript,
    parsed_json: (parsedJson && typeof parsedJson === 'object' ? parsedJson : {}) as Record<
      string,
      unknown
    >,
    confidence: r.confidence,
    validated: r.validated === 1,
    synced: true,
    source: r.source,
    created_at: r.created_at,
  };
}

function isMissingTableError(error: { message?: string | null; code?: string | null } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST205') return true;
  const message = (error.message ?? '').toLowerCase();
  return (
    message.includes('could not find the table') ||
    message.includes('relation') && message.includes('does not exist')
  );
}

function shouldSkipMissingTable(table: string): boolean {
  const until = missingSupabaseTablesUntil.get(table);
  if (!until) return false;
  if (Date.now() >= until) {
    missingSupabaseTablesUntil.delete(table);
    return false;
  }
  return true;
}

function markTableMissing(table: string): void {
  missingSupabaseTablesUntil.set(table, Date.now() + MISSING_TABLE_RETRY_MS);
}

/**
 * Push local captures: rows with `master_table` upsert into that Supabase table with typed columns;
 * others go to legacy `captures`.
 */
export async function trySyncCaptures(db: SQLiteDatabase): Promise<{ pushed: number }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { pushed: 0 };

  const net = await NetInfo.fetch();
  if (!net.isConnected) return { pushed: 0 };

  const rows = await listUnsyncedCaptures(db, 60);
  if (rows.length === 0) return { pushed: 0 };

  const syncedIds: string[] = [];
  const fallbackToLegacyRows: CaptureRow[] = [];

  const masterRows = rows.filter(r => r.master_table);
  const legacyRows = rows.filter(r => !r.master_table);

  for (const r of masterRows) {
    const schemaId = r.master_table!;
    const schema = getMasterSchema(schemaId);
    const table = schema?.supabaseTable ?? schemaId;
    if (shouldSkipMissingTable(table)) {
      await markCapturesSyncFailed(db, [r.id], `table '${table}' temporarily unavailable`, 5_000);
      continue;
    }
    const parsed = parsePayloadJson(r.parsed_json);
    if (!isDatabaseEntryPayload(parsed)) {
      console.warn('[syncCaptures] master row needs database_entry payload:', r.id);
      await markCapturesSyncFailed(
        db,
        [r.id],
        'master row missing database_entry payload shape',
        MALFORMED_PAYLOAD_RETRY_MS,
      );
      continue;
    }
    const fields = coerceFieldValues(schemaId, parsed.fields);
    const body: Record<string, unknown> = {
      id: r.id,
      project_id: r.project_id,
      raw_transcript: r.raw_transcript,
      confidence: r.confidence,
      validated: r.validated === 1,
      source: r.source,
      template_id: r.template_id,
      template_name: r.template_name,
      created_at: r.created_at,
      ...fields,
    };

    const { error } = await supabase.from(table).upsert(body, { onConflict: 'id' });
    if (error) {
      if (isMissingTableError(error)) {
        markTableMissing(table);
        console.warn(`[syncCaptures] skipping missing Supabase table '${table}'. Run SQL migrations first.`);
        fallbackToLegacyRows.push(r);
        continue;
      }
      console.warn('[syncCaptures]', table, error.message);
      await markCapturesSyncFailed(
        db,
        [r.id],
        `[${table}] ${error.message ?? 'supabase upsert failed'}`,
        TRANSIENT_RETRY_MS,
      );
      continue;
    }
    missingSupabaseTablesUntil.delete(table);
    syncedIds.push(r.id);
  }

  const allLegacyRows = [...legacyRows, ...fallbackToLegacyRows];

  if (allLegacyRows.length > 0) {
    if (shouldSkipMissingTable('captures')) {
      await markCapturesSyncFailed(
        db,
        allLegacyRows.map(r => r.id),
        "table 'captures' temporarily unavailable",
        5_000,
      );
      return { pushed: syncedIds.length };
    }
    const payload = allLegacyRows.map(buildLegacyUpsertPayload);
    const { error } = await supabase.from('captures').upsert(payload, {
      onConflict: 'id',
    });
    if (error) {
      if (isMissingTableError(error)) {
        markTableMissing('captures');
        console.warn("[syncCaptures] skipping missing Supabase table 'captures'. Run SQL migrations first.");
        await markCapturesSyncFailed(
          db,
          allLegacyRows.map(r => r.id),
          "missing table 'captures'",
          MISSING_TABLE_RETRY_MS,
        );
      } else {
        console.warn('[syncCaptures]', 'captures', error.message);
        await markCapturesSyncFailed(
          db,
          allLegacyRows.map(r => r.id),
          `[captures] ${error.message ?? 'supabase upsert failed'}`,
          TRANSIENT_RETRY_MS,
        );
      }
    } else {
      missingSupabaseTablesUntil.delete('captures');
      syncedIds.push(...allLegacyRows.map(r => r.id));
    }
  }

  if (syncedIds.length === 0) return { pushed: 0 };

  await markCapturesSynced(db, syncedIds);
  return { pushed: syncedIds.length };
}

/**
 * Drain local queue quickly when connectivity is available.
 * Stops when no rows were pushed in a pass, or when max passes is reached.
 */
export async function flushPendingCaptures(
  db: SQLiteDatabase,
  maxPasses = 20,
): Promise<{ pushed: number; passes: number }> {
  let pushedTotal = 0;
  let passes = 0;

  while (passes < maxPasses) {
    passes += 1;
    const { pushed } = await trySyncCaptures(db);
    pushedTotal += pushed;
    if (pushed === 0) {
      const pending = await countPendingSync(db);
      if (pending === 0) break;
      if (passes >= 3) break;
      continue;
    }
  }

  return { pushed: pushedTotal, passes };
}
