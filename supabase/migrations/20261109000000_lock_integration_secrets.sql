-- Migration: stop exposing integration API secrets to the browser.
--
-- Before: policy "Allow all" let anyone holding the public anon key read
-- api_key / api_secret in plain text.
-- After:  the anon/authenticated roles can still list integrations and write
--         credentials (the Settings screen needs that until sign-in exists),
--         but can no longer SELECT the secret columns. Edge functions use the
--         service-role key, which bypasses RLS and column grants, so they keep
--         working unchanged.
--
-- NOTE: Anyone with the anon key can still OVERWRITE credentials until the app
-- gets real authentication. Once Supabase Auth is added, replace the policies
-- below with `to authenticated` ones.

drop policy if exists "Allow all" on integration_settings;

create policy "integration_settings_select" on integration_settings
  for select to anon, authenticated using (true);
create policy "integration_settings_update" on integration_settings
  for update to anon, authenticated using (true) with check (true);

-- Column-level privileges: secrets are write-only from the browser.
revoke select on integration_settings from anon, authenticated;
grant select (id, platform, name, is_active, store_url, last_verified, last_sync, created_at, updated_at)
  on integration_settings to anon, authenticated;

revoke insert, delete on integration_settings from anon, authenticated;
grant update (api_key, api_secret, store_url, email, is_active, last_verified, updated_at)
  on integration_settings to anon, authenticated;
