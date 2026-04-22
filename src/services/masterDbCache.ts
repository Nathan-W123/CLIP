import type { SQLiteDatabase } from 'expo-sqlite';
import { listMasterSchemaIds, getMasterSchema } from '../core/masterSchemas';
import { getSupabaseClient } from './supabaseClient';

type FieldRow = Record<string, unknown>;

// keyed by master_table / schema id (e.g. 'costco_inventory')
const rowCache = new Map<string, FieldRow[]>();

/**
 * On startup, read up to 400 recent rows per master table from local SQLite.
 * Runs offline — does not require network.
 */
export async function loadMasterDbCache(db: SQLiteDatabase): Promise<void> {
  const tables = await db.getAllAsync<{ master_table: string }>(
    `SELECT DISTINCT master_table FROM captures WHERE master_table IS NOT NULL`,
  );

  for (const { master_table } of tables) {
    const rows = await db.getAllAsync<{ parsed_json: string }>(
      `SELECT parsed_json FROM captures
       WHERE master_table = ?
       ORDER BY created_at DESC
       LIMIT 400`,
      master_table,
    );

    const parsed: FieldRow[] = [];
    for (const r of rows) {
      try {
        const obj = JSON.parse(r.parsed_json) as unknown;
        if (
          typeof obj === 'object' &&
          obj !== null &&
          'fields' in obj &&
          typeof (obj as { fields: unknown }).fields === 'object'
        ) {
          parsed.push((obj as { fields: FieldRow }).fields);
        }
      } catch {
        // skip malformed rows
      }
    }

    if (parsed.length > 0) {
      rowCache.set(master_table, parsed);
    }
  }
}

/**
 * When online, pull up to 400 rows from each Supabase master table and merge
 * into the cache. Supabase rows supplement (or seed) the local SQLite rows.
 */
export async function syncMasterDbCacheFromSupabase(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  for (const schemaId of listMasterSchemaIds()) {
    const schema = getMasterSchema(schemaId);
    if (!schema) continue;

    const cols = schema.fields.map(f => f.key).join(', ');
    try {
      const { data } = await supabase
        .from(schema.supabaseTable)
        .select(cols)
        .order('created_at', { ascending: false })
        .limit(400);

      if (!Array.isArray(data) || data.length === 0) continue;

      const existing = rowCache.get(schemaId) ?? [];
      // Supabase rows first (most authoritative/recent), then any local-only rows
      const merged = [...(data as FieldRow[]), ...existing].slice(0, 400);
      rowCache.set(schemaId, merged);
    } catch {
      // Ignore per-table errors; continue with other tables.
    }
  }
}

export function getMasterDbRows(masterTable: string | null | undefined): FieldRow[] {
  if (!masterTable) return [];
  return rowCache.get(masterTable) ?? [];
}

/**
 * Returns a prompt block showing up to `sampleSize` real entries from the
 * master DB cache. Empty string when the cache has no rows for that table.
 */
export function getMasterDbPromptBlock(
  masterTable: string | null | undefined,
  sampleSize = 8,
): string {
  const rows = getMasterDbRows(masterTable);
  if (rows.length === 0) return '';
  const sample = rows.slice(0, sampleSize);
  const lines = sample.map((r, i) => `Row ${i + 1}: ${JSON.stringify(r)}`).join('\n');
  return `Existing entries in this database (use as format and value reference):\n${lines}`;
}
