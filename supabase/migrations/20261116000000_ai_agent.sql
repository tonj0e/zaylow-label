-- AI AGENT: run once in Supabase > SQL Editor.
-- Saves each daily report so you can read old ones. Only signed-in users can read them.
create table if not exists public.ai_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  report_date date not null unique,
  text text not null,
  snapshot jsonb
);
alter table public.ai_reports enable row level security;
drop policy if exists "signed in read" on public.ai_reports;
create policy "signed in read" on public.ai_reports for select to authenticated using (true);
-- nobody can write from the website; only the ai-agent function (service key) writes.
