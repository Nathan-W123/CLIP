import { getSupabaseClient } from './supabaseClient';
import NetInfo from '@react-native-community/netinfo';

type TemplateCatalogLite = {
  id: string;
  master_schema_id: string;
  display_name: string;
  supabase_table: string;
  fields_json: unknown;
};

type LearnedFieldProfile = {
  key: string;
  valueType?: string;
  textExamples: string[];
};

type LearnedFieldDef = {
  key: string;
  label?: string;
  valueType?: string;
};

export type LearnedSchemaSnapshot = {
  schemaId: string;
  displayName: string;
  table: string;
  promptSummary: string;
  fields: Record<string, LearnedFieldProfile>;
};

const cache = new Map<string, LearnedSchemaSnapshot>();

function normalizeSpace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function parseFieldDefs(
  fieldsJson: unknown,
): LearnedFieldDef[] {
  const raw =
    typeof fieldsJson === 'string'
      ? (JSON.parse(fieldsJson) as unknown)
      : fieldsJson;
  if (!Array.isArray(raw)) return [];
  const out: LearnedFieldDef[] = [];
  for (const v of raw) {
    if (typeof v !== 'object' || v === null) continue;
    const r = v as { key?: unknown; label?: unknown; valueType?: unknown };
    if (typeof r.key !== 'string' || !r.key.trim()) continue;
    out.push({
      key: r.key,
      label: typeof r.label === 'string' ? r.label : undefined,
      valueType: typeof r.valueType === 'string' ? r.valueType : undefined,
    });
  }
  return out;
}

function profileToSummary(profile: LearnedFieldProfile): string {
  if (profile.textExamples.length === 0) {
    return `${profile.key}: no prior text examples`;
  }
  return `${profile.key}: examples ${profile.textExamples.join(', ')}`;
}

/**
 * Build a lightweight schema-memory cache from Supabase rows.
 * Intended to run at app start and occasionally on refresh.
 */
export async function refreshLearnedSchemaCacheFromSupabase(): Promise<void> {
  const net = await NetInfo.fetch();
  if (!net.isConnected) return;

  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { data, error } = await supabase
    .from('template_catalog')
    .select('id, master_schema_id, display_name, supabase_table, fields_json');
  if (error || !Array.isArray(data)) return;

  for (const row of data as TemplateCatalogLite[]) {
    try {
      const defs = parseFieldDefs(row.fields_json);
      if (!row.master_schema_id || !row.supabase_table || defs.length === 0) continue;

      const selectCols = defs.map(d => d.key).join(', ');
      const { data: rows } = await supabase
        .from(row.supabase_table)
        .select(selectCols)
        .order('created_at', { ascending: false })
        .limit(250);

      const byField: Record<string, LearnedFieldProfile> = {};
      for (const d of defs) {
        byField[d.key] = {
          key: d.key,
          valueType: d.valueType,
          textExamples: [],
        };
      }

      if (Array.isArray(rows)) {
        for (const r of rows as unknown[]) {
          if (typeof r !== 'object' || r === null) continue;
          const rowObj = r as Record<string, unknown>;
          for (const d of defs) {
            const v = rowObj[d.key];
            if (typeof v !== 'string') continue;
            const s = normalizeSpace(v);
            if (!s) continue;
            const p = byField[d.key];
            if (!p) continue;
            if (!p.textExamples.some(x => x.toLowerCase() === s.toLowerCase())) {
              p.textExamples.push(s);
            }
            if (p.textExamples.length > 20) {
              p.textExamples = p.textExamples.slice(0, 20);
            }
          }
        }
      }

      const promptSummary = [
        `Historical schema memory for ${row.display_name} (${row.master_schema_id})`,
        ...defs.map(d => profileToSummary(byField[d.key])),
      ].join('\n');

      cache.set(row.master_schema_id, {
        schemaId: row.master_schema_id,
        displayName: row.display_name,
        table: row.supabase_table,
        promptSummary,
        fields: byField,
      });
    } catch {
      // Ignore malformed rows and continue learning from valid templates.
    }
  }
}

export function getLearnedSchemaSnapshot(
  schemaId: string | null | undefined,
): LearnedSchemaSnapshot | null {
  if (!schemaId) return null;
  return cache.get(schemaId) ?? null;
}
