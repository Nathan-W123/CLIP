-- Catalog of database-entry templates: synced to the app SQLite `template_schemas` table.
-- After editing in SQL Editor, open the app (online) so devices pull updates via syncTemplateCatalogFromSupabase.

create table if not exists public.template_catalog (
  id text primary key,
  master_schema_id text not null unique,
  display_name text not null,
  supabase_table text not null,
  fields_json jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.template_catalog is 'Voice/database-entry templates mirrored locally for Gemma + capture routing';

alter table public.template_catalog enable row level security;

drop policy if exists "template_catalog_anon_select" on public.template_catalog;
drop policy if exists "template_catalog_anon_insert" on public.template_catalog;
drop policy if exists "template_catalog_anon_update" on public.template_catalog;

create policy "template_catalog_anon_select" on public.template_catalog for select to anon using (true);
create policy "template_catalog_anon_insert" on public.template_catalog for insert to anon with check (true);
create policy "template_catalog_anon_update" on public.template_catalog for update to anon using (true) with check (true);

-- Dolphin observations (matches dolphin_observations master table).
insert into public.template_catalog (id, master_schema_id, display_name, supabase_table, fields_json)
values (
  'master-dolphin_observations',
  'dolphin_observations',
  'Dolphin observations',
  'dolphin_observations',
  '[
    {"key":"observation_type","label":"Type (e.g. dolphin)","valueType":"text","pgType":"text"},
    {"key":"dolphin_count","label":"Dolphin count","valueType":"integer","pgType":"integer"},
    {"key":"location","label":"Location","valueType":"text","pgType":"text"},
    {"key":"buoy","label":"Buoy","valueType":"text","pgType":"text"}
  ]'::jsonb
)
on conflict (id) do update set
  master_schema_id = excluded.master_schema_id,
  display_name = excluded.display_name,
  supabase_table = excluded.supabase_table,
  fields_json = excluded.fields_json,
  updated_at = now();

-- Coral reef health (matches coral_reef_health master table).
insert into public.template_catalog (id, master_schema_id, display_name, supabase_table, fields_json)
values (
  'master-coral_reef_health',
  'coral_reef_health',
  'Coral reef health',
  'coral_reef_health',
  '[
    {"key":"site_area","label":"Site / area","valueType":"text","pgType":"text"},
    {"key":"transect","label":"Transect","valueType":"text","pgType":"text"},
    {"key":"coral_cover_pct","label":"Estimated coral cover %","valueType":"real","pgType":"double precision"},
    {"key":"bleaching_level","label":"Bleaching level (none / mild / moderate / severe)","valueType":"text","pgType":"text"},
    {"key":"notes","label":"Notes","valueType":"text","pgType":"text"}
  ]'::jsonb
)
on conflict (id) do update set
  master_schema_id = excluded.master_schema_id,
  display_name = excluded.display_name,
  supabase_table = excluded.supabase_table,
  fields_json = excluded.fields_json,
  updated_at = now();
