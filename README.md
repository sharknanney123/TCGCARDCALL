# TCGCardCall

**Call the next card spike.** A free-to-play fantasy market game for Magic: The Gathering.
Players start each monthly season with $10,000 in virtual credits, take fractional positions
in a curated 500-card pool at real daily market prices, and compete on percent gain.

No real money. No cash-out. No prizes. No real card ownership.

Built to the v2 Developer Handoff Spec: Next.js 14 (App Router) + Supabase + Vercel, with
Scryfall daily pricing and all game rules enforced server-side in Postgres.

---

## What's implemented

- **Auth**: email/password signup with required email verification, unique usernames, forgot password.
- **Seasons**: $10k starting balance, late-joiner flagging (after day 7), fee-free auto-liquidation
  at season end, archived standings (`season_results`), balance reset.
- **Trading engine** (`execute_trade` Postgres function — atomic, can't be bypassed from the client):
  fractional positions (4 dp), 1% fee, $10 minimum, 10 trades/day (America/Chicago),
  $2,500 per-card position cap, no shorting, stale-price (>48h) trading pause,
  weighted-average cost accounting with realized/unrealized gains.
- **Pages**: dashboard, market (search/filter/sort), card detail with price history chart,
  trade modal, portfolio, public portfolios (`/u/username`), leaderboard (3-distinct-card
  qualification, tie-breaking, late joiners separated), Biggest Calls (held + sold,
  $10/24h qualification), watchlist, admin.
- **Pricing**: daily Vercel Cron → Scryfall `/cards/collection` (batches of 75, ~7 requests
  for 500 cards) → immutable `price_snapshots`. Admin can trigger manually or upload CSV fallback.
- **Analytics**: `analytics_events` table capturing the spec's validation events; 7-day summary
  on the admin page.
- **Admin**: season lifecycle, manual price runs, CSV import (pool and/or prices), card
  enable/disable (mid-season removals keep holders whole), player list, audit log.

## Setup (about 20 minutes)

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier is plenty for 50 users).
2. SQL Editor → paste and run all of `supabase/schema.sql`.
3. Authentication → Providers → Email: leave **Confirm email** ON (required by the game rules).
4. Authentication → URL Configuration: set Site URL to your deployed URL and add
   `https://YOUR-APP.vercel.app/auth/callback` to redirect URLs.
5. Settings → API: copy the project URL, anon key, and service-role key.

### 2. Local dev

```bash
cp .env.example .env.local   # fill in the Supabase values + a random CRON_SECRET
npm install
npm run dev
```

### 3. Make yourself admin and start Season 1

Register in the app, verify your email, then in the Supabase SQL editor:

```sql
update public.profiles set role = 'admin' where username = 'YOUR_USERNAME';
insert into public.seasons (name, start_date, end_date)
values ('Season 1', current_date, current_date + interval '30 days');
```

### 4. Import the card pool

The easiest path: list card names in a text file (see `scripts/pool-example.txt` — 12 staples
to test with), then on your machine run:

```bash
node scripts/build-pool.mjs scripts/pool-example.txt > pool.csv
```

The script looks each card up on Scryfall, fills in the `scryfall_id` and image URL, and skips
anything under the $1.00 pool floor. `supabase/seed_cards_sample.csv` documents the raw CSV
format if you'd rather build it by hand.

Admin page → **Import CSV**. Then press **Run price update now** — current prices come straight
from Scryfall, so the CSV doesn't need price columns at all.

Pool rules from the spec: ~200 popular / 100 meta / 75 commander / 75 recent / 50 sleeper,
every card ≥ $1.00, one printing per card, Near Mint non-foil unless `finish` says otherwise.

### 5. Deploy to Vercel

1. Push to a GitHub repo you own, import it in Vercel.
2. Add the five env vars from `.env.example` (set `NEXT_PUBLIC_SITE_URL` to the Vercel URL).
3. `vercel.json` already schedules the daily price job at 08:00 UTC (≈ 3:00 AM Central).
   Vercel Cron automatically sends `Authorization: Bearer $CRON_SECRET`.

## Operations

- **Daily price update**: automatic via cron. Status and failures appear in the admin audit log.
  Manual trigger: admin page button, or `curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR-APP/api/cron/update-prices`.
- **Ending a season**: admin page → End current season. This liquidates every open position at
  the latest snapshot price (no fee), writes `season_results`, archives the season. Then start
  the next one — everyone re-joins with a fresh $10,000 on their next visit.
- **Removing a card mid-season**: "Disable buys" on the admin page. Holders keep their position
  and it keeps pricing; it just can't be bought anymore. Never delete cards with history.
- **Reading the validation metrics**: admin page shows 7-day event counts. For deeper cuts,
  query `analytics_events` in Supabase (e.g., logins within 24h of each price update).

## Where the rules live (for future changes)

| Rule | Location |
|---|---|
| Fees, limits, cap, min, stale, no-shorting | `supabase/schema.sql` → `execute_trade()` |
| Leaderboard qualification + tie-breaking | `schema.sql` → `refresh_season_rankings()` |
| Biggest Calls qualification | `schema.sql` → `v_biggest_calls` view |
| Season end | `schema.sql` → `end_active_season()` |
| Price ingest | `src/app/actions.ts` → `updatePricesFromScryfall()` |

One deliberate deviation from the v2 spec: instead of downloading Scryfall's full bulk-data file
(~200MB+, awkward in a serverless function), the ingest uses Scryfall's `/cards/collection`
endpoint — 7 small batched requests for 500 cards, same TCGplayer-sourced prices, well within
Scryfall's rate guidance. If the pool ever grows past a few thousand cards, switch to bulk-data
streaming in a background worker.

## Boundaries (do not remove)

Free-to-play, virtual credits only. No deposits, withdrawals, cash-out, prizes, or paid entry —
not before legal review, per the spec. The disclaimer, Scryfall attribution, and Wizards fan-content
notice live in the footer (`src/app/layout.tsx`).
