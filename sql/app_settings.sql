-- Dashboard-controlled settings (key/value). Lets non-technical staff toggle
-- features from the UI instead of editing Hostinger env vars.
-- Run once in the Supabase SQL editor.

create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- Seed the automation switches ON (matches the current live state). "on conflict
-- do nothing" means re-running this never overwrites a choice made in the UI.
insert into public.app_settings (key, value) values
  ('automation_enabled', 'true'),
  ('automation_deposit', 'true'),
  ('automation_withdrawal', 'true')
on conflict (key) do nothing;
