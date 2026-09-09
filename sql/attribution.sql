-- Marketing attribution: one row per anonymous visitor device, capturing the
-- first-touch + last-touch UTM source, and linked to a user_id once known.
-- Run in the Supabase SQL editor.

create table if not exists public.attribution (
  device_id      text primary key,
  user_id        text,
  first_source   text,
  first_medium   text,
  first_campaign text,
  first_landing  text,
  first_referrer text,
  first_at       timestamptz,
  last_source    text,
  last_medium    text,
  last_campaign  text,
  last_landing   text,
  last_referrer  text,
  last_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists attribution_user_idx on public.attribution (user_id);
create index if not exists attribution_first_source_idx on public.attribution (first_source);

alter table public.attribution enable row level security;
