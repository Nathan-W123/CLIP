import type { SQLiteDatabase } from 'expo-sqlite';
import { getMasterSchema } from '../core/masterSchemas';
import type { CaptureRow } from '../db/capturesRepository';
import { getSupabaseClient } from './supabaseClient';

/**
 * Deletes the most recent `voice_capture` row for this template (local SQLite),
 * and if it was already synced, attempts the same delete in Supabase.
 */
export async function retractLastVoiceEntry(
  db: SQLiteDatabase,
  templateId: string,
): Promise<{ ok: boolean; deleted?: CaptureRow; message: string }> {
  const row = await db.getFirstAsync<CaptureRow>(
    `SELECT * FROM captures
     WHERE source = 'voice_capture' AND template_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    templateId,
  );

  if (!row) {
    return { ok: false, message: 'No voice captures to remove for this template.' };
  }

  await db.runAsync(`DELETE FROM captures WHERE id = ?`, row.id);

  const supabase = getSupabaseClient();
  if (supabase && row.synced === 1) {
    try {
      if (row.master_table) {
        const schema = getMasterSchema(row.master_table);
        const table = schema?.supabaseTable ?? row.master_table;
        const { error } = await supabase.from(table).delete().eq('id', row.id);
        if (error) {
          console.warn('[retractCapture] Supabase master delete:', error.message);
        }
      } else {
        const { error } = await supabase.from('captures').delete().eq('id', row.id);
        if (error) {
          console.warn('[retractCapture] Supabase captures delete:', error.message);
        }
      }
    } catch (e) {
      console.warn('[retractCapture] cloud delete failed', e);
    }
  }

  return {
    ok: true,
    deleted: row,
    message: 'Removed your last voice entry for this template.',
  };
}
