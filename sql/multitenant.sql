-- ============================================================================
-- Path A — Multi-tenant foundation for the existing dashboard.
-- ADDITIVE & NON-BREAKING: adds tenant tables + a nullable tenant_id to data
-- tables, creates the BetIndia tenant, and backfills existing rows to it.
-- The app keeps working unchanged until we wire tenant scoping (Step 3).
-- Run once in the Supabase SQL editor. TAKE A BACKUP FIRST.
-- ============================================================================

-- 1. Tenant tables --------------------------------------------------------------
create table if not exists public.tenants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  status     text not null default 'active',
  timezone   text not null default 'Asia/Kolkata',
  currency   text not null default 'INR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Membership links a Supabase Auth user (auth.users.id) to a tenant + role.
create table if not exists public.tenant_memberships (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  auth_user_id uuid not null,
  email        text,
  role         text not null default 'viewer',   -- owner | admin | manager | viewer
  status       text not null default 'active',    -- active | invited | disabled
  created_at   timestamptz not null default now(),
  unique (tenant_id, auth_user_id)
);
create index if not exists tenant_memberships_user_idx on public.tenant_memberships (auth_user_id);

-- Audit log for configuration/financial changes.
create table if not exists public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid,
  actor_user_id uuid,
  action        text not null,
  entity_type   text,
  entity_id     text,
  old_value     jsonb,
  new_value     jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists audit_logs_tenant_idx on public.audit_logs (tenant_id, created_at desc);

-- 2. Seed the BetIndia tenant ---------------------------------------------------
insert into public.tenants (name)
select 'BetIndia'
where not exists (select 1 from public.tenants where name = 'BetIndia');

-- 3. Add nullable tenant_id to data tables --------------------------------------
alter table public.transactions      add column if not exists tenant_id uuid;
alter table public.users             add column if not exists tenant_id uuid;
alter table public.message_log       add column if not exists tenant_id uuid;
alter table public.webhook_logs      add column if not exists tenant_id uuid;
alter table public.analytics_events  add column if not exists tenant_id uuid;
alter table public.player_activity   add column if not exists tenant_id uuid;

-- 4. Backfill every existing row to the BetIndia tenant -------------------------
do $$
declare bet uuid;
begin
  select id into bet from public.tenants where name = 'BetIndia' limit 1;
  update public.transactions     set tenant_id = bet where tenant_id is null;
  update public.users            set tenant_id = bet where tenant_id is null;
  update public.message_log      set tenant_id = bet where tenant_id is null;
  update public.webhook_logs     set tenant_id = bet where tenant_id is null;
  update public.analytics_events set tenant_id = bet where tenant_id is null;
  update public.player_activity  set tenant_id = bet where tenant_id is null;
end $$;

-- 5. Indexes for tenant-scoped queries ------------------------------------------
create index if not exists transactions_tenant_idx     on public.transactions (tenant_id);
create index if not exists users_tenant_idx            on public.users (tenant_id);
create index if not exists message_log_tenant_idx      on public.message_log (tenant_id);
create index if not exists webhook_logs_tenant_idx     on public.webhook_logs (tenant_id);
create index if not exists analytics_events_tenant_idx on public.analytics_events (tenant_id);
create index if not exists player_activity_tenant_idx  on public.player_activity (tenant_id);

-- Show the BetIndia tenant id (copy it — the app uses it as the default tenant).
select id as betindia_tenant_id, name from public.tenants where name = 'BetIndia';
