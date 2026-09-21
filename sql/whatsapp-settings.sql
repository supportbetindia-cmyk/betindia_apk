-- WhatsApp account registry: one row per (company, role). Each role is a separate
-- Interakt account — e.g. 'updates' (deposit/withdrawal), 'retention' (register/
-- inactive), plus whatever else the brand adds. Not hard-coded numbers.
--
-- api_key must never reach the browser, so the table is service_role-only: RLS ON
-- with NO policies → the anon key (browser) reads/writes nothing; service_role
-- (server routes) bypasses RLS.
--
-- If you already created the earlier single-key version, run first:
--   drop table public.whatsapp_settings;
create table if not exists public.whatsapp_settings (
  tenant_id  uuid    not null references public.tenants(id) on delete cascade,
  role       text    not null,                      -- 'updates' | 'retention' | ...
  label      text,                                  -- e.g. "BetIndia Updates"
  api_key    text,                                  -- that account's Interakt key
  templates  jsonb   not null default '{}'::jsonb,  -- only 'updates' uses these
  enabled    boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, role)
);

alter table public.whatsapp_settings enable row level security;
-- (no policies on purpose — server-only access via service_role)
