-- Prepaid selling price for each product, so New order can fill the amount automatically.
create table if not exists public.product_prices (
  product_key   text primary key,          -- product name in lower case, single spaces
  product_name  text not null,
  prepaid_price numeric not null default 0,
  updated_at    timestamptz default now()
);

alter table public.product_prices enable row level security;
create policy "Allow all" on public.product_prices for all using (true) with check (true);
