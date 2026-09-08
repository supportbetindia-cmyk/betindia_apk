
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;


insert into public.app_settings (key, value) values
  ('automation_enabled', 'true'),
  ('automation_deposit', 'true'),
  ('automation_withdrawal', 'true'),
  ('winback_enabled', 'true'),
  ('statement_enabled', 'true')
on conflict (key) do nothing;
