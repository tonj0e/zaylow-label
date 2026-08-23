-- Migration: Create integration_settings table for secure API key storage
create table if not exists integration_settings (
  id            text primary key,
  platform      text not null,
  name          text not null,
  is_active     boolean default false,
  api_key       text,
  api_secret    text,
  store_url     text,
  email         text,
  extra_config  jsonb,
  last_verified timestamptz,
  last_sync     timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table integration_settings enable row level security;
create policy "Allow all" on integration_settings for all using (true) with check (true);

insert into integration_settings (id, platform, name, is_active) values
  ('delhivery',   'Delhivery',   'Delhivery Direct API',  false),
  ('shiprocket',  'Shiprocket',  'Shiprocket API',         false),
  ('shopify',     'Shopify',     'Shopify Store',          false),
  ('woocommerce', 'WooCommerce', 'WooCommerce Store',      false),
  ('amazon',      'Amazon',      'Amazon Seller Flex',     false),
  ('flipkart',    'Flipkart',    'Flipkart Seller Hub',    false)
on conflict (id) do nothing;
