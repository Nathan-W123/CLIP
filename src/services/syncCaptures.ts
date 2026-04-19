import NetInfo from '@react-native-community/netinfo';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  listUnsyncedCaptures,
  markCapturesSynced,
  type CaptureRow,
} from '../db/capturesRepository';
import { coerceFieldValues, getMasterSchema } from '../core/masterSchemas';
import { getSupabaseClient } from './supabaseClient';

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
  return {
    id: r.id,
    template_id: r.template_id,
    template_name: r.template_name,
    project_id: r.project_id,
    raw_transcript: r.raw_transcript,
    parsed_json: JSON.parse(r.parsed_json) as Record<string, unknown>,
    confidence: r.confidence,
    validated: r.validated === 1,
    synced: true,
    source: r.source,
    created_at: r.created_at,
  };
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

  const masterRows = rows.filter(r => r.master_table);
  const legacyRows = rows.filter(r => !r.master_table);

  for (const r of masterRows) {
    const schemaId = r.master_table!;
    const schema = getMasterSchema(schemaId);
    const table = schema?.supabaseTable ?? schemaId;
    const parsed = parsePayloadJson(r.parsed_json);
    if (!isDatabaseEntryPayload(parsed)) {
      console.warn('[syncCaptures] master row needs database_entry payload:', r.id);
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
      console.warn('[syncCaptures]', table, error.message);
      continue;
    }
    syncedIds.push(r.id);
  }

  if (legacyRows.length > 0) {
    const payload = legacyRows.map(buildLegacyUpsertPayload);
    const { error } = await supabase.from('captures').upsert(payload, {
      onConflict: 'id',
    });
    if (error) {
      console.warn('[syncCaptures]', 'captures', error.message);
    } else {
      syncedIds.push(...legacyRows.map(r => r.id));
    }
  }

  if (syncedIds.length === 0) return { pushed: 0 };

  await markCapturesSynced(db, syncedIds);
  return { pushed: syncedIds.length };
}
