-- Run this at the SAME time you deploy the tenant read-filtering (Step 3b).
-- Any row inserted after multitenant.sql but before write-stamping went live has
-- tenant_id = NULL; the new filters would hide it. This re-tags all NULLs to
-- BetIndia (safe: single tenant today). Re-runnable.
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

-- Sanity check — every row should now have a tenant (expect 0 nulls each):
select 'transactions' as tbl, count(*) filter (where tenant_id is null) as null_rows from public.transactions
union all select 'users', count(*) filter (where tenant_id is null) from public.users
union all select 'message_log', count(*) filter (where tenant_id is null) from public.message_log;
