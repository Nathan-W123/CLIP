import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateTemplateSchemas } from './templateSchemas';

type PragmaColumn = { name: string };

async function tableHasColumn(
  db: SQLiteDatabase,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = await db.getAllAsync<PragmaColumn>(`PRAGMA table_info(${table})`);
  return rows.some(r => r.name === column);
}

export async function migrateDb(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS captures (
      id TEXT PRIMARY KEY NOT NULL,
      template_id TEXT NOT NULL,
      template_name TEXT NOT NULL,
      project_id TEXT,
      raw_transcript TEXT NOT NULL,
      parsed_json TEXT NOT NULL,
      confidence REAL NOT NULL,
      validated INTEGER NOT NULL DEFAULT 0,
      synced INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      master_table TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_captures_synced ON captures(synced);
    CREATE INDEX IF NOT EXISTS idx_captures_created ON captures(created_at);
  `);

  if (!(await tableHasColumn(db, 'captures', 'master_table'))) {
    await db.execAsync(`ALTER TABLE captures ADD COLUMN master_table TEXT`);
  }
  if (!(await tableHasColumn(db, 'captures', 'sync_attempts'))) {
    await db.execAsync(`ALTER TABLE captures ADD COLUMN sync_attempts INTEGER NOT NULL DEFAULT 0`);
  }
  if (!(await tableHasColumn(db, 'captures', 'last_sync_error'))) {
    await db.execAsync(`ALTER TABLE captures ADD COLUMN last_sync_error TEXT`);
  }
  if (!(await tableHasColumn(db, 'captures', 'next_sync_at'))) {
    await db.execAsync(`ALTER TABLE captures ADD COLUMN next_sync_at TEXT`);
  }

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_captures_master ON captures(master_table);
    CREATE INDEX IF NOT EXISTS idx_captures_next_sync ON captures(next_sync_at);
  `);

  await migrateTemplateSchemas(db);
}
