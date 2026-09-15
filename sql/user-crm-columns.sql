-- CRM / User Master report financials on the users table.
-- These are the LIFETIME source of truth (platform-provided), independent of the
-- webhook transactions table. Run once in the Supabase SQL editor.

alter table public.users
  add column if not exists first_deposit_date     timestamptz,
  add column if not exists first_deposit_amount   numeric,
  add column if not exists last_deposit_date      timestamptz,
  add column if not exists last_deposit_amount    numeric,
  add column if not exists last_withdrawal_date   timestamptz,
  add column if not exists last_withdrawal_amount numeric,
  add column if not exists total_deposit          numeric,
  add column if not exists deposit_count          integer,
  add column if not exists total_withdrawal       numeric,
  add column if not exists withdrawal_count       integer,
  add column if not exists pnl                    numeric,
  add column if not exists total_bonus            numeric,
  add column if not exists status_label           text,
  add column if not exists category               text,
  add column if not exists report_synced_at       timestamptz;

create index if not exists users_first_deposit_date_idx on public.users (first_deposit_date);
create index if not exists users_deposit_count_idx on public.users (deposit_count);
