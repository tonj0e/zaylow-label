-- AI MONITORING: run once in Supabase > SQL Editor.
-- The app writes one small row each time a section is opened, and one row when something crashes.
-- No customer data is stored here: only the section name and a short error text.
-- The AI assistant reads these rows to tell you which sections are not used and which are not working.
create table if not exists public.app_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null,          -- 'view' (a section was opened) or 'error' (something crashed)
  section text,                -- e.g. orders, returns, inventory-add
  message text                 -- short error text (for 'error' only)
);
create index if not exists app_events_time_idx on public.app_events (created_at desc);
create index if not exists app_events_kind_idx on public.app_events (kind, section, created_at desc);
alter table public.app_events enable row level security;
drop policy if exists "signed in add" on public.app_events;
drop policy if exists "signed in read" on public.app_events;
create policy "signed in add" on public.app_events for insert to authenticated with check (true);
create policy "signed in read" on public.app_events for select to authenticated using (true);
-- nobody can change or delete these rows from the website.
