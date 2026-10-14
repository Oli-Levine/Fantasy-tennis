# Fantasy Tennis League – Build Brief

You're building a fantasy-football-style web app for our university BUCS tennis club. Build in phases; after each one, run the tests, commit, push, and give a short summary plus what to test on a phone.

The visual reference for the player card grid and the stats header bar is a screenshot of a FPL-style tennis team page: a white rounded panel with a stats header row (e.g. "6 / 6 Players", "$0.0m Budget left", "2d 16h Until Deadline", plus "Auto-pick" and a dark "Clear" button on the right), a thin divider, then a 3-column grid of rounded light-grey player cards. Each card has a cut-out player photo, a small white rounded rank badge (e.g. "#7") top-left, and below the card the short name ("A.De Minaur") on the left and price on the right in grey.

---

## 1. Stack & setup
- Next.js (App Router, TypeScript), Tailwind CSS + shadcn/ui.
- Supabase for Auth, Postgres and Storage (player photos). Row Level Security on every table.
- Hosting is Vercel, auto-deploying from GitHub on every push to `main`. See section 11 for current setup status.
- Never hard-code keys. Public keys go in `.env.local` (gitignored) and Vercel environment variables. Any secret key is only ever used server-side.
- Mobile-first, installable PWA (manifest, app icon, "Add to Home Screen"). Most users will be on phones.
- All times are Europe/London, handling BST/GMT changes correctly.
- Currency is £, with prices in millions to one decimal place (e.g. £8.5m).

## 2. Users & login
- Google sign-in with any Google account. Don't use email magic links for now, because Supabase's default email sending is heavily rate-limited.
- Access is controlled by a **club join code**, not an email domain. After their first sign-in, a user must enter the join code before they can create a team. The admin can view and change the code in the Admin page, and can remove any user.
- Walk the owner through setting up Google sign-in in Supabase and Google Cloud step by step, since they've never done it.
- First login: choose a team name (unique, editable later) and a display name.
- Roles are `user` and `admin`. Admin access is enforced in the database (RLS), not just hidden in the UI.

## 3. Game structure
- **Squad:** 5 players, made up of 4 starters and 1 bench. Total budget **£35.0m**.
- **Player pool:** up to 40 club players across teams 1s–6s. Several managers can own the same player.
- **Gameweek cycle:** the deadline is **every Tuesday at 21:00 UK time**.
  - At the deadline, each manager's squad (players, captain, vice-captain, chip) is **snapshotted and locked**, enforced server-side.
  - BUCS matches are played, the admin enters results, then the admin **publishes** the gameweek and points appear.
  - After the deadline, edits apply to the next gameweek.
  - Storing a per-gameweek snapshot of every team is essential for history, Free Hit and recalculations.
- **Bench [default]:** scores 0 unless a starter is marked "did not play", in which case the bench player automatically comes in.
- **New managers:** unlimited changes until their first deadline. Late joiners start on 0 points.
- **Blank weeks** (holidays, no fixtures) can be marked by the admin. No deadline or scoring runs for those weeks.

## 4. Transfers
- **1 free transfer per gameweek.** Each extra transfer costs **−5 points** in that gameweek. Free transfers don't roll over **[default]**.
- A transfer swaps a squad player for one not currently in the squad. The squad must stay within £35.0m at current prices.
- Before confirming, show a preview with players out and in, the new budget, and any points hit (e.g. "This will cost −5 pts").
- Unlimited free changes while a Wildcard or Free Hit is active.

## 5. Captain & chips
- **Captain (required every week):** one starter, scores **2×**.
- **Vice-captain [default]:** if the captain didn't play, the vice-captain scores 2× instead.
- **Chips:** each can be used **once per season**, with a **maximum of one chip per gameweek**. A chip can be cancelled until the deadline.
  - **Triple Captain:** the captain scores **3×** for one gameweek.
  - **Free Hit:** unlimited free transfers for one gameweek (within budget). The squad reverts to the previous gameweek's squad afterwards.
  - **Wildcard:** unlimited free transfers (within budget). The changes are permanent.
- Chips are chosen from a dropdown on the Team page, with a confirm modal explaining the effect. Show which chips remain.

## 6. Scoring
- The admin defines scoring rules as **name | points (+ or −) | type**. Type is either:
  - `tick` (yes/no, e.g. "Won match"), or
  - `count` (a number, e.g. "Sets won" × points).
- Weekly results entry is a grid with one row per player and one column per rule, using tickboxes or number inputs. Each player also has a "did not play" toggle. The admin can **save a draft**, then **publish**.
- Player gameweek points = sum of (rule points × count).
- Manager gameweek points = sum of the 4 starters (after any auto-sub), with the captain multiplier applied, minus transfer hits.
- All scoring lives in **one pure function with unit tests** covering: captain, triple captain, captain did not play to vice-captain, auto-sub, transfer hits, Free Hit revert and Wildcard.
- Each rule also has a **category**: `match` (e.g. win, bagel, double bagel) or `other` (e.g. attended social, no-show). "Did not play" only triggers the bench auto-sub and vice-captain switch. A player marked "did not play" still scores their `other` points (e.g. a social), and those count for their manager. All rules stack, so tick everything that applies.
- The admin can create, edit and delete rules at any time from the Admin page. No rules are hard-coded.
- Editing a published gameweek **recalculates everything automatically**.
- Store every rule result as raw rows (`player_id, gameweek_id, rule_id, count`). A stats page will be built later from this data, so don't build it now, but don't lose the data.

## 7. Pages (bottom nav: Home · Team · League · Rules, plus Admin for admins)

