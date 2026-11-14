-- SUPPLIERS: run this once in Supabase > SQL Editor (the owner runs it; the site cannot).
-- Only signed-in users can read or write. Nothing here changes existing orders, cartons or stock.

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  kind text not null default 'product',      -- product | box | cover | other
  phone text,
  address text,
  gst text,
  bank_details text,
  notes text
);

create table if not exists public.supplier_purchases (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  purchase_date date not null default current_date,
  item_name text not null,                    -- product, "Box 4x6", "Cover", ...
  cartons numeric not null default 0,         -- number of cartons (0 for loose items)
  units_per_carton numeric,                   -- e.g. 100
  quantity numeric,                           -- for loose items (boxes, covers)
  price_per_carton numeric,                   -- or price per item for loose items
  total_paid numeric not null default 0,      -- full amount paid
  bill_path text,                             -- file in the supplier-bills bucket
  bill_name text,
  batch_id text,                              -- stock batch created from Receive inventory (optional)
  notes text
);
create index if not exists supplier_purchases_supplier_idx on public.supplier_purchases (supplier_id, purchase_date desc);

-- link a received stock batch to a supplier (the old text columns stay as they are)
alter table public.inventory_batches add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;

alter table public.suppliers enable row level security;
alter table public.supplier_purchases enable row level security;
drop policy if exists "signed in users only" on public.suppliers;
drop policy if exists "signed in users only" on public.supplier_purchases;
create policy "signed in users only" on public.suppliers for all to authenticated using (true) with check (true);
create policy "signed in users only" on public.supplier_purchases for all to authenticated using (true) with check (true);

-- private place for bill photos and PDFs
insert into storage.buckets (id, name, public) values ('supplier-bills', 'supplier-bills', false) on conflict (id) do nothing;
drop policy if exists "bills signed in only" on storage.objects;
create policy "bills signed in only" on storage.objects for all to authenticated
  using (bucket_id = 'supplier-bills') with check (bucket_id = 'supplier-bills');
