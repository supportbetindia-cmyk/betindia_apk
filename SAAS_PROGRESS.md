# SaaS Migration — Progress & Handoff

**Goal:** turn the existing single-tenant BetIndia dashboard into a **multi-tenant SaaS**
("Customer Intelligence & Company Growth"), reusing all existing features
(Interakt automation, campaigns, analytics, push).

**Decision (Path A):** *Evolve* this dashboard (Next.js + Supabase) into multi-tenant —
NOT a rewrite. A separate NestJS backend was scaffolded at `../backend` but is
**SHELVED** (kept for reference; do not run two systems). We reuse the existing
Supabase project `fyaohkerwrimocetmczd`.

## Key facts
- **BetIndia tenant id:** `b6e68fb7-ca2e-49be-b1e5-74601e59a041`
- **Tenant tables (public schema):** `tenants`, `tenant_memberships`, `audit_logs`
- **`tenant_id` added + backfilled to BetIndia on:** transactions, users, message_log,
  webhook_logs, analytics_events, player_activity
- **Auth:** Supabase Auth (email/password). Env added to `.env.local`:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Existing shared-password login (`/login`) still works — untouched during transition.

## Done
- **Step 1 — Tenant foundation:** `sql/multitenant.sql` (already run in Supabase).
- **Step 2 — Supabase Auth (additive):**
  - `lib/supabase-browser.ts` — browser auth client
  - `app/saas-login/page.tsx`, `app/saas-signup/page.tsx` — login / sign-up
  - `app/api/saas/whoami/route.ts` — verifies token, returns user + tenant memberships
  - `app/saas/page.tsx` — proof page ("Signed in as X · BetIndia · Owner")
  - `middleware.ts` — excludes `saas`, `saas-login`, `api/saas` from the old gate
- **Step 3a — write-stamping ✅** (see below) · **Step 3.5 — dual-auth ✅** (see below)

