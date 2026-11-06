# قعدتنا / Qaadetna

The existing Arabic React 18 + TypeScript + Vite application, Tailwind styles,
Supabase backend and Vercel hosting are retained. No Vercel project/domain change.

## Local development

```sh
npm ci
cp .env.example .env.local
# Fill in this project's PUBLIC Supabase URL and anonymous/publishable key.
npm run dev
```

Never put the service-role key in a `VITE_` variable or frontend file. The
`delete-member` Edge Function uses Supabase's server-side built-in environment.

## Existing-project upgrade

This repository does not contain the original database bootstrap schema or its
Auth signup trigger. The migrations target an existing project with UUID ids,
`profiles`, `menu_items`, `gatherings`, and the order snapshot columns used by the
original app. Dates must be `timestamptz`. The second migration stops and rolls
back if required columns are absent, dates are timezone-naive, or multiple active
gatherings exist; it never silently closes or deletes them.

1. Take a database backup/snapshot. Optional read-only inspection:
   `supabase/diagnostics/00_preflight_read_only.sql`.
2. Apply `supabase/migrations/202611060001_menu_cart_media.sql`, then
   `supabase/migrations/202611060002_receipts_billing_security.sql` as the owner.
   On an existing menu/cart deployment, 001 may already be applied. Both are
   rerunnable in that order, but **always finish with 002**: it revokes the old
   RPC access that 001 grants. Do not deploy only the new frontend.
3. Deploy the Edge Function to the SAME Supabase project:
   `supabase functions deploy delete-member --project-ref YOUR_PROJECT_REF`.
   `supabase/config.toml` disables gateway JWT validation for this function only;
   the handler validates the bearer token through `auth.getUser()` and then
   verifies the current approved admin profile. This is not an unauthenticated
   delete endpoint. Set server secret `APP_ORIGIN` to your exact frontend origin;
   its default is the existing `https://qaadetna.vercel.app`.
4. Deploy these source changes through the EXISTING Vercel project, preserving
   its URL and Supabase environment. Coordinate frontend/SQL deployment: old
   browser mutation APIs are revoked by 002. Reload older open app tabs.
5. Smoke-test with an approved admin and a member on a staging copy before
   applying to production. Live credentials/database access are not bundled.

## Behavior and billing

- Admin has a separate "اطلب لنفسي" tab reusing the member menu and own orders.
  No second login is needed. Receipt confirmation is owner-only, even for admins.
- New orders are `pending` ("قيد التحضير"). Only explicit owner confirmation
  marks them `received` ("تم الاستلام"). Old rows without a status are backfilled
  as received once; rerunning the migration does not confirm pending orders.
- Amount due includes received rows only. Pending value is separate. Invoice
  groups are formed from actual orders, so a non-ordering admin never gets a
  synthetic zero balance. Orders from suspended users remain in historical bills.
- Bills use immutable menu name/price snapshots and quantities, not current menu
  prices or an old stale `total_price`. The admin can explicitly correct an
  individual order's price/quantity; that is separate from menu price edits.
- Detailed invoices expand per member on mobile. Dates display/filter in
  `Africa/Cairo` (including DST); database scheduling uses server `timestamptz`.
- Reads paginate until an empty page, handling even a project row cap below the
  requested page size, and reject partial results when any page fails.
- Batch RPC uses server snapshots, row locks and an idempotency receipt. A failed
  line rolls back orders, receipt and notifications. An in-memory identical
  retry reuses its request id. Refresh/navigation clears an unsent cart and its
  retry identity: check "طلباتي" before recreating an uncertain request.
- Admin media editor: JPEG/PNG/WebP ≤5 MiB, MP3 ≤10 MiB, previews/removal. Uploads
  are admin-only; asset URLs are public. Replaced files remain in storage for
  cached clients; failed saves attempt to remove freshly uploaded files.

## Reminders and notifications: exact scope

**Implemented: in-app only.** A visible authenticated app polls every 30 seconds
and when returning online/visible. First reminder becomes due 15 minutes after
server creation; "لسه" postpones it 15 more minutes. A locked claim and a
90-second renewable lease prevent concurrent displays for the same order across
tabs/devices. A conservative 60-second local expiry hides the popup even when
a renewal request hangs, before the server lease expires. Only the owner can claim, snooze, renew or confirm. An abandoned
reminder becomes available again after its due time/lease. The server schedules
it on claim, so no response is acknowledged just because a popup was displayed.
Realtime checks only read state; they never renew a lease in a feedback loop.

A unique `(admin_id, order_id)` notification is inserted transactionally for every
new order. Admins see an unread banner with member/item/quantity. "تم الاطلاع"
persists read state. Reloading does not re-create read notifications. Old orders
are not backfilled as new notifications. Realtime plus 30-second fallback
polling updates the UI. Realtime cannot deliver to a closed page.

**Not implemented or claimed: closed-app Web Push.** The current service worker
is installation-only. Real background delivery would additionally require a
permission/PushSubscription UI, HTTPS push service endpoints, VAPID public/private
keys (private key server-only), subscription RLS/storage, a deployed sender Edge
Function, and a database cron/queue with idempotent retries and lease-aware
scheduling. Safari/iOS also requires an installed PWA and user-granted permission.
There is no `Notification` permission prompt or pretend background scheduler in
this version. The existing in-app reminders work without any push key.

## Security and permanent account deletion

002 replaces policies on the four known application tables and preserves their
original definitions in owner-only `qa_backup.policy_snapshots`. Members read only
their own profile/orders. Browser writes to profiles/orders/gatherings are
revoked, including legacy column grants; checked RPCs perform mutations. Only
approved admins can manage all orders, status/name, gatherings or menu. Known
legacy mutation RPCs and trigger functions are revoked from browser roles.

The original Auth signup provisioning trigger is outside this repository. Inspect
it and any additional custom server RPCs on the actual project using the audit
file; do not provision admin/approved membership from user-editable auth metadata.
The upgrade does not rewrite unknown application APIs or unrelated tables.

Permanent deletion requires typing the exact username. An Edge Function validates
the user's real token/current admin status, prohibits self/admin deletion, and
calls the Auth Admin API. A `BEFORE DELETE` trigger on `auth.users` removes this
member's orders, batch receipts, notifications and profile in the SAME database
transaction. Restrictive unknown foreign keys/storage dependencies fail the
operation, and the transaction rolls back. No frontend service key is used.

This intentionally deletes the member's historical order lines and changes those
old invoice totals; the confirmation explicitly says so. Gatherings and other
members remain. Nothing is deleted automatically by applying the upgrade.
If legal/audit retention is needed instead, use an anonymization policy rather
than the explicitly permanent-delete feature.

## Tests

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Vitest executes real PostgreSQL migration/function/RLS tests through PGlite,
React component tests, invoice/date/pagination tests and the Edge HTTP handler
with injected Auth dependencies. PGlite tests do not simulate every concurrent
Postgres session, actual GoTrue internals, Supabase Realtime infrastructure or
hosted Storage. Browser tests use Chromium/mobile dimensions and a deliberately
mocked Supabase HTTP API. They are not evidence of a deployed Supabase project.
See `TEST_REPORT.md` for the actual execution results and limitations.