**Home**, styled like the screenshot:
- Header bar showing team name, budget remaining, a live countdown to Tuesday 21:00, last gameweek points and overall rank.
- The 4 starters as a card grid. Each card shows photo, name, club team (1s–6s), price, last gameweek points, and a "C" or "TC" badge.
- The bench player shown as a visually separate card.
- A banner when a chip is active.

**Team**:
- Shows the current squad.
- A player list with photo, name, club team, price, total points and last gameweek points. Includes search, a filter by club team, and sorting by price or points.
- Unaffordable players are greyed out with the reason shown.
- Captain and vice-captain selectors, the chip dropdown, a transfers counter, the hit preview and a confirm step.

**League**:
- Standings ranked 1–n showing rank, team name, manager, gameweek points, total points and rank movement arrows. Teams on equal points share a rank **[default]**.
- Tapping a team shows their squad for **locked/past gameweeks only**.

**Rules**:
- Explains how the game works, chips and transfers.
- The scoring table is generated from the scoring rules table, so it always stays in sync.

**Admin** (admins only, must work well on a phone):
- **Players:** add, edit and delete. Fields are name, photo upload (auto-cropped to a square and compressed), club team (1s–6s), price and an active/unavailable flag. Includes **CSV import**.
- **Scoring rules:** create, edit and delete.
- **Gameweeks:** auto-generated weekly Tuesday 21:00 deadlines, with editable dates, blank-week marking and status (open / locked / published).
- **Results entry:** the grid described in section 6.
- **Users:** list users, promote to admin, remove.

## 8. Design
- Colours are red (primary), black, white, with **gold** for highlights (captain badges, top 3 in the league, chips).
- Define all colours, fonts, radius and spacing as theme tokens **before** building any screens.
- Rounded cards, soft shadows and generous whitespace. Use a bold sans-serif for headings (Inter or Poppins).
- When a player has no photo, show their initials on a red background.
- Use skeleton loaders, plus clear empty and error states on every screen. Update the UI optimistically when picking players.
- Design for a 375px-wide phone first. If Playwright MCP is available, take screenshots at phone width and fix layout issues yourself.

## 9. Out of scope for now
Stats page, mini-leagues, notifications, automatic price changes.

## 10. Phases
1. Project setup, Supabase connection, Google auth with the uni-domain restriction, theme tokens, nav shell, first Vercel deploy.
2. Database schema, RLS policies, and a seed script with 40 fake players, 10 fake managers and sample scoring rules.
3. Admin pages for players (CSV import and photos), scoring rules and gameweeks.
4. Team page with squad picking, budget, captain/vice-captain and the deadline lock.
5. Transfers, hits and chips.
6. Results entry, the scoring engine with tests, publishing, and the league table.
7. Home page polish, Rules page, PWA, and a final mobile QA pass.

---

## 11. Current setup status
The owner is building and deploying a website for the first time, so explain each setup step in plain language and say exactly what to click or paste.

- **Device:** the owner uses Claude Code on an iPad (cloud sessions), not a laptop, and can't run anything locally. Everything is tested on Vercel deployment links. Push early so progress is visible there.
- **GitHub:** repo is `https://github.com/Oli-Levine/Fantasy-tennis`. Work in and push to this repo.
- **Database setup:** Supabase is not reachable from the cloud session, so write the schema, RLS policies and seed data as SQL files in the repo, and tell the owner exactly what to paste into the Supabase **SQL Editor**, in what order.
- **Data:** only load **fake test data** (players, managers and scoring rules). The owner will enter the real players, prices, photos and rules through the Admin page, so the fake data must be easy to delete in one go.
- **Supabase:** the project is created. The project URL and anon key live in `.env.local` (gitignored) and in Vercel environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). They must never be written into this file or committed. No secret (service-role) key is in use; if one is needed (e.g. for seeding), ask the owner to add it themselves.
- **Vercel:** account exists. Once code is on GitHub, the owner imports the repo in Vercel and adds the environment variables before clicking Deploy. If work is pushed to a branch other than `main`, explain how to merge it so the main site updates.
- **GitHub Secrets:** not needed — keys live in `.env.local` and Vercel environment variables. Flag it if that changes.

---

## 12. Implementation notes (for whoever works on this next)
- **Next.js 16** — read `AGENTS.md` and the docs in `node_modules/next/dist/docs/` before using unfamiliar APIs. Middleware is now `src/proxy.ts`. `cacheComponents` is deliberately **off** (every screen is per-user, so classic dynamic rendering is simpler). Run `npm run typecheck` (it runs `next typegen` first for `PageProps`/`LayoutProps`).
- **shadcn/ui** — the shadcn registry is blocked from cloud sessions, so components in `src/components/ui` are hand-written from the shadcn source using the `radix-ui` package. Add new ones the same way.
- **Theme** — use the tokens in `src/app/globals.css` (`bg-primary`, `text-gold`, `rounded-card`, `rounded-panel`, `shadow-soft`, `font-heading`, `h-nav`, `px-gutter`, `max-w-content`); don't hard-code colours.
- **Time** — use `src/lib/time.ts` (Europe/London via `@date-fns/tz`) for anything deadline-related.
- **Auth** — `requireUser()` in `src/lib/auth.ts` for server components. `DEV_SKIP_AUTH=1` with `npm run dev` fakes a signed-in user for local screenshots; it is inert in production builds.
- **QA** — `DEV_SKIP_AUTH=1 npm run dev`, then `BASE_URL=http://localhost:3000 CHROMIUM_PATH=/opt/pw-browsers/chromium npm run screenshots`.
