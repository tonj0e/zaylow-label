-- RUN THIS ONLY AFTER you have made your login user in Supabase (Authentication > Users) and signed in to the site once.
-- It closes every table to people who are not signed in. The public key in the website can then read and write nothing without a login.
-- The background functions (tracking, courier, India Post) use the service key and are not affected.

do $$
declare t text;
begin
  foreach t in array array['orders','inventory_items','inventory_batches','cartons','returns','stock_summary','product_prices']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      -- remove every old policy, including the open "allow all" ones
      execute (select coalesce(string_agg(format('drop policy %I on public.%I;', policyname, t), ' '), 'select 1') from pg_policies where schemaname = 'public' and tablename = t);
      execute format('create policy "signed in users only" on public.%I for all to authenticated using (true) with check (true)', t);
    end if;
  end loop;
end $$;

-- integration_settings keeps the lock from 20261109000000_lock_integration_secrets.sql; signed in users keep the same safe columns.
