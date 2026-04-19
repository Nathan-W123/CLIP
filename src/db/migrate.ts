import type { SQLiteDatabase } from 'expo-sqlite';

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
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_captures_synced ON captures(synced);
    CREATE INDEX IF NOT EXISTS idx_captures_created ON captures(created_at);
  `);
}
