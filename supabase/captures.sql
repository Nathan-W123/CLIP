-- Takethree Clip — Supabase schema for cloud sync (paste into SQL Editor → Run).
-- Matches src/services/syncCaptures.ts upsert payload & src/db/migrate.ts columns.

-- -----------------------------------------------------------------------------
-- Table: public.captures
-- Voice / record captures: structured payload + transcript metadata.
-- -----------------------------------------------------------------------------
create table if not exists public.captures (
  id text primary key,
  template_id text not null,
  template_name text not null,
  project_id text,
  raw_transcript text not null,
  parsed_json jsonb not null,
  confidence double precision not null,
  validated boolean not null,
  synced boolean not null default true,
  source text not null,
  created_at timestamptz not null
);

create index if not exists idx_captures_project on public.captures (project_id);
create index if not exists idx_captures_template on public.captures (template_id);
create index if not exists idx_captures_created on public.captures (created_at desc);

comment on table public.captures is 'Synced capture rows from the mobile app (SQLite → Supabase).';
comment on column public.captures.id is 'UUID string generated on device (crypto.randomUUID).';
comment on column public.captures.template_id is 'Template identifier (e.g. tmpl-notes).';
comment on column public.captures.template_name is 'Human-readable template name.';
comment on column public.captures.project_id is 'Optional project association from record flow; null for voice_capture.';
comment on column public.captures.raw_transcript is 'Raw STT / user transcript text.';
comment on column public.captures.parsed_json is 'Structured payload from the voice parser (template-specific JSON).';
comment on column public.captures.confidence is 'Parser confidence score (0–1).';
comment on column public.captures.validated is 'Whether local validation passed.';
comment on column public.captures.synced is 'Stored as true when pushed from device (mirror of cloud row state).';
comment on column public.captures.source is 'voice_capture | record_screen.';
comment on column public.captures.created_at is 'ISO 8601 capture time from device.';

-- -----------------------------------------------------------------------------
-- Row Level Security (anon key from the app)
-- Replace these with auth.uid()-scoped policies when you add Supabase Auth.
-- -----------------------------------------------------------------------------
alter table public.captures enable row level security;

drop policy if exists "captures_anon_select" on public.captures;
drop policy if exists "captures_anon_insert" on public.captures;
drop policy if exists "captures_anon_update" on public.captures;

create policy "captures_anon_select"
  on public.captures for select
  to anon
  using (true);

create policy "captures_anon_insert"
  on public.captures for insert
  to anon
  with check (true);

create policy "captures_anon_update"
  on public.captures for update
  to anon
  using (true)
  with check (true);

-- Authenticated users (when you add Supabase Auth): tighten using (auth.uid() = user_id) etc.
drop policy if exists "captures_authenticated_select" on public.captures;
drop policy if exists "captures_authenticated_insert" on public.captures;
drop policy if exists "captures_authenticated_update" on public.captures;

create policy "captures_authenticated_select"
  on public.captures for select
  to authenticated
  using (true);

create policy "captures_authenticated_insert"
  on public.captures for insert
  to authenticated
  with check (true);

create policy "captures_authenticated_update"
  on public.captures for update
  to authenticated
  using (true)
  with check (true);
