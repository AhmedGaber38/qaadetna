# قعدتنا

React / TypeScript / Vite + Supabase. Arabic café orders with an admin dashboard.

## Run locally

Copy `.env.example` to `.env.local`, fill in the project's public Supabase URL and
anonymous key, then run `npm install` and `npm run dev`.

Checks: `npm run typecheck`, `npm run build`, `npm test`.
Never put a Supabase service role key in frontend environment variables.

## Deploy the menu/cart update

1. Back up the database, then execute
   `supabase/migrations/202611060001_menu_cart_media.sql` in the Supabase SQL Editor
   as the database owner. This extends the existing schema; it is not an initial
   database setup. It expects the existing `profiles`, `menu_items`, `gatherings`
   and `orders` tables and the `add_order(p_item uuid, p_qty integer)` function.
2. The migration adds optional image/audio URLs, a public `menu-media` storage
   bucket, admin upload policies and an atomic, idempotent `add_orders` RPC.
   Existing menu items keep working without media. Uploaded media are public;
   writing files requires an approved admin account.
3. Deploy the frontend after the SQL succeeds. No new environment variables are
   needed. Supabase Realtime must already be enabled for the existing tables.
4. Verify with an approved admin and an approved member as described below.

The old `add_order` must perform its normal approved-user checks and derive
prices and item names on the server. Its implementation is outside this repo.
The batch function adds explicit membership, gathering and quantity checks and
calls it inside one transaction. Never trust client-submitted prices.

## Behavior

Members build a cart using +/− per item (0–50), review its total, and send all
items together. The admin sees them in the existing orders dashboard. A failed
batch saves no lines. Retrying the identical in-memory request uses the same
request ID to avoid duplicates after a lost response. Refreshing the page clears
the unsent cart and its retry ID; check "طلباتي" before re-entering a cart after
an uncertain network response. Changing/closing a gathering clears the cart.

An admin can add/edit a name, price, image and MP3, preview media, and remove the
image/audio from an item. Images: JPEG/PNG/WebP up to 5 MiB. Audio: MP3 up to
10 MiB. Files use random names. Failed saves attempt to remove newly uploaded
files; replaced/removed media remain in storage so historical or cached clients
are not broken and can be cleaned up separately. Files are not stored in Git.

An item's audio plays when a member presses +, respecting the global sound
setting; items without audio use the existing tea sound. Sounds never overlap.

## Manual verification on a configured Supabase project

- Admin: create an item with image + MP3; preview, save, reload and edit it.
  Verify replacement/removal, inactive items and existing items without media.
- Member: choose several items, increase/decrease each, clear the cart, verify
  totals and send. Check each quantity and server price in the admin dashboard.
- Check sound enabled/disabled on a phone, including Safari.
- Disable one selected item or close/change the gathering before sending: no
  partial orders should be inserted. The cart should refresh on Realtime events.
- Retry a successful RPC with the same user/request ID: no duplicate orders.
  Force a failure on a later line: earlier lines and the receipt must roll back.
- Anonymous/pending/member accounts must be unable to upload/delete menu files.
  Anonymous/pending accounts must be unable to use the batch RPC.

The original database schema, RLS policies and original RPC definitions are not
included. Test the migration against the actual database before production.
