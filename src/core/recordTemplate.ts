import type { SQLiteDatabase } from 'expo-sqlite';
import type { MockProject, ProjectType } from '../components/mock/types';
import { getTemplateFromDatabase } from '../db/templateSchemas';
import { getTemplateById } from './templates';
import { masterSchemaToTemplate } from './masterSchemas';
import type { Template } from './schemas';

function templateIdForProjectType(t: ProjectType): string {
  if (t === 'checklist') return 'tmpl-checklist';
  if (t === 'data_collection') return 'tmpl-data-collection';
  return 'tmpl-notes';
}

/**
 * Loads the voice/JSON template from the **SQLite template catalog** (seeded on migrate),
 * which mirrors master schemas and column types so Gemma sees the same headers locally.
 * Falls back to in-memory definitions if a row is missing.
 */
export async function resolveRecordTemplateAsync(
  db: SQLiteDatabase,
  project: MockProject,
): Promise<Template | null> {
  if (project.masterSchemaId) {
    const fromDb = await getTemplateFromDatabase(db, `master-${project.masterSchemaId}`);
    if (fromDb) return fromDb;
    const t = masterSchemaToTemplate(project.masterSchemaId);
    if (t) return t;
    console.warn('[recordTemplate] Unknown masterSchemaId', project.masterSchemaId);
    return null;
  }

  const tid = templateIdForProjectType(project.type);
  const fromDb = await getTemplateFromDatabase(db, tid);
  if (fromDb) return fromDb;
  return getTemplateById(tid);
}

/** Supabase + SQLite routing: non-null means upsert to that master table instead of legacy `captures`. */
export function resolveMasterTableForProject(project: MockProject): string | null {
  return project.masterSchemaId ?? null;
}
