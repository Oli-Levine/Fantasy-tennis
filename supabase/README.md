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
| 6 | `admin/make_me_admin.sql` | Makes you the first admin (edit the email first) |
| 7 | `seed/seed_test_data.sql` | Optional: 40 fake players, 10 fake managers, sample rules |

Migrations are safe to run again. Later phases add `0005_…`, `0006_…`; run each new one once, in order.

## Handy scripts

- `seed/delete_test_data.sql` (or **Admin → Delete test data**) — removes **all** fake data in one go (anything marked `is_test_data`), keeping real players, rules and managers.
- `admin/show_join_code.sql` — shows the current join code (admins can also see and change it on the Admin page).

## Tests

`npm test` runs every file here against a real Postgres engine (PGlite) with a small
Supabase stand-in (`tests/supabase-stub.sql`), and checks the security rules as
signed-out visitors, non-members, members and admins.
