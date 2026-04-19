import type { SQLiteDatabase } from 'expo-sqlite';
import { getSupabaseClient } from './supabaseClient';

type TemplateCatalogRow = {
  id: string;
  master_schema_id: string;
  display_name: string;
  supabase_table: string;
  fields_json: unknown;
};

/**
 * Pull rows from Supabase `template_catalog` and upsert into local `template_schemas`
 * so the device has the same DB-entry templates as the server (fields + target table).
 */
export async function syncTemplateCatalogFromSupabase(
  db: SQLiteDatabase,
): Promise<{ upserted: number; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { upserted: 0, error: 'Supabase not configured' };
  }

  const { data, error } = await supabase.from('template_catalog').select('*');

  if (error) {
    return { upserted: 0, error: error.message };
  }

  const rows = (data ?? []) as TemplateCatalogRow[];
  let n = 0;

  for (const row of rows) {
    if (
      !row.id ||
      !row.master_schema_id ||
      !row.display_name ||
      !row.supabase_table ||
      row.fields_json === undefined ||
      row.fields_json === null
    ) {
      continue;
    }

    const fieldsJson =
      typeof row.fields_json === 'string'
        ? row.fields_json
        : JSON.stringify(row.fields_json);

    await db.runAsync(
      `INSERT OR REPLACE INTO template_schemas (
        id, display_name, template_kind, master_schema_id, fields_json, prompt_hint, supabase_table
      ) VALUES (?, ?, 'database_entry', ?, ?, NULL, ?)`,
      row.id,
      row.display_name,
      row.master_schema_id,
      fieldsJson,
      row.supabase_table,
    );
    n += 1;
  }

  return { upserted: n };
}
