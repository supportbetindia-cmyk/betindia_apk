-- One row per user (from the master list) joined with their transaction activity.
-- Reading this view is a single fast query instead of one lookup per user.
-- Run once in the Supabase SQL editor. (Re-run any time to update the definition.)

create or replace view public.user_activity as
select
  u.user_id,
  u.branch_id,
  u.mobile,
  u.name,
  u.language,
  u.register_date,
  t.last_txn_at,
  coalesce(t.deposits_count, 0) as deposits_count
from public.users u
left join (
  select
    user_id,
    max(created_at)                                as last_txn_at,
    count(*) filter (where type = 'deposit')       as deposits_count
  from public.transactions
  group by user_id
) t on t.user_id = u.user_id;
