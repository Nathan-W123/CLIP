import NetInfo from '@react-native-community/netinfo';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  listUnsyncedCaptures,
  markCapturesSynced,
} from '../db/capturesRepository';
import { getSupabaseClient } from './supabaseClient';

/**
 * Push local captures to Supabase (table `captures`).
 *
 * Schema: run `supabase/captures.sql` in the Supabase SQL Editor (tables + RLS).
 */
export async function trySyncCaptures(db: SQLiteDatabase): Promise<{ pushed: number }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { pushed: 0 };

  const net = await NetInfo.fetch();
  if (!net.isConnected) return { pushed: 0 };

  const rows = await listUnsyncedCaptures(db, 40);
  if (rows.length === 0) return { pushed: 0 };

  const payload = rows.map((r) => ({
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
  }));

  const { error } = await supabase.from('captures').upsert(payload, {
    onConflict: 'id',
  });

  if (error) {
    console.warn('[syncCaptures]', error.message);
    return { pushed: 0 };
  }

  await markCapturesSynced(
    db,
    rows.map((r) => r.id),
  );
  return { pushed: rows.length };
}
