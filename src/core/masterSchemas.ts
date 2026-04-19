import type { FieldDefinition, Template } from './schemas';

/** Logical type stored in Postgres / reflected in parser output. */
export type MasterFieldType = 'text' | 'integer' | 'real' | 'boolean';

export type MasterField = FieldDefinition & {
  /** Postgres-style column type for Supabase DDL. */
  pgType: 'text' | 'integer' | 'double precision' | 'boolean';
  valueType: MasterFieldType;
};

export type MasterSchema = {
  id: string;
  /** Human name for docs / UI. */
  displayName: string;
  /** Supabase table name (snake_case, one master table per schema). */
  supabaseTable: string;
  fields: MasterField[];
};

/**
 * One row in any master table shares these metadata columns (plus schema-specific fields).
 * Local SQLite stores a single `parsed_json` blob; sync expands `fields` into columns.
 */
export const MASTER_META_COLUMNS = [
  'id',
  'project_id',
  'raw_transcript',
  'confidence',
  'validated',
  'source',
  'template_id',
  'template_name',
  'created_at',
] as const;

const MASTER_REGISTRY: Record<string, MasterSchema> = {
  dolphin_observations: {
    id: 'dolphin_observations',
    displayName: 'Dolphin observations',
    supabaseTable: 'dolphin_observations',
    fields: [
      {
        key: 'observation_type',
        label: 'Type (e.g. dolphin)',
        pgType: 'text',
        valueType: 'text',
      },
      {
        key: 'dolphin_count',
        label: 'Dolphin count',
        pgType: 'integer',
        valueType: 'integer',
      },
      {
        key: 'location',
        label: 'Location',
        pgType: 'text',
        valueType: 'text',
      },
      {
        key: 'buoy',
        label: 'Buoy',
        pgType: 'text',
        valueType: 'text',
      },
    ],
  },
  coral_reef_health: {
    id: 'coral_reef_health',
    displayName: 'Coral reef health',
    supabaseTable: 'coral_reef_health',
    fields: [
      { key: 'site_area', label: 'Site / area', pgType: 'text', valueType: 'text' },
      { key: 'transect', label: 'Transect', pgType: 'text', valueType: 'text' },
      {
        key: 'coral_cover_pct',
        label: 'Estimated coral cover %',
        pgType: 'double precision',
        valueType: 'real',
      },
      {
        key: 'bleaching_level',
        label: 'Bleaching level (none / mild / moderate / severe)',
        pgType: 'text',
        valueType: 'text',
      },
      { key: 'notes', label: 'Notes', pgType: 'text', valueType: 'text' },
    ],
  },
};

export function listMasterSchemaIds(): string[] {
  return Object.keys(MASTER_REGISTRY);
}

export function getMasterSchema(id: string | undefined | null): MasterSchema | null {
  if (!id) return null;
  return MASTER_REGISTRY[id] ?? null;
}

export function masterSchemaToTemplate(schemaId: string): Template | null {
  const m = getMasterSchema(schemaId);
  if (!m) return null;
  const schemaDefinition: FieldDefinition[] = m.fields.map(f => ({
    key: f.key,
    label: f.label,
    valueType: f.valueType,
  }));
  return {
    id: `master-${m.id}`,
    name: m.displayName,
    type: 'database_entry',
    schemaDefinition,
  };
}

/** Coerce parser `fields` values toward schema types for DB / Supabase. */
export function coerceFieldValues(
  schemaId: string,
  fields: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> {
  const m = getMasterSchema(schemaId);
  if (!m) return fields;
  const out: Record<string, string | number | boolean | null> = {};
  for (const f of m.fields) {
    const v = fields[f.key];
    if (v === undefined) {
      out[f.key] = null;
      continue;
    }
    if (v === null) {
      out[f.key] = null;
      continue;
    }
    if (f.valueType === 'integer') {
      const n = typeof v === 'number' ? Math.round(v) : parseInt(String(v), 10);
      out[f.key] = Number.isFinite(n) ? n : null;
    } else if (f.valueType === 'real') {
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      out[f.key] = Number.isFinite(n) ? n : null;
    } else if (f.valueType === 'boolean') {
      out[f.key] = Boolean(v);
    } else {
      out[f.key] = typeof v === 'string' ? v : String(v);
    }
  }
  return out;
}
