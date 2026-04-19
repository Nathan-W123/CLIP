-- Per–data-model master tables (run in Supabase SQL Editor after legacy captures.sql if you use it).
-- Rows from projects with matching masterSchemaId upsert here; see src/core/masterSchemas.ts.

-- Dolphin Observations — all Dolphin-style projects sync to this table.
create table if not exists public.dolphin_observations (
  id text primary key,
  project_id text,
  raw_transcript text not null,
  observation_type text,
  dolphin_count integer,
  location text,
  buoy text,
  confidence double precision not null,
  validated boolean not null,
  source text not null,
  template_id text not null,
  template_name text not null,
  created_at timestamptz not null
);

create index if not exists idx_dolphin_obs_project on public.dolphin_observations (project_id);
create index if not exists idx_dolphin_obs_created on public.dolphin_observations (created_at desc);

-- Coral reef health — all coral-reef master projects sync here.
create table if not exists public.coral_reef_health (
  id text primary key,
  project_id text,
  raw_transcript text not null,
  site_area text,
  transect text,
  coral_cover_pct double precision,
  bleaching_level text,
  notes text,
  confidence double precision not null,
  validated boolean not null,
  source text not null,
  template_id text not null,
  template_name text not null,
  created_at timestamptz not null
);

create index if not exists idx_coral_project on public.coral_reef_health (project_id);
create index if not exists idx_coral_created on public.coral_reef_health (created_at desc);

-- RLS: open policies for anon (tighten with auth.uid() when you add Supabase Auth).

alter table public.dolphin_observations enable row level security;
alter table public.coral_reef_health enable row level security;

drop policy if exists "dolphin_anon_select" on public.dolphin_observations;
drop policy if exists "dolphin_anon_insert" on public.dolphin_observations;
drop policy if exists "dolphin_anon_update" on public.dolphin_observations;

create policy "dolphin_anon_select" on public.dolphin_observations for select to anon using (true);
create policy "dolphin_anon_insert" on public.dolphin_observations for insert to anon with check (true);
create policy "dolphin_anon_update" on public.dolphin_observations for update to anon using (true) with check (true);

drop policy if exists "coral_anon_select" on public.coral_reef_health;
drop policy if exists "coral_anon_insert" on public.coral_reef_health;
drop policy if exists "coral_anon_update" on public.coral_reef_health;

create policy "coral_anon_select" on public.coral_reef_health for select to anon using (true);
create policy "coral_anon_insert" on public.coral_reef_health for insert to anon with check (true);
create policy "coral_anon_update" on public.coral_reef_health for update to anon using (true) with check (true);