### To test Step 2
1. Restart dev server (`npm run dev`) — loads new env + `@supabase/supabase-js`.
2. Supabase → Authentication → Users → Add user (email+password, auto-confirm).
3. Link that user to BetIndia (run in SQL editor, paste the user's UID):
   ```sql
   insert into public.tenant_memberships (tenant_id, auth_user_id, email, role, status)
   values ('b6e68fb7-ca2e-49be-b1e5-74601e59a041', '<AUTH_USER_UID>', '<email>', 'owner', 'active')
   on conflict (tenant_id, auth_user_id) do update set role='owner', status='active';
   ```
4. Visit `/saas-login` → sign in → `/saas` shows your tenant + role.

## Next steps (in order)
- **Step 3 — Tenant scoping:**
  - **3a. Write-stamping ✅ DONE.** `lib/tenant.ts` (`getCurrentTenantId()` → BetIndia
    for now). All writes now stamp `tenant_id`: `saveTransaction` + `logWebhookHit`
    (lib/wati.ts), message_log inserts (lib/automations.ts `insertMessageRow`,
    lib/campaign-sender.ts `claimLog`), `importUsers` (campaign-sender),
    `importUserRows` (user-analytics), `upsertPlayerActivity` (player-activity).
  - **3b. Read-filtering — DEFERRED (do with the auth cutover).** Reason: with only
    BetIndia, filtering reads by a hardcoded tenant is a no-op and risks hiding any
    un-stamped row. Do it once the app resolves the tenant from the logged-in user's
    Supabase session — and first run a NULL→BetIndia backfill so nothing is hidden.
    Add `&tenant_id=eq.<tenant>` in: lib/wati.ts (fetchTransactions/ForUser),
    lib/user-analytics.ts (fetchAll users+txns, activeUsers, fetchUserBreakdown,
    fetchUserTransactions, matchUserIds), lib/reengagement.ts, lib/campaign-sender.ts
    (fetchCampaignLog/Summary, dormant fetchAll/cooldown/txnRecency), lib/supabase.ts.
  - RLS on tenant tables = optional defense-in-depth later.
- **Step 3.5 — Auth cutover ✅ DONE (dual-auth).**
  - `lib/supabase-browser.ts` now uses `@supabase/ssr` `createBrowserClient` (cookie
    sessions, so middleware/server can read them).
  - `middleware.ts` is now dual-auth: checks the legacy password `bt_session` FIRST
    (unchanged, guaranteed) and, only if absent, checks a Supabase session. Any
    Supabase error falls through → password path can never break. Both logins work.
  - After a Supabase login (`/saas-login`), the user can access all existing pages.
  - Build verified incl. edge middleware.
  - STILL sync `getCurrentTenantId()` → BetIndia (writes). Data shown is still BetIndia.
- **Step 3b — per-tenant read filtering (analytics surface ✅ DONE):**
  - `lib/tenant-server.ts` `getRequestTenantId()` — resolves the request's tenant from
    the Supabase user's membership; falls back to BetIndia (password users / any error).
  - The 6 analytics reads now take a `tenantId` and filter `&tenant_id=eq.<t>`:
    fetchUserAnalytics, activeUsers, fetchUserBreakdown, fetchUserTransactions,
    matchUserIds (user-analytics.ts) + computeGrowth (growth.ts). Routes resolve tenant
    via getRequestTenantId() and pass it.
  - Verified: BetIndia filter = all rows; random tenant = 0 (isolation works). NULLs
    backfilled to BetIndia (`sql/backfill-null-tenant.sql`, already applied via REST).
    Build clean.
  - **Scoped so far (user-facing):** analytics (6 endpoints) ✅ · Transactions page
    (`fetchTransactions` + /api/transactions) ✅ · Campaigns log+summary
    (`fetchCampaignLog`/`fetchCampaignSummary` + /api/reengagement/log,/summary) ✅ ·
    CSV-match import is request-aware (`importUserRows(rows, tenantId)` ← getRequestTenantId) ✅.
    Pattern: read helpers take an optional `tenantId` defaulting to `getCurrentTenantId()`
    (BetIndia) so cron/background callers stay safe; user-facing routes pass `getRequestTenantId()`.
  - **STILL TODO before onboarding tenant #2:**
    1. Request-aware WRITES for the rest: webhooks (`saveTransaction`, automation
       `message_log`) and campaign sends still stamp the BetIndia constant. Webhooks need
       per-tenant routing (a per-tenant webhook URL/token → tenant) — an onboarding-phase design.
    2. Scope remaining reads: `app/api/metrics` (analytics_events via lib/supabase.ts),
       `app/api/webhook-logs`, `fetchDormantDepositors` + reengagement segment reads
       (fetchUsersFromTable/fetchTransactionAggregate/fetchRecentlyMessaged) in campaign-sender,
       `fetchTransactionsForUser`/`fetchKnownTransactionUserIds` (background). Fine for one
       tenant; required for isolation with 2+.
    3. At deploy: re-run `sql/backfill-null-tenant.sql` (catches rows created before stamping deploys).
- **Step 4 — RBAC + audit** surfaced in-app (use `tenant_memberships.role`; write
  `audit_logs` on config/financial changes).
- **Step 5 — Tenant switcher** (platform owner) + client onboarding (create tenant +
  invite users) + import a new client's data tagged with their tenant_id.
- **Later:** replace the old `/login` password gate with Supabase Auth fully; drop the
  shelved `../backend` and the `saas` Postgres schema if not needed.

## Architecture update (2026-09-16) — HYBRID, backend is NOT shelved
The "SHELVED backend" note above is **superseded**. Current shape:
- **Legacy dashboard** (`/`, `/analytics`, `/transactions`, `/whatsapp`, `/automations`,
  `/campaigns`, …) — unchanged, talks to Supabase directly (public schema).
- **New SaaS console** — talks to the **NestJS backend** (`../backend`, `http://localhost:4000`,
  base `/api/v1`) via `lib/backend-api.ts` (Supabase Bearer token + `x-tenant-id` header):
  - `app/saas/page.tsx` → `GET /me`, `POST /tenants` (create company / switch tenant)
  - `app/customers/page.tsx` → `GET /customers`, `POST /imports/legacy/customers`
  - `app/customers/[id]/page.tsx` → `GET /customers/:id`, `GET /customers/:id/transactions`
- Backend endpoints all exist and BUILD clean (`nest build` EXIT 0); dashboard `tsc` clean.
- **Legacy import** (`backend/src/imports/imports.service.ts`): matches the saas tenant's
  **name** (case-insensitive) against a `public.tenants` row, then copies that tenant's
  `public.users` → `saas.customers` (idempotent upsert, batches of 100).
  ⚠️ The saas company you create in `/saas` MUST be named exactly **`BetIndia`** or the
  import throws `No legacy company named "…" found`.

### Auth model (updated) — SaaS console is Supabase-only, single login
`middleware.ts` matcher now also excludes **`customers`** (alongside `saas`, `saas-login`).
So the whole SaaS console (`/saas`, `/saas-login`, `/customers`, `/customers/[id]`) is
authed purely by Supabase (client session + backend token) — NO legacy password gate.
The legacy dashboard (`/`, `/analytics`, `/transactions`, `/whatsapp`, …) still uses the
old shared-password gate (root `/` → 307 `/login`). `/customers` pages redirect to
`/saas-login` on a backend 401 (no session). ⚠️ Middleware changes need a full dev-server
restart (Next.js does not hot-reload middleware).

### Runbook (test the SaaS console end to end)
1. `cd ../backend && npm run start:dev` (needs `.env`: pooler `DATABASE_URL`, `SUPABASE_URL`,
   `SUPABASE_JWT_SECRET`). Confirm it listens on :4000.
2. `cd dashboard && npm run dev`. (Optional `NEXT_PUBLIC_BACKEND_URL` if backend not on :4000.)
3. Sign in ONCE at `/saas-login` (Supabase Auth). Create company **BetIndia** on `/saas`.
   (No legacy password needed for the SaaS console anymore.)
4. Open `/customers` → header toolbar → **Import customers**, then **Import transactions**
   → expect `Imported N customer records.` / `Imported N transaction records.`
5. Click a customer → Customer 360 (aggregates come from `saas.transactions`, which are
   empty until you also import legacy transactions — see next).

### Company Dashboard + Growth (2026-09-18) — PRD 11/12
The "Company Growth" half. Backend `src/dashboard/` (periods.ts + dashboard.service/controller/module):
`GET /api/v1/dashboard?period=today|week|month|year|custom(&from&to)` → per-period KPIs with
current vs previous + Growth % + Growth X (zero-base handling: new_base/flat). Metrics: New players
(registration_at), First-time depositors (ftd_date), Active players (distinct customer w/ successful
txn), Money deposited, Money withdrawn, Company P/L (dep−wd) — all from saas.* scoped by tenant,
successful txns only. Period math (periods.ts) aligns to tenant tz (IST) and compares "same elapsed
duration" in the previous period. Permission: financial.dashboard.read (Viewer excluded). Frontend
`/overview` (Supabase-only; middleware excludes it; sidebar "Company overview" w/ TrendingUp icon):
period buttons + plain-English KPI cards (green/red growth chips, "vs" previous). Validated live:
Sep vs Aug → Company P/L ₹6.48L vs ₹1.74L (+273%, 3.7x), deposits −6%, new players −97%.
⚠️ reads saas.transactions (imported, refresh via Import), NOT live public webhooks — a live
webhook→saas pipeline is still a TODO for real-time "today". Roadmap remaining: Profit/Budgets/
Targets (§13-15), Reports (§16), Admin config (§18).

### Lifecycle & Value Category classification (2026-09-17) — PRD 6.2/6.3
Auto-classifies every player. Backend module `src/classification/` (config in
classification.config.ts — thresholds, config-ready): lifecycle = Lead / Registered / FTD /
Repeat Depositor / Regular Player / At Risk / Inactive (from deposit_count, registration_at,
last_deposit_at with 15d At-Risk / 30d Inactive); value tier = Silver/Gold/Platinum/Diamond/VIP
by total_deposits (5k/20k/50k/100k). `ClassificationService.recomputeTenant` runs ONE writable-CTE
statement: computes new values, writes changes to `saas.classification_events` (history, never
overwritten), updates customers — 5,203 in ~2.5s. Endpoints: `POST /classification/recompute`,
`GET /classification/summary`. Auto-runs after every customer import (imports.controller injects
ClassificationService). get360 now returns `classificationHistory`. Frontend: list has Stage +
Group columns (StageBadge, plain words like "Going quiet"/"Signed up"), a "Recompute groups"
button; Customer 360 shows the stage chip + a "Group changes" history panel. Live distribution:
Registered 4773, Inactive 255, Regular 96, At Risk 53, Lead 15, Repeat 8, FTD 3; tiers Silver 239,
Gold 62, VIP 52, Platinum 41, Diamond 21 (4788 non-depositors). ⚠️ lifecycle depends on
"days since last deposit" so it drifts — needs periodic recompute (cron later); for now the button
+ post-import hook cover it. NOTE next candidates per PRD: Company Dashboard+Growth, Profit/
Budgets/Targets, Reports. ⚠️ prisma generate needs backend STOPPED (dll lock).

### Lifetime totals + plain-English Customer 360 (2026-09-17)
Problem: Customer 360 showed ₹0 deposits/withdrawals because it summed only `saas.transactions`
(sparse recent/webhook rows, mostly PENDING). The authoritative lifetime figures live in
`public.users` (total_deposit, deposit_count, total_withdrawal, withdrawal_count, pnl,
total_bonus, last_deposit_*, last_withdrawal_*). Fix: added those columns to `saas.customers`
(Prisma `Customer`: totalDeposits, depositCount, totalWithdrawals, withdrawalCount, netPnl,
totalBonus, lastDepositAt/Amount, lastWithdrawalAt/Amount — `prisma db push` applied). All
imports now populate them: legacy customers (from public.users), CSV upload (from the report
columns via `parseUsersCsv` → `u.report.*`). `get360` returns `{customer, lifetime, ledger, ftd}`
(was `financial`) — `lifetime` = report totals (primary), `ledger` = successful-transaction
aggregates (recent). Backfilled all 5,203 customers (~2s); verified kalpesh6056 = ₹15,650 in /
₹7,100 out / ₹8,550 P&L / ₹340 bonus. ⚠️ Regenerating Prisma client needs the backend STOPPED
(watch holds query_engine dll → EPERM); kill node pids then `prisma generate`.
UI rewritten for non-technical readers (user ask): `/customers/[id]` now uses everyday words
("Money added / Money taken out / Your profit", plain summary sentence, "Money in/out",
statuses → Successful/Waiting/Rejected/Failed), and the list + sidebar say "Players" with
columns Name/Player ID/Phone/Group/First deposit/Status.

### CSV customer upload (2026-09-17)
Any tenant can onboard from a spreadsheet (webhooks keep it live after). `/customers`
header now has **Upload CSV** (+ Import customers / Import transactions for the legacy
BetIndia path). Flow: browser parses the file with the shared `lib/user-file.ts`
`parseUsersCsv` (same "User Master report" format as the analytics page — auto delimiter,
skips title rows, maps User ID/Phone/Registration/FTD/Category), then POSTs the rows to
`POST /api/v1/imports/customers`. Backend (`imports.service.importCustomerRows`) bulk-upserts
via one `INSERT..SELECT` over `unnest($n::text[])` — deduped by external id, idempotent on
(tenant, external_user_id). Uses `useMutation` + `useRef` (hidden file input); zod NOT added
(dashboard has no zod dep — parser + backend class-validator DTO cover validation).
Backend `main.ts` raised express json/urlencoded limit to 25mb (default 100kb was too small
for multi-thousand-row payloads). Verified: Prisma binds JS arrays to `$n::text[]`; upsert
SQL (timestamptz/numeric casts + conflict) validated live via rollback. tsc clean both sides.

### Import performance + type gotcha (2026-09-17)
Both legacy imports were rewritten from per-row Prisma upserts (5k rows = minutes, made
the button look "stuck") to a **single bulk `INSERT..SELECT..ON CONFLICT`** via
`$executeRawUnsafe` — 5,203 customers in ~0.8s, 8,083 transactions in ~1.1s. ⚠️ Column
type gotcha discovered: `public.users.tenant_id` is **uuid**, but `public.transactions.tenant_id`
AND all **saas.* tenant_id/id** columns are **text** (Prisma `String` without `@db.Uuid`).
So: read public.users with `tenant_id = $n::uuid`; read public.transactions with
`tenant_id::text = $n`; write/join saas.* with plain text (`gen_random_uuid()::text`, no
`::uuid` on tenant/customer ids). Verified live: transactions 4,800→8,083 (prior run was
partial), 1,779 financially successful. Frontend fix for a stuck button: just refresh —
requests now return in ~1s so `importing` state resets normally.

### Next steps
- **Import legacy transactions ✅ DONE** — `POST /imports/legacy/transactions`
  (`imports.controller.ts` + `imports.service.importLegacyTransactions`). Reads
  `public.transactions` for the matched legacy tenant, links each to `saas.customers` by
  `user_id → externalUserId`, classifies with shared `transactions/status.ts`
  (`normalizeStatus`/`normalizeType`, rejected-first), idempotent on
  `(tenant, 'legacy', external_transaction_id)`. Because that ledger key allows only ONE row
  per `transaction_id`, we keep the LATEST occurrence per id; rows with no matching customer
  are skipped + reported (`skippedNoCustomer`) → so **run "Import customers" first, then
  "Import transactions"**. Both buttons live in the `/customers` header toolbar. Not yet
  tested live (needs backend + Supabase login); backend `tsc`/`nest build` + dashboard `tsc`
  all clean.
- Decide the long-term split: keep hybrid, or migrate the legacy pages onto the backend too.
- Everything here is **local & uncommitted** (except name-"0" fix `3651576`). Commit when asked.

## Guardrails
- Keep changes additive; don't break the live `/login` or existing pages until Step 3
  scoping is verified.
- Verify every data-layer change against live data with a throwaway script + `tsc`
  before wiring UI. Then `npm run build`.
- Commit/push only when asked (repo: supportbetindia-cmyk/betindia_apk, branch main,
  auto-deploys to admin.betindia.games).
