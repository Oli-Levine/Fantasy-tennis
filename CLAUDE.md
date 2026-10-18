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
- Roles are `user`, `captain` (team captain: enters results, can't publish or use other admin tools) and `admin`. Access is enforced in the database (RLS), not just hidden in the UI.

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
1. Project setup, Supabase connection, Google auth (the uni-domain restriction was replaced by the club join code, see section 2), theme tokens, nav shell, first Vercel deploy.
2. Database schema, RLS policies, and a seed script with 40 fake players, 10 fake managers and sample scoring rules.
3. Admin pages for players (CSV import and photos), scoring rules and gameweeks.
4. Team page with squad picking, budget, captain/vice-captain and the deadline lock.
5. Transfers, hits and chips.
6. Results entry, the scoring engine with tests, publishing, and the league table.
7. Home page polish, Rules page, PWA, and a final mobile QA pass.

---

## 11. Current setup status
The owner is building and deploying a website for the first time, so explain each setup step in plain language and say exactly what to click or paste.

- **Device:** the owner uses Claude Code on an iPad (cloud sessions), not a laptop, and can't run anything locally. Everything is tested on the Vercel deployment. Push early so progress is visible there.
- **GitHub:** repo is `https://github.com/Oli-Levine/Fantasy-tennis`. Work on and push straight to `main` (agreed with the owner: Vercel deploys `main`, and there's no merge step to manage on an iPad).
- **Vercel:** ✅ imported and deploying `main` automatically, with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` set.
- **Google sign-in:** ✅ set up in Google Cloud and Supabase, and working.
- **Supabase:** ✅ project live. It's **not reachable from cloud sessions**, so the owner runs SQL by hand: give them the file path and tell them to open it on GitHub → **Copy raw file** → Supabase **SQL Editor → New query** → paste → **Run** (and "Run this query" if warned about destructive operations). Already run: `0001_schema.sql` … `0004_squads.sql` `0005_transfers_chips.sql`, `0006_results.sql`, `0007_reset_and_delete.sql` `0008_playing_and_club_limit.sql`, `0009_team_captains.sql` (**pending: given to the owner 18 Oct 2026, not yet confirmed run**), `admin/make_me_admin.sql` (the owner is admin) and `seed/seed_test_data.sql`. On 18 Oct 2026 the owner pressed **Admin → Delete test data** and **Admin → Restart season**, so there is **no fake data** and no gameweek history: the season starts clean at gameweek 1 (Tue 20 Oct 2026, 21:00). `admin/check_points.sql` is a read-only diagnostic (stored vs expected gameweek points per manager) the owner can run in the SQL Editor. Every new migration needs the same instructions in the phase summary.
- **Keys:** the project URL and anon key live only in Vercel (and an uncommitted `.env.local`). They must never be written into this file or committed. Tests, builds and screenshots don't need them. No service-role key is in use; if one is ever needed, ask the owner to add it in Vercel themselves.
- **GitHub Secrets:** `SUPABASE_DB_URL` (session pooler URI with password), `SUPABASE_URL`, `SUPABASE_ANON_KEY` — used only by `.github/workflows/supabase-keepalive-backup.yml` (daily keepalive query + `pg_dump` of the `public`/`private` schemas uploaded as a 30-day artifact; dumps are gitignored and never committed). The repo is **public** (owner's choice), so artifacts are downloadable by any GitHub user: never add the `auth` schema (sessions/refresh tokens) to the dump. See `supabase/README.md`.

---

## 12. Implementation notes (for whoever works on this next)
- **Next.js 16** — read `AGENTS.md` and the docs in `node_modules/next/dist/docs/` before using unfamiliar APIs. Middleware is now `src/proxy.ts`. `cacheComponents` is deliberately **off** (every screen is per-user, so classic dynamic rendering is simpler). Run `npm run typecheck` (it runs `next typegen` first for `PageProps`/`LayoutProps`).
- **shadcn/ui** — the shadcn registry is blocked from cloud sessions, so components in `src/components/ui` are hand-written from the shadcn source using the `radix-ui` package. Add new ones the same way.
- **Theme** — use the tokens in `src/app/globals.css` (`bg-primary`, `text-gold`, `rounded-card`, `rounded-panel`, `shadow-soft`, `font-heading`, `h-nav`, `px-gutter`, `max-w-content`); don't hard-code colours.
- **Court design (Oct 2026)** — every screen sits on a bird's-eye hard court: `public/court-bg.svg` on a fixed `100lvh` layer (`.court-bg`, rendered by `src/components/app/court-background.tsx` in the root layout; never `background-attachment: fixed`, iOS ignores it). Full strength on `/` and `/team`, dimmed (`--court-dim: 0.55`) elsewhere. Palette: `court-red`, `court-blue`, `line-yellow`, `line-white`, `navy`, `navy-glass` (old red/gold/ink tokens map onto these). Text straight on the court uses `.on-dark` (white text, red `text-primary` turns yellow); `.bg-card`/`.bg-surface` reset to dark text automatically. Header, bottom nav and summary panels are `bg-navy-glass`. Team page: `PITCH_VIEW` in `team-builder.tsx` draws the starters on the court (`team/pitch-view.tsx`, positions are % of the screen matching the court lines: net 50%, service lines 30.6%/69.4%); `false` restores the old card grid.
- **Branding (Oct 2026)** — the app is called **UOB Tennis Fantasy** (home-screen name "UOB Tennis"). `LogoMark` (`src/components/app/logo.tsx`) is the club crest `public/brand/crest.png`, cut out of the club logo with a transparent background; size it by height (`h-8`). Favicon `src/app/icon.png`, `src/app/apple-icon.png` and `public/icons/*` are the crest on black.
- **Time** — use `src/lib/time.ts` (Europe/London via `@date-fns/tz`) for anything deadline-related.
- **Auth** — `getViewer()` (signed-in user + profile), `requireMember()` and `requireAdmin()` in `src/lib/auth.ts` for server components and actions. `DEV_SKIP_AUTH=1` with `npm run dev` fakes a signed-in user for local screenshots; it is inert in production builds.
- **Database** — SQL lives in `supabase/` (see `supabase/README.md`). Add new migrations as `supabase/migrations/000N_*.sql`, keep them re-runnable, wrap them in `begin; … commit;`, update `src/lib/database.types.ts` by hand, and extend `supabase/tests/database.test.ts` (PGlite + `supabase-stub.sql`) to cover new RLS rules. Fake data is marked `is_test_data` and removed by `private.delete_test_data()`. Supabase runs API requests with **pg-safeupdate**: every `UPDATE`/`DELETE` (including inside functions/triggers) needs a `WHERE` clause (`where true` if you really mean all rows); `supabase/tests/sql-lint.test.ts` enforces this because PGlite doesn't.
- **Access model** — `profiles.joined_at` set = member (entered the join code); `role = 'admin'` = admin. `requireMember()` / `requireAdmin()` in `src/lib/auth.ts` gate the UI; RLS + security-definer functions enforce it in the database. Squads, chips, transfers and snapshots have no direct-write grants: change them only through security-definer functions that check deadlines and budget.
- **Admin UI** — pages under `src/app/(app)/admin/*` load data in the server page and pass it to a `*-manager.tsx` client component; writes go through `actions.ts` server actions that call `requireAdmin()` and return `ActionResult` (`src/lib/action-result.ts`), then `revalidatePath("/", "layout")`. Forms open in `Dialog` (a bottom sheet on phones); destructive actions use `ConfirmDialog`. Player photos are cropped/compressed in the browser (`src/lib/image.ts`) and uploaded straight to Storage at `player-photos/<player id>/<timestamp>.jpg`. In dev bypass mode pages use sample data from `src/lib/dev-fixtures.ts`.
- **Squads & deadline lock** — squad edits are pure functions in `src/lib/squad.ts` (instant UI) and are saved via `public.save_squad()`, which first runs `private.lock_due_gameweeks()`: every non-blank open gameweek past its deadline gets a snapshot (`gameweek_entries` + `gameweek_picks`) of each complete squad and is marked locked. Since all squad writes run the lock first, snapshots always reflect the squad at the deadline without a cron job. Pages call `sync_gameweeks()` via `loadTeamData()` (`src/lib/team-data.ts`). Player changes after a manager's first lock are transfers (see section 13).
- **Dates** — format with `formatLondonDateTime` (built from parts so server and browser render identical text; plain `Intl` output differs between Node and Chrome and breaks hydration).
- **QA** — `DEV_SKIP_AUTH=1 npm run dev` (add `DEV_PROFILE=outsider|joined|member` to preview onboarding states; default is an admin), then `BASE_URL=http://localhost:3000 CHROMIUM_PATH=/opt/pw-browsers/chromium npm run screenshots`.

---

## 13. Progress log & handover (keep this up to date at the end of each phase)

**Done and tested by the owner on their phone:** Phases 1–7 and the tweaks below (0007, 0008).
- Phase 1: app shell, Google sign-in, theme tokens, bottom nav, Vercel deploy.
- Phase 2: schema + RLS (`0001`, `0002`), join-code onboarding (`/join`: code → team name + display name), fake seed data.
- Phase 3: Admin hub, Players (photos, CSV import), Scoring rules (archive instead of delete when used), Gameweeks (generator, blank weeks, renumbering), Users (promote/remove), "Delete test data" button (`0003`).
- Phase 4: Team page (squad picking, auto-pick/clear, captain/VC, bench swaps, player pool with search/filter/sort and greyed-out reasons, save bar), Home shows the real squad, deadline lock + snapshots (`0004`). The owner has generated weekly gameweeks; the first real deadline is **Tue 20 Oct 2026, 21:00**.

**How each phase ends:** run lint, typecheck, `npm test` and `npm run build`; take 375px screenshots with Playwright and fix layout issues; commit and push to `main`; then reply with a short summary, any SQL file(s) the owner must run (with the click-by-click steps above), and a numbered "what to test on your phone" list.

- Phase 5: transfers, hits and chips (`0005_transfers_chips.sql`).
  - Transfers are counted against the manager's **baseline** = latest `gameweek_entries` before the coming deadline whose chip isn't `free_hit` (`private.baseline_gameweek`). Undoing a swap is therefore free. No baseline = new manager = unlimited free changes. `public.get_transfer_state()` returns the live count/hit; `transferSummary` in `src/lib/squad.ts` mirrors it for the UI.
  - `private.lock_due_gameweeks()` now also fills `transfers_made` / `transfer_hit`, logs paired swaps in `public.transfers` (via `private.gameweek_moves`), reverts Free Hit squads to the baseline, and refunds chips that had no effect (no complete squad, or the week was later marked blank). It only processes entries it newly created, so re-running is safe.
  - Chips: `public.play_chip(chip)` / `public.cancel_chip(chip)` act on the coming gameweek only. Wildcard/Free Hit are refused for managers with no baseline (changes are already free). Triple Captain is only stored; scoring is Phase 6 (captain ×3, or VC ×3 if the captain doesn't play).
  - UI: transfers bar, save-bar summary and `transfer-preview.tsx` sheet (shown only when players change after the first lock); `chips-card.tsx` (dropdown → confirm modal, remaining chips); gold chip banner and "TC" badge on Home. `DEV_CHIP=wildcard|free_hit|triple_captain` previews an active chip in dev bypass mode.

- Phase 6: results entry, scoring, publishing, league (`0006_results.sql`).
  - **Scoring** is `src/lib/scoring.ts` (pure, tested in `scoring.test.ts`): player points = Σ rule points × count (all categories; "did not play" never removes points); manager = 4 starters + bench if any starter DNP, captain ×2 (×3 TC; VC gets it if the captain DNP; nobody if both DNP), minus `transfer_hit` (0 with Wildcard/Free Hit). Each gameweek is scored from its own snapshot.
  - **Storing points:** `src/lib/recalculate.ts` loads a gameweek's raw results + snapshots, runs `scoreGameweek`, and calls `public.admin_store_points()` (also publishes). It runs on Publish, on any save to a published gameweek, when a rule's points change (`recalculatePublished`), and when the Gameweeks editor sets a week to published.
  - **Results entry:** `/admin/results` (now `/results` with `save_results()`, see 0009) (grid: sticky player column, DNP + tick/stepper per rule, "In a team" filter, Save draft / Publish / Save & recalculate). Raw results are replaced atomically by `public.admin_save_results()`, which only accepts locked/published non-blank weeks; zero counts aren't stored.
  - **League:** `computeStandings` in `src/lib/league.ts` (shared ranks, movement vs the previous published week, "new" for late joiners); `loadLeague()` in `src/lib/league-data.ts` pages through entries. `/league/[userId]` shows a team's locked/published squads with the score breakdown. Home shows the latest GW points and rank.
  - Home shows last published gameweek's *counted* points per card (captain ×2/×3, "Didn't play", "Subbed on") plus a summary link to the breakdown, via `loadLastScore()` in `src/lib/last-score.ts`. The Team page still shows each player's raw points (player form). `src/lib/scoring-input.ts` turns DB rows into scoring input; a DB test runs it end to end.
  - Known limit: `loadTeamData` reads `player_gameweeks` in one request (Supabase caps at 1000 rows), fine for ~25 weeks × 40 players; page it if the season grows.

- Phase 7: Home polish, Rules page, PWA, mobile QA. No new SQL.
  - **PWA:** `src/app/manifest.ts` (standalone, red theme), icons in `public/icons/` (192, 512, maskable 512) and `src/app/apple-icon.png` (180), rendered from an SVG with Playwright. No service worker on purpose: install works without one, and caching per-user pages would risk stale data. `src/components/app/install-prompt.tsx` on Home: Install button on Chrome/Android (`beforeinstallprompt`), Share → Add to Home Screen steps on iPhone/iPad; hidden when installed or dismissed (localStorage).
  - **Rules page:** sections for squad, deadlines, captain/bench, transfers, chips (`CHIPS`), scoring and league. Budget/free transfers/hit come from `club_settings`; the scoring table is generated from active `scoring_rules`, split into on court (`match`) and off court (`other`).
  - **Home:** next-deadline line, league snapshot (top 3 + you), install prompt. Skeleton `loading.tsx` for Team, League, League team, Rules and Admin (`src/components/app/skeletons.tsx`).
  - `npm run screenshots` now covers every screen including the admin sub-pages and `/league/u3`.

- Post-launch tweaks (`0007_reset_and_delete.sql`):
  - **Edit team & name:** `/account` (account menu → "Edit team & name"), `updateProfileAction` updates `profiles.team_name`/`display_name` (unique team name enforced by the DB).
  - **Delete player:** `public.admin_delete_player()` removes the player from current squads and deletes them; refused if they're in any gameweek history (picks, results, transfers).
  - **Restart the season:** Admin hub card → `public.admin_reset_season(clear_squads)`: deletes all entries/picks/transfers/chips/results/points, reopens future gameweeks and deletes past ones (renumbered from 1), optionally empties squads. Typed "RESTART" confirmation.

- `0008_playing_and_club_limit.sql`:
  - **Not playing:** `profiles.is_playing` (default true). Admins toggle it per user in Admin → Users (`public.admin_set_playing`); the owner (organiser) uses it on their own account. Non-playing accounts keep full access, are left out of `loadLeague()` and never get a locked team (`lock_due_gameweeks` filters them). Home shows a note.
  - **Club-team limit:** `club_settings.max_per_club_team` (default 2). `save_squad` refuses squads with more than that from one club team when players change; the UI mirrors it (`ClubLimit`, `addBlocker` "Already 2 from the 1s", `squadProblems`, `autoPick`). Rules page shows it. Most DB tests set the limit to 5 in `beforeAll`; the limit has its own tests. `0003` now drops/recreates `admin_list_users` so it stays re-runnable after 0008 changed its columns.

- `0009_team_captains.sql` — **team captains** (not yet tested by the owner):
  - Role `captain` between `user` and `admin` (`profiles_role_check`), set in Admin → Users ("Make team captain"); `set_user_role` accepts it. `public.can_enter_results()` = captain or admin; `Member.canEnterResults` / `requireResultsEntry()` in `src/lib/auth.ts`.
  - Results entry moved from `/admin/results` to **`/results`** (redirect in `next.config.ts`) so captains can reach it: captains get a "Results" bottom-nav tab, admins reach it from the Admin hub. Captains can enter results for **any** player and save drafts of locked weeks; only admins publish (`admin_store_points` unchanged) or edit published weeks. The server action and DB both enforce it.
  - **`public.save_results()` replaces `admin_save_results()`** (kept for old clients) and only changes the players sent, so captains saving at different times don't overwrite each other. The grid keeps only the user's own edits locally (`edits` merged over `saved`) and sends just the changed players; an unticked player is sent empty to clear them.
  - `player_gameweeks.entered_by/entered_at` record who last saved each player; the grid shows "by <name>" per row and an "Entered by" summary (also in the Publish confirm) so the admin can check every captain has saved before publishing.
  - `DEV_PROFILE=captain` previews the captain view.

- Backups (`.github/workflows/supabase-keepalive-backup.yml`, see section 11 and `supabase/README.md`): daily 03:17 UTC + manual "Run workflow". Keepalive job = `psql` read + `/auth/v1/health` ping; backup job = `pg_dump` (custom + gzipped SQL) of `public` + `private` only, 30-day artifact. Verified green on 18 Oct 2026 (run #3). The pooler connection string must use the database password (letters/numbers only); a wrong password shows as `password authentication failed for user "postgres"`.

### Current state (18 Oct 2026)
- **All 7 phases are built and tested by the owner, plus the tweaks above.** Test data has been deleted and the season restarted (18 Oct 2026). The app is about to launch to the club; the first real deadline is **Tue 20 Oct 2026, 21:00**.
- The owner's account (admin) is set to **not playing**, so it's hidden from the league.
- Out of scope until the owner asks (section 9): stats page, mini-leagues, notifications, automatic price changes. Raw `rule_results` are kept for the future stats page. The owner said they may want **aesthetic changes** next (colours/fonts/cards); theme tokens live in `src/app/globals.css`.

### Owner decisions (don't re-litigate)
- The GitHub repo stays **public**. Consequently backup artifacts are downloadable by any GitHub user: never add the `auth` schema (sessions, refresh tokens) or other credentials to the dump.
- The owner considers the data low-sensitivity and accepted the **join code having no attempt limit** (brute-forceable). Don't add friction around it unless asked.
- Work straight on `main` (no PRs); Vercel deploys every push.

### Known issues from the 18 Oct 2026 review (not fixed; owner chose to leave them for now)
Raise these only if relevant to a requested change, or fix them when touching the same code:
- **Medium:** `admin_delete_player`, `private.delete_test_data` and `admin_set_playing` change squads without calling `private.lock_due_gameweeks()` first. If run after a deadline but before anyone triggers the lock, affected managers can miss that week's snapshot. Fix: `perform private.lock_due_gameweeks();` at the start of each.
- **Medium:** Admin → Gameweeks lets an admin set a status by hand. Setting "locked" before the deadline skips the snapshot entirely (the lock only processes `open` weeks); setting "published" before the deadline scores empty teams. Fix: forbid locking/publishing before the deadline, and re-opening once entries exist.
- **Medium (cleanup):** `private.lock_due_gameweeks()` and `public.save_squad()` are copied whole into `0004` → `0005` → `0008`; only the **latest file's version is live**. Change them by copying the `0008` version into a new migration.
- **Low:** default Supabase grants leave `authenticated` with `TRUNCATE/TRIGGER/REFERENCES` on public tables (not reachable via the API; revoke for hygiene). No security headers (`X-Frame-Options`/CSP `frame-ancestors`, `Referrer-Policy`) in `next.config.ts`.
- **Low:** a save in the last milliseconds before a deadline can miss that week's snapshot (no lock between save and snapshot). Changing a rule from `count` to `tick` keeps old counts > 1. Un-publishing a week leaves `gameweek_entries.points` readable (league ignores it). 1000-row reads without paging: `loadTeamData` (`player_gameweeks`) and `recalculate.ts` (picks/results per gameweek).
- **Low (cleanup):** score-breakdown loading is duplicated in `league/[userId]/page.tsx` and `src/lib/last-score.ts`; club-team filter chips duplicated in `player-pool.tsx` and `results-grid.tsx`; pre-migration fallbacks (`max_per_club_team ?? 2`, `is_playing === false`, "missing update" branches) and the unused `soon` flag on the Admin hub can go; demo fixtures are slightly inconsistent (dev screenshots only).
- Verified fine in that review: RLS on all 12 tables; no direct writes to squads/chips/snapshots; every server action and admin RPC checks permissions server-side (role read from the DB); deadlines enforced in the DB in Europe/London; no secrets anywhere in git history; `npm audit` clean.

### Tips for the next session (cloud container)
- Run `npm ci` first if `node_modules` is missing. The container may start on a detached HEAD: `git checkout -B main origin/main` before working. Checks: `npm run lint`, `npm run typecheck`, `npm test` (unit + PGlite DB tests), `npm run build`.
- Dev server for screenshots: `DEV_SKIP_AUTH=1 npm run dev` (in the background), then `BASE_URL=http://localhost:3000 CHROMIUM_PATH=/opt/pw-browsers/chromium npm run screenshots`. For ad-hoc Playwright scripts outside the repo, import from `/home/user/Fantasy-tennis/node_modules/@playwright/test/index.mjs`. Stop the server with `fuser -k 3000/tcp`. **Don't** use `pkill -f "next dev"`: it matches and kills the calling shell.
- GitHub Actions logs/artifacts are readable with the GitHub MCP tools (`actions_list`, `get_job_logs`), and `actions_run_trigger` can start the backup workflow. `actionlint` (download the release binary) validates workflow edits.
- The owner can't run SQL from the session: every new migration needs the click-by-click Supabase steps (section 11) in the reply, and the app should be pushed only once it works with and without the migration where possible (or warn "run the SQL first").
