-- Costco-style inventory / field observations (warehouse counts by brand & product type).
-- Safe to run standalone: creates `template_catalog` if missing, then Costco table + seed rows.
--
-- Stratification for the app: text columns brand, product_type, product_name bucket rows;
-- quantity is analyzed per bucket vs history.

-- ─── template_catalog (required for sync + INSERT below) ─────────────────────

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

-- ─── Costco table ────────────────────────────────────────────────────────────

create table if not exists public.costco_inventory (
  id text primary key,
  project_id text,
  raw_transcript text not null,
  brand text,
  product_type text,
  product_name text,
  quantity integer,
  confidence double precision not null,
  validated boolean not null,
  source text not null,
  template_id text not null,
  template_name text not null,
  created_at timestamptz not null
);

create index if not exists idx_costco_inventory_project on public.costco_inventory (project_id);
create index if not exists idx_costco_inventory_created on public.costco_inventory (created_at desc);
create index if not exists idx_costco_inventory_type on public.costco_inventory (product_type);
create index if not exists idx_costco_inventory_brand on public.costco_inventory (brand);

alter table public.costco_inventory enable row level security;

drop policy if exists "costco_inventory_anon_select" on public.costco_inventory;
drop policy if exists "costco_inventory_anon_insert" on public.costco_inventory;
drop policy if exists "costco_inventory_anon_update" on public.costco_inventory;

create policy "costco_inventory_anon_select" on public.costco_inventory for select to anon using (true);
create policy "costco_inventory_anon_insert" on public.costco_inventory for insert to anon with check (true);
create policy "costco_inventory_anon_update" on public.costco_inventory for update to anon using (true) with check (true);

-- ─── Template catalog (syncs to app SQLite) ──────────────────────────────────

insert into public.template_catalog (id, master_schema_id, display_name, supabase_table, fields_json)
values (
  'master-costco_inventory',
  'costco_inventory',
  'Costco inventory',
  'costco_inventory',
  '[
    {"key":"brand","label":"Brand","valueType":"text","pgType":"text"},
    {"key":"product_type","label":"Product type","valueType":"text","pgType":"text"},
    {"key":"product_name","label":"Product name","valueType":"text","pgType":"text"},
    {"key":"quantity","label":"Quantity (units)","valueType":"integer","pgType":"integer"}
  ]'::jsonb
)
on conflict (id) do update set
  master_schema_id = excluded.master_schema_id,
  display_name = excluded.display_name,
  supabase_table = excluded.supabase_table,
  fields_json = excluded.fields_json,
  updated_at = now();

-- ─── 100 rows of mock data (deterministic from row #) ──────────────────────
-- Deletes previous seed rows with source = 'seed' so re-run is safe.
delete from public.costco_inventory where source = 'seed';

insert into public.costco_inventory (
  id,
  project_id,
  raw_transcript,
  brand,
  product_type,
  product_name,
  quantity,
  confidence,
  validated,
  source,
  template_id,
  template_name,
  created_at
)
select
  'costco-seed-' || lpad(s.n::text, 4, '0'),
  null,
  'mock observation #' || s.n::text || ' — ' ||
    (ARRAY[
      'floor count',
      'cart audit',
      'shelf check',
      'receiving scan',
      'endcap tally'
    ])[(s.n % 5) + 1],
  br.brand_name,
  pt.product_type,
  initcap(pt.product_type) || ' — ' ||
    (ARRAY[
      'Ultra Soft Mega Roll','Bulk Wings','Trail Mix Pouch','Cola 36pk','Organic Bananas',
      '2% Gallon','Pizza 4-pack','Muffin Tray','Rotisserie Whole','Paper Towel Mega',
      'Ground Beef Chub','Cold Brew 12pk','Salad Kit','String Cheese','Frozen Berries',
      'Bagels Dozen'
    ])[(s.n % 16) + 1],
  case pt.product_type
    when 'toilet paper' then 6 + (s.n % 22) * 2
    when 'chicken' then 1 + (s.n % 12)
    when 'snacks' then 2 + (s.n % 28)
    when 'beverages' then 6 + (s.n % 42) * 2
    when 'produce' then 1 + (s.n % 18)
    when 'dairy' then 2 + (s.n % 20)
    when 'frozen' then 1 + (s.n % 16)
    when 'bakery' then 1 + (s.n % 10)
    when 'rotisserie' then 1 + (s.n % 8)
    else 1 + (s.n % 24)
  end,
  least(0.99, 0.88 + ((s.n % 12)::double precision * 0.008)),
  true,
  'seed',
  'master-costco_inventory',
  'Costco inventory',
  now() - ((s.n * 37 + (s.n % 11) * 17) || ' minutes')::interval
from generate_series(1, 100) as s(n)
cross join lateral (
  select
    (ARRAY[
      'Kirkland Signature',
      'Charmin',
      'Tyson',
      'Foster Farms',
      'Organic Prairie',
      'Blue Buffalo',
      'Coca-Cola',
      'Keurig',
      'General Mills',
      'Sunbelt Bakery',
      'Wonderful',
      'Kerrygold',
      'Amy''s Kitchen',
      'Oscar Mayer',
      'Nature''s Own',
      'Kraft'
    ])[(s.n % 16) + 1] as brand_name
) br
cross join lateral (
  select
    (ARRAY[
      'toilet paper',
      'chicken',
      'snacks',
      'beverages',
      'produce',
      'dairy',
      'frozen',
      'bakery',
      'rotisserie',
      'paper goods'
    ])[(s.n % 10) + 1] as product_type
) pt;
