# Database (Supabase)

All database changes live here as plain SQL files. Run them in
**Supabase → SQL Editor → New query**: paste the whole file, then click **Run**.

## First-time setup (in this order)

| # | File | What it does |
| - | ---- | ------------ |
| 1 | `migrations/0001_schema.sql` | Creates the tables, join code and core functions |
| 2 | `migrations/0002_security.sql` | Turns on Row Level Security, permissions and the photo bucket |
| 3 | `migrations/0003_admin.sql` | Admin tools: gameweek generator, user list, safety checks |
| 4 | `migrations/0004_squads.sql` | Squad saving and the deadline lock (snapshots) |
| 5 | `migrations/0005_transfers_chips.sql` | Transfers, points hits and chips |
| 6 | `migrations/0006_results.sql` | Results entry, publishing and points |
| 7 | `migrations/0007_reset_and_delete.sql` | Restart the season; delete players safely |
| 8 | `migrations/0008_playing_and_club_limit.sql` | Non-playing accounts; max players per club team |
| 9 | `admin/make_me_admin.sql` | Makes you the first admin (edit the email first) |
| 10 | `seed/seed_test_data.sql` | Optional: 40 fake players, 10 fake managers, sample rules |

Migrations are safe to run again. Later phases add `0005_…`, `0006_…`; run each new one once, in order.

## Handy scripts

- `seed/delete_test_data.sql` (or **Admin → Delete test data**) — removes **all** fake data in one go (anything marked `is_test_data`), keeping real players, rules and managers.
- `admin/show_join_code.sql` — shows the current join code (admins can also see and change it on the Admin page).

## Tests

`npm test` runs every file here against a real Postgres engine (PGlite) with a small
Supabase stand-in (`tests/supabase-stub.sql`), and checks the security rules as
signed-out visitors, non-members, members and admins.

## Daily keepalive and backups (GitHub Actions)

`.github/workflows/supabase-keepalive-backup.yml` runs every day at 03:17 UTC (and on demand from
**Actions → Supabase keepalive & backup → Run workflow**):

- **Keepalive** — a tiny read query (`count(*)` of players) plus an API health check, so the
  free-tier project never pauses for inactivity.
- **Backup** — `pg_dump` of the `public` and `private` schemas (all game data), as a `.dump`
  (for `pg_restore`) and a gzipped `.sql`, plus a best-effort data dump of `auth` + `storage`
  (sign-ins and photo records). Uploaded as a workflow artifact kept for **30 days**; never committed.

Repository secrets it needs (GitHub → **Settings → Secrets and variables → Actions**):

| Secret | Where to find it in Supabase |
| ------ | ---------------------------- |
| `SUPABASE_DB_URL` | **Connect** (top of the project) → **Connection string** → **Session pooler** URI, with `[YOUR-PASSWORD]` replaced by the database password (Project Settings → Database → Reset database password if you don't have it). Use the *session pooler*, not the direct connection: GitHub's runners can't reach the direct (IPv6-only) address. |
| `SUPABASE_URL` | Project Settings → **Data API** → Project URL (`https://<ref>.supabase.co`) |
| `SUPABASE_ANON_KEY` | Project Settings → **API Keys** → the `anon` `public` key (or the publishable key) |

To restore a backup into an empty Supabase project: run the migrations first, then
`pg_restore --no-owner --no-privileges --data-only -d "<connection string>" fantasy-tennis-app-<date>.dump`.
