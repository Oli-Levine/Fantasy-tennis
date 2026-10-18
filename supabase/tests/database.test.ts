/**
 * Runs the real migration and seed files against Postgres (PGlite) with a
 * small Supabase stand-in, then checks the schema, seed data and the Row Level
 * Security rules from the point of view of different users.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { scoreGameweek } from "../../src/lib/scoring";
import { scoringInputFromRows, type GameweekRows } from "../../src/lib/scoring-input";

const sqlFile = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

const STUB = sqlFile("tests/supabase-stub.sql");
const SCHEMA = sqlFile("migrations/0001_schema.sql");
const SECURITY = sqlFile("migrations/0002_security.sql");
const ADMIN_TOOLS = sqlFile("migrations/0003_admin.sql");
const SQUADS = sqlFile("migrations/0004_squads.sql");
const TRANSFERS = sqlFile("migrations/0005_transfers_chips.sql");
const RESULTS = sqlFile("migrations/0006_results.sql");
const RESET = sqlFile("migrations/0007_reset_and_delete.sql");
const PLAYING = sqlFile("migrations/0008_playing_and_club_limit.sql");
const CAPTAINS = sqlFile("migrations/0009_team_captains.sql");
const SEED = sqlFile("seed/seed_test_data.sql");
const DELETE_TEST_DATA = sqlFile("seed/delete_test_data.sql");

const EARLY_USER = "11111111-1111-4111-8111-111111111111"; // signed in before the migrations ran
const ADMIN = "22222222-2222-4222-8222-222222222222";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const OUTSIDER = "44444444-4444-4444-8444-444444444444"; // signed in, never entered the code
const FAKE_MANAGER_1 = "00000000-0000-4000-a000-000000000001";
const PICKER = "55555555-5555-4555-8555-555555555555"; // picks a squad in the Phase 4 tests
const SCORER = "66666666-6666-4666-8666-666666666666"; // scored end to end in the Phase 6 tests
const CAPTAIN = "99999999-9999-4999-8999-999999999991"; // a team captain (enters results, can't publish)
const CAPTAIN_2 = "99999999-9999-4999-8999-999999999992";

let db: PGlite;

async function signUp(id: string, email: string, fullName: string) {
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, jsonb_build_object('full_name', $3::text))`,
    [id, email, fullName],
  );
}

/** Run a query as a signed-in user (or anon when uid is null), with RLS applied. */
async function as<T = Record<string, unknown>>(uid: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`set role ${uid ? "authenticated" : "anon"}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ""]);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role");
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

async function joinCode() {
  return (await db.query<{ join_code: string }>(`select join_code from private.club_secrets`)).rows[0].join_code;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await signUp(EARLY_USER, "early@example.com", "Early Bird");
  // Run everything twice to prove the files are safe to re-run.
  for (let i = 0; i < 2; i++) {
    await db.exec(SCHEMA);
    await db.exec(SECURITY);
    await db.exec(ADMIN_TOOLS);
    await db.exec(SQUADS);
    await db.exec(TRANSFERS);
    await db.exec(RESULTS);
    await db.exec(RESET);
    await db.exec(PLAYING);
    await db.exec(CAPTAINS);
    await db.exec(SEED);
  }
  await signUp(ADMIN, "admin@example.com", "Ada Admin");
  await signUp(MEMBER, "member@example.com", "Mo Member");
  await signUp(OUTSIDER, "outsider@example.com", "Otto Outsider");
  await db.query(`update public.profiles set role = 'admin', joined_at = now() where id = $1`, [ADMIN]);
  // Most tests pick the cheapest players regardless of club team; the limit has its own tests.
  await db.query(`update public.club_settings set max_per_club_team = 5 where id`);
}, 60_000);

describe("schema and seed", () => {
  it("creates profiles for new sign-ins and for users who signed in earlier", async () => {
    const { rows } = await db.query<{ id: string; display_name: string; joined_at: string | null }>(
      `select id, display_name, joined_at from public.profiles where id in ($1, $2) order by display_name`,
      [EARLY_USER, MEMBER],
    );
    expect(rows.map((r) => r.display_name)).toEqual(["Early Bird", "Mo Member"]);
    expect(rows.every((r) => r.joined_at === null)).toBe(true);
  });

  it("seeds 40 players, 8 rules and 10 managers, all marked as test data", async () => {
    const { rows } = await db.query<Record<string, number>>(`
      select
        (select count(*)::int from public.players where is_test_data) as players,
        (select count(*)::int from public.players) as all_players,
        (select count(*)::int from public.scoring_rules where is_test_data) as rules,
        (select count(*)::int from public.profiles where is_test_data and joined_at is not null and team_name is not null) as managers
    `);
    expect(rows[0]).toEqual({ players: 40, all_players: 40, rules: 8, managers: 10 });
  });

  it("gives every fake manager a valid squad within the £35.0m budget", async () => {
    const { rows } = await db.query<{
      picks: number; distinct_players: number; total: string; captains: number; vices: number; bad_armbands: number;
    }>(`
      select
        count(*)::int as picks,
        count(distinct player_id)::int as distinct_players,
        sum(pl.price)::text as total,
        count(*) filter (where is_captain)::int as captains,
        count(*) filter (where is_vice_captain)::int as vices,
        count(*) filter (where (is_captain or is_vice_captain) and position = 5)::int as bad_armbands
      from public.squad_picks sp
      join public.players pl on pl.id = sp.player_id
      join public.profiles pr on pr.id = sp.user_id and pr.is_test_data
      group by sp.user_id
    `);
    expect(rows).toHaveLength(10);
    for (const squad of rows) {
      expect(squad).toMatchObject({ picks: 5, distinct_players: 5, captains: 1, vices: 1, bad_armbands: 0 });
      expect(Number(squad.total)).toBeLessThanOrEqual(35);
    }
  });

  it("enforces one captain per squad and no captain on the bench", async () => {
    await expect(
      db.query(`update public.squad_picks set is_captain = true where user_id = $1 and position = 3`, [FAKE_MANAGER_1]),
    ).rejects.toThrow(/squad_picks_one_captain/);
    await expect(
      db.query(`update public.squad_picks set is_vice_captain = true, is_captain = false where user_id = $1 and position = 5`, [FAKE_MANAGER_1]),
    ).rejects.toThrow(/check/);
  });

  it("creates a random 6-character join code and the photo bucket", async () => {
    expect(await joinCode()).toMatch(/^[0-9A-F]{6}$/);
    const { rows } = await db.query(`select public from storage.buckets where id = 'player-photos'`);
    expect(rows).toEqual([{ public: true }]);
  });
});

describe("security: signed-out visitors", () => {
  it("can't read any game data", async () => {
    await expect(as(null, `select * from public.players`)).rejects.toThrow(/permission denied/);
    await expect(as(null, `select * from public.profiles`)).rejects.toThrow(/permission denied/);
  });

  it("can't use the join code", async () => {
    await expect(as(null, `select public.join_club('X')`)).rejects.toThrow(/permission denied/);
  });
});

describe("security: signed in but not yet joined", () => {
  it("sees only their own profile and no game data", async () => {
    const profiles = await as<{ id: string }>(OUTSIDER, `select id from public.profiles`);
    expect(profiles.map((p) => p.id)).toEqual([OUTSIDER]);
    expect(await as(OUTSIDER, `select * from public.players`)).toEqual([]);
    expect(await as(OUTSIDER, `select * from public.scoring_rules`)).toEqual([]);
  });

  it("can't pick a team name before entering the code", async () => {
    await as(OUTSIDER, `update public.profiles set team_name = 'Sneaky' where id = $1`, [OUTSIDER]);
    const { rows } = await db.query(`select team_name from public.profiles where id = $1`, [OUTSIDER]);
    expect(rows).toEqual([{ team_name: null }]);
  });

  it("can't read the join code", async () => {
    await expect(as(OUTSIDER, `select public.get_join_code()`)).rejects.toThrow(/Admins only/);
    await expect(as(OUTSIDER, `select * from private.club_secrets`)).rejects.toThrow(/permission denied/);
  });

  it("is rejected with the wrong join code", async () => {
    expect(await as(OUTSIDER, `select public.join_club('WRONG1') as ok`)).toEqual([{ ok: false }]);
    expect(await as(OUTSIDER, `select public.is_member() as ok`)).toEqual([{ ok: false }]);
  });
});

describe("security: club members", () => {
  beforeAll(async () => {
    const code = await joinCode();
    // Codes are case-insensitive and ignore surrounding spaces.
    const [{ ok }] = await as<{ ok: boolean }>(MEMBER, `select public.join_club($1) as ok`, [` ${code.toLowerCase()} `]);
    expect(ok).toBe(true);
  });

  it("can read players, rules and other members", async () => {
    expect(await as(MEMBER, `select id from public.players`)).toHaveLength(40);
    expect(await as(MEMBER, `select id from public.scoring_rules`)).toHaveLength(8);
    const profiles = await as<{ id: string }>(MEMBER, `select id from public.profiles`);
    expect(profiles.map((p) => p.id)).toContain(FAKE_MANAGER_1);
    expect(profiles.map((p) => p.id)).not.toContain(OUTSIDER); // not a member
  });

  it("can set their own names, with unique team names", async () => {
    await as(MEMBER, `update public.profiles set team_name = 'Mo Money', display_name = 'Mo' where id = $1`, [MEMBER]);
    const { rows } = await db.query(`select team_name, display_name from public.profiles where id = $1`, [MEMBER]);
    expect(rows).toEqual([{ team_name: "Mo Money", display_name: "Mo" }]);

    await expect(
      as(MEMBER, `update public.profiles set team_name = ' deuce BIGALOW ' where id = $1`, [MEMBER]),
    ).rejects.toThrow(/profiles_team_name_unique/);
  });

  it("can't make themselves admin or edit someone else", async () => {
    await expect(
      as(MEMBER, `update public.profiles set role = 'admin' where id = $1`, [MEMBER]),
    ).rejects.toThrow(/permission denied/);
    await as(MEMBER, `update public.profiles set team_name = 'Hacked' where id = $1`, [FAKE_MANAGER_1]);
    const { rows } = await db.query(`select team_name from public.profiles where id = $1`, [FAKE_MANAGER_1]);
    expect(rows).toEqual([{ team_name: "Deuce Bigalow" }]);
  });

  it("can't change players, rules or gameweeks", async () => {
    await expect(
      as(MEMBER, `insert into public.players (name, club_team, price) values ('Ringer', 1, 1.0)`),
    ).rejects.toThrow(/row-level security/);
    expect(await as(MEMBER, `update public.players set price = 0.5 returning id`)).toEqual([]);
    expect(await as(MEMBER, `delete from public.scoring_rules returning id`)).toEqual([]);
    await expect(
      as(MEMBER, `insert into public.gameweeks (number, deadline) values (99, now())`),
    ).rejects.toThrow(/row-level security/);
  });

  it("can't see other managers' current squads or write squads directly", async () => {
    expect(await as(MEMBER, `select * from public.squad_picks`)).toEqual([]);
    await expect(
      as(MEMBER, `insert into public.squad_picks (user_id, position, player_id)
                  select $1, 1, id from public.players limit 1`, [MEMBER]),
    ).rejects.toThrow(/permission denied/);
  });

  it("can't use admin functions", async () => {
    await expect(as(MEMBER, `select public.set_join_code('MINE')`)).rejects.toThrow(/Admins only/);
    await expect(as(MEMBER, `select public.set_user_role($1, 'admin')`, [MEMBER])).rejects.toThrow(/Admins only/);
    await expect(as(MEMBER, `select public.remove_user($1)`, [FAKE_MANAGER_1])).rejects.toThrow(/Admins only/);
    await expect(as(MEMBER, `select public.admin_delete_test_data()`)).rejects.toThrow(/Admins only/);
  });

  it("can't upload player photos", async () => {
    await expect(
      as(MEMBER, `insert into storage.objects (bucket_id, name) values ('player-photos', 'x.jpg')`),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("security: gameweek visibility", () => {
  let gameweekId: number;

  beforeAll(async () => {
    const [gw] = await as<{ id: number }>(
      ADMIN,
      `insert into public.gameweeks (number, deadline) values (1, now() + interval '2 days') returning id`,
    );
    gameweekId = gw.id;
    // Snapshot + results for a fake manager / player (normally written by server functions).
    await db.query(`insert into public.gameweek_entries (user_id, gameweek_id) values ($1, $2)`, [FAKE_MANAGER_1, gameweekId]);
    await db.query(
      `insert into public.gameweek_picks (user_id, gameweek_id, position, player_id)
       select user_id, $2, position, player_id from public.squad_picks where user_id = $1`,
      [FAKE_MANAGER_1, gameweekId],
    );
    await as(
      ADMIN,
      `insert into public.rule_results (gameweek_id, player_id, rule_id, count)
       select $1, (select id from public.players order by name limit 1), id, 1
       from public.scoring_rules where type = 'tick'`,
      [gameweekId],
    );
  });

  it("hides other managers' locked squads until the deadline passes", async () => {
    expect(await as(MEMBER, `select * from public.gameweek_picks where gameweek_id = $1`, [gameweekId])).toEqual([]);
    await as(ADMIN, `update public.gameweeks set status = 'locked', deadline = now() - interval '1 minute' where id = $1`, [gameweekId]);
    expect(await as(MEMBER, `select * from public.gameweek_picks where gameweek_id = $1`, [gameweekId])).toHaveLength(5);
    expect(await as(MEMBER, `select * from public.gameweek_entries where gameweek_id = $1`, [gameweekId])).toHaveLength(1);
  });

  it("hides results from members until the gameweek is published", async () => {
    expect(await as(ADMIN, `select * from public.rule_results where gameweek_id = $1`, [gameweekId])).toHaveLength(5);
    expect(await as(MEMBER, `select * from public.rule_results where gameweek_id = $1`, [gameweekId])).toEqual([]);
    await as(ADMIN, `update public.gameweeks set status = 'published' where id = $1`, [gameweekId]);
    expect(await as(MEMBER, `select * from public.rule_results where gameweek_id = $1`, [gameweekId])).toHaveLength(5);
  });
});

describe("security: admins", () => {
  it("can read and change the join code", async () => {
    expect(await as(ADMIN, `select public.set_join_code(' aces2026 ') as code`)).toEqual([{ code: "ACES2026" }]);
    expect(await as(ADMIN, `select public.get_join_code() as code`)).toEqual([{ code: "ACES2026" }]);
    await expect(as(ADMIN, `select public.set_join_code('ab')`)).rejects.toThrow(/4–40/);
  });

  it("can manage players and see everyone's squads", async () => {
    const [p] = await as<{ id: string }>(
      ADMIN,
      `insert into public.players (name, club_team, price) values ('Real Player', 2, 8.5) returning id`,
    );
    expect(p.id).toBeTruthy();
    expect(await as(ADMIN, `select * from public.squad_picks`)).toHaveLength(50);
  });

  it("can upload player photos", async () => {
    expect(
      await as(ADMIN, `insert into storage.objects (bucket_id, name) values ('player-photos', 'a.jpg') returning name`),
    ).toEqual([{ name: "a.jpg" }]);
  });

  it("can promote users but never leave the club without an admin", async () => {
    await as(ADMIN, `select public.set_user_role($1, 'admin')`, [MEMBER]);
    expect(await as(MEMBER, `select public.is_admin() as ok`)).toEqual([{ ok: true }]);
    await as(ADMIN, `select public.set_user_role($1, 'user')`, [MEMBER]);
    await expect(as(ADMIN, `select public.set_user_role($1, 'user')`, [ADMIN])).rejects.toThrow(/at least one admin/);
  });

  it("can remove a user, but not themselves", async () => {
    await expect(as(ADMIN, `select public.remove_user($1)`, [ADMIN])).rejects.toThrow(/remove yourself/);
    await as(ADMIN, `select public.remove_user($1)`, [OUTSIDER]);
    const { rows } = await db.query(`select count(*)::int as n from auth.users where id = $1`, [OUTSIDER]);
    expect(rows).toEqual([{ n: 0 }]);
  });
});

describe("admin tools", () => {
  const numbersInDeadlineOrder = async () =>
    (
      await db.query<{ number: number; expected: number }>(
        `select number, row_number() over (order by deadline, id)::int as expected from public.gameweeks order by deadline`,
      )
    ).rows;

  it("generates weekly Tuesday 21:00 UK deadlines across the clock change", async () => {
    const [{ created }] = await as<{ created: number }>(
      ADMIN,
      `select public.admin_generate_gameweeks('2026-10-20', 3) as created`,
    );
    expect(created).toBe(3);
    const { rows } = await db.query<{ deadline: Date }>(
      `select deadline from public.gameweeks where deadline >= '2026-10-20' order by deadline`,
    );
    expect(rows.map((r) => new Date(r.deadline).toISOString())).toEqual([
      "2026-10-20T20:00:00.000Z", // BST
      "2026-10-27T21:00:00.000Z", // GMT after the clocks go back
      "2026-11-03T21:00:00.000Z",
    ]);
  });

  it("skips deadlines that already exist and keeps numbers in deadline order", async () => {
    expect(await as(ADMIN, `select public.admin_generate_gameweeks('2026-11-03', 2) as created`)).toEqual([
      { created: 1 },
    ]);
    // An earlier week slots in and everything is renumbered 1, 2, 3…
    await as(ADMIN, `select public.admin_generate_gameweeks('2026-09-29', 1)`);
    const rows = await numbersInDeadlineOrder();
    expect(rows.map((r) => r.number)).toEqual(rows.map((r) => r.expected));
  });

  it("renumbers when a deadline is moved", async () => {
    await as(
      ADMIN,
      `update public.gameweeks set deadline = '2026-12-01 21:00+00' where deadline = '2026-09-29 20:00+00'`,
    );
    const rows = await numbersInDeadlineOrder();
    expect(rows.map((r) => r.number)).toEqual(rows.map((r) => r.expected));
  });

  it("only deletes gameweeks that haven't been used", async () => {
    await expect(
      as(ADMIN, `delete from public.gameweeks where status = 'published'`),
    ).rejects.toThrow(/in use/);
    const deleted = await as(ADMIN, `delete from public.gameweeks where deadline = '2026-12-01 21:00+00' returning id`);
    expect(deleted).toHaveLength(1);
    const rows = await numbersInDeadlineOrder();
    expect(rows.map((r) => r.number)).toEqual(rows.map((r) => r.expected));
  });

  it("lists users with emails and counts test data, for admins only", async () => {
    const users = await as<{ email: string; is_test_data: boolean }>(ADMIN, `select * from public.admin_list_users()`);
    expect(users.map((u) => u.email)).toContain("admin@example.com");
    expect(users.filter((u) => u.is_test_data)).toHaveLength(10);
    expect(await as(ADMIN, `select public.admin_test_data_counts() as c`)).toEqual([
      { c: { players: 40, scoring_rules: 8, managers: 10 } },
    ]);

    await expect(as(MEMBER, `select * from public.admin_list_users()`)).rejects.toThrow(/Admins only/);
    await expect(as(MEMBER, `select public.admin_generate_gameweeks('2027-01-05', 1)`)).rejects.toThrow(/Admins only/);
    await expect(as(MEMBER, `select public.admin_test_data_counts()`)).rejects.toThrow(/Admins only/);
  });
});

describe("squads and the deadline lock", () => {
  type Pick = { position: number; player_id: string; is_captain: boolean; is_vice_captain: boolean };
  let cheap: string[]; // 10 cheapest fake players
  let gameweekId: number;

  const squad = (ids: string[], captain = 1, vice = 2): Pick[] =>
    ids.map((player_id, i) => ({ position: i + 1, player_id, is_captain: i + 1 === captain, is_vice_captain: i + 1 === vice }));
  const save = (picks: unknown, uid = PICKER) => as(uid, `select public.save_squad($1::jsonb) as r`, [JSON.stringify(picks)]);
  const myPicks = async () =>
    (await db.query<Pick>(`select position, player_id, is_captain, is_vice_captain from public.squad_picks where user_id = $1 order by position`, [PICKER])).rows;

  beforeAll(async () => {
    await signUp(PICKER, "picker@example.com", "Pat Picker");
    await as(PICKER, `select public.join_club($1)`, [await joinCode()]);
    await as(PICKER, `update public.profiles set team_name = 'Pick n Mix' where id = $1`, [PICKER]);
    cheap = (await db.query<{ id: string }>(`select id from public.players where is_test_data order by price, name limit 10`)).rows.map((r) => r.id);
  });

  it("saves a valid squad of 4 starters and a bench player", async () => {
    expect(await save(squad(cheap.slice(0, 5)))).toEqual([{ r: { changed_players: true, transfers_made: 0, transfer_hit: 0 } }]);
    const picks = await myPicks();
    expect(picks.map((p) => p.player_id)).toEqual(cheap.slice(0, 5));
    expect(picks.find((p) => p.is_captain)?.position).toBe(1);
  });

  it("rejects squads that break the rules", async () => {
    await expect(save(squad(cheap.slice(0, 4)))).rejects.toThrow(/exactly 5 players/);
    await expect(save(squad([...cheap.slice(0, 4), cheap[0]]))).rejects.toThrow(/only be picked once/);
    await expect(save(squad(cheap.slice(0, 5), 5, 1))).rejects.toThrow(/captain/); // captain on the bench
    await expect(save(squad(cheap.slice(0, 5), 1, 1))).rejects.toThrow(/captain/); // same player twice
    const pricey = (await db.query<{ id: string }>(`select id from public.players order by price desc limit 5`)).rows.map((r) => r.id);
    await expect(save(squad(pricey))).rejects.toThrow(/over the £35.0m budget/);
  });

  it("won't add an unavailable player, but keeps one already in the squad", async () => {
    await db.query(`update public.players set is_active = false where id = $1`, [cheap[5]]);
    await expect(save(squad([...cheap.slice(0, 4), cheap[5]]))).rejects.toThrow(/is unavailable/);
    await db.query(`update public.players set is_active = false where id = $1`, [cheap[0]]);
    await expect(save(squad(cheap.slice(0, 5), 2, 3))).resolves.toBeTruthy(); // line-up change only
    await db.query(`update public.players set is_active = true where id = any($1)`, [[cheap[0], cheap[5]]]);
  });

  it("only lets members save, and still blocks direct writes", async () => {
    await expect(save(squad(cheap.slice(0, 5)), EARLY_USER)).rejects.toThrow(/Join the club/);
    await expect(as(PICKER, `delete from public.squad_picks where user_id = $1`, [PICKER])).rejects.toThrow(/permission denied/);
  });

  it("snapshots complete squads when the deadline passes and locks the gameweek", async () => {
    const [gw] = await as<{ id: number }>(
      ADMIN,
      `insert into public.gameweeks (number, deadline) values (500, now() + interval '1 hour') returning id`,
    );
    gameweekId = gw.id;
    const [blank] = await as<{ id: number }>(
      ADMIN,
      `insert into public.gameweeks (number, deadline, is_blank) values (501, now() - interval '2 hours', true) returning id`,
    );

    await as(PICKER, `select public.sync_gameweeks()`);
    expect(await as(PICKER, `select status from public.gameweeks where id = $1`, [gameweekId])).toEqual([{ status: "open" }]);

    // Deadline passes. Nobody needs to be online: the next sync/save locks it.
    await as(ADMIN, `update public.gameweeks set deadline = now() - interval '1 second' where id = $1`, [gameweekId]);
    await as(MEMBER, `select public.sync_gameweeks()`);

    const { rows: gws } = await db.query<{ id: number; status: string }>(
      `select id, status from public.gameweeks where id in ($1, $2) order by id`,
      [gameweekId, blank.id],
    );
    expect(gws).toEqual([
      { id: gameweekId, status: "locked" },
      { id: blank.id, status: "open" }, // blank weeks are never locked or scored
    ]);

    const snapshot = await as<Pick>(
      PICKER,
      `select position, player_id, is_captain, is_vice_captain from public.gameweek_picks
       where user_id = $1 and gameweek_id = $2 order by position`,
      [PICKER, gameweekId],
    );
    expect(snapshot).toEqual(await myPicks());

    const { rows: entries } = await db.query<{ user_id: string }>(`select user_id from public.gameweek_entries where gameweek_id = $1`, [gameweekId]);
    expect(entries.map((e) => e.user_id)).toContain(PICKER);
    expect(entries.filter((e) => e.user_id.startsWith("00000000-0000-4000-a000"))).toHaveLength(10); // fake managers
    expect(entries.map((e) => e.user_id)).not.toContain(MEMBER); // no complete squad, so no entry
  });

  it("applies changes after the deadline to the next gameweek, leaving the snapshot alone", async () => {
    const before = await as(PICKER, `select * from public.gameweek_picks where user_id = $1 and gameweek_id = $2 order by position`, [PICKER, gameweekId]);
    await save(squad(cheap.slice(0, 5), 3, 4)); // new captain: fine
    expect((await myPicks()).find((p) => p.is_captain)?.position).toBe(3);
    expect(await as(PICKER, `select * from public.gameweek_picks where user_id = $1 and gameweek_id = $2 order by position`, [PICKER, gameweekId])).toEqual(before);
  });

  it("locks the old squad first when someone saves just after a deadline", async () => {
    const [gw2] = await as<{ id: number }>(
      ADMIN,
      `insert into public.gameweeks (number, deadline) values (502, now() - interval '1 second') returning id`,
    );
    // Captain is currently position 3. Nobody has synced since the deadline passed.
    await save(squad(cheap.slice(0, 5), 4, 1));
    const snapshot = await as<Pick>(
      PICKER,
      `select position, is_captain from public.gameweek_picks where user_id = $1 and gameweek_id = $2 and is_captain`,
      [PICKER, gw2.id],
    );
    expect(snapshot).toEqual([{ position: 3, is_captain: true }]); // the deadline-time squad
    expect((await myPicks()).find((p) => p.is_captain)?.position).toBe(4); // the change applies next week
  });

  it("doesn't snapshot a gameweek twice", async () => {
    await db.query(`update public.gameweeks set status = 'open' where id = $1`, [gameweekId]);
    await as(PICKER, `select public.sync_gameweeks()`);
    const { rows } = await db.query(`select count(*)::int as n from public.gameweek_picks where user_id = $1 and gameweek_id = $2`, [PICKER, gameweekId]);
    expect(rows).toEqual([{ n: 5 }]);
  });
});

describe("transfers and chips", () => {
  type State = {
    gameweek_id: number | null;
    baseline_player_ids: string[] | null;
    chip: string | null;
    transfers_made: number;
    transfer_hit: number;
    free_transfers: number;
    hit_points: number;
  };
  let cheap: string[];

  const squad = (ids: string[], captain = 1, vice = 2) =>
    ids.map((player_id, i) => ({ position: i + 1, player_id, is_captain: i + 1 === captain, is_vice_captain: i + 1 === vice }));
  const save = async (ids: string[], uid = PICKER) =>
    (await as<{ r: { changed_players: boolean; transfers_made: number; transfer_hit: number } }>(
      uid,
      `select public.save_squad($1::jsonb) as r`,
      [JSON.stringify(squad(ids))],
    ))[0].r;
  const state = async (uid = PICKER) => (await as<{ s: State }>(uid, `select public.get_transfer_state() as s`))[0].s;
  const playChip = (chip: string, uid = PICKER) => as(uid, `select public.play_chip($1)`, [chip]);
  const cancelChip = (chip: string, uid = PICKER) => as(uid, `select public.cancel_chip($1)`, [chip]);
  const squadIds = async (uid = PICKER) =>
    (await db.query<{ player_id: string }>(`select player_id from public.squad_picks where user_id = $1 order by position`, [uid])).rows.map(
      (r) => r.player_id,
    );
  const entry = async (gameweekId: number, uid = PICKER) =>
    (
      await db.query<{ chip: string | null; transfers_made: number; transfer_hit: number }>(
        `select chip, transfers_made, transfer_hit from public.gameweek_entries where user_id = $1 and gameweek_id = $2`,
        [uid, gameweekId],
      )
    ).rows[0];
  /** A new gameweek that's the next one to lock. */
  const newGameweek = async () =>
    (
      await as<{ id: number }>(
        ADMIN,
        `insert into public.gameweeks (number, deadline) values (900, now() + interval '30 minutes') returning id`,
      )
    )[0].id;
  const passDeadline = async (gameweekId: number) => {
    await as(ADMIN, `update public.gameweeks set deadline = now() - interval '1 second' where id = $1`, [gameweekId]);
    await as(MEMBER, `select public.sync_gameweeks()`);
  };

  beforeAll(async () => {
    cheap = (await db.query<{ id: string }>(`select id from public.players where is_test_data order by price, name limit 10`)).rows.map((r) => r.id);
    // From the Phase 4 tests: PICKER's latest locked team is cheap[0..4].
    await save(cheap.slice(0, 5));
  });

  it("counts transfers against the last locked team, so undoing one is free", async () => {
    const s = await state();
    expect(s).toMatchObject({ transfers_made: 0, transfer_hit: 0, free_transfers: 1, hit_points: 5, chip: null });
    expect([...s.baseline_player_ids!].sort()).toEqual([...cheap.slice(0, 5)].sort());

    expect(await save([...cheap.slice(0, 4), cheap[5]])).toMatchObject({ transfers_made: 1, transfer_hit: 0 });
    expect(await save([...cheap.slice(0, 3), cheap[5], cheap[6]])).toMatchObject({ transfers_made: 2, transfer_hit: 5 });
    expect(await save([...cheap.slice(0, 3), cheap[5], cheap[7]])).toMatchObject({ transfers_made: 2, transfer_hit: 5 });
    expect(await save([...cheap.slice(0, 4), cheap[7]])).toMatchObject({ transfers_made: 1, transfer_hit: 0 });
    expect(await save(cheap.slice(0, 5))).toMatchObject({ transfers_made: 0, transfer_hit: 0 }); // all undone
  });

  it("gives new managers unlimited free changes until their first deadline", async () => {
    expect(await state(MEMBER)).toMatchObject({ baseline_player_ids: null, transfers_made: 0, transfer_hit: 0 });
    await expect(playChip("wildcard", MEMBER)).rejects.toThrow(/already free/);
    await expect(playChip("free_hit", MEMBER)).rejects.toThrow(/already free/);
  });

  it("records transfers and the points hit when the deadline passes", async () => {
    const gw = await newGameweek();
    await save([...cheap.slice(0, 3), cheap[5], cheap[6]]); // 2 transfers: 1 free, 1 costs 5
    await passDeadline(gw);

    expect(await entry(gw)).toEqual({ chip: null, transfers_made: 2, transfer_hit: 5 });
    const { rows } = await db.query<{ player_out_id: string; player_in_id: string; is_free: boolean }>(
      `select player_out_id, player_in_id, is_free from public.transfers where user_id = $1 and gameweek_id = $2 order by id`,
      [PICKER, gw],
    );
    expect(rows.map((r) => r.is_free)).toEqual([true, false]);
    expect(rows.map((r) => r.player_out_id).sort()).toEqual([cheap[3], cheap[4]].sort());
    expect(rows.map((r) => r.player_in_id).sort()).toEqual([cheap[5], cheap[6]].sort());

    // The new locked team is now the baseline.
    expect(await state()).toMatchObject({ transfers_made: 0, transfer_hit: 0 });
    // Locking again changes nothing.
    await db.query(`update public.gameweeks set status = 'open' where id = $1`, [gw]);
    await as(PICKER, `select public.sync_gameweeks()`);
    const { rows: again } = await db.query(`select count(*)::int as n from public.transfers where user_id = $1 and gameweek_id = $2`, [PICKER, gw]);
    expect(again).toEqual([{ n: 2 }]);
  });

  it("allows one chip per gameweek, which can be cancelled before the deadline", async () => {
    await newGameweek();
    await playChip("triple_captain");
    expect((await state()).chip).toBe("triple_captain");
    await expect(playChip("wildcard")).rejects.toThrow(/one chip per gameweek/);
    await cancelChip("triple_captain");
    expect((await state()).chip).toBeNull();
    await expect(cancelChip("triple_captain")).rejects.toThrow(/isn't active/);
    await expect(playChip("bench_boost")).rejects.toThrow(/Unknown chip/);
    await expect(as(PICKER, `insert into public.chip_plays (user_id, chip, gameweek_id) values ($1, 'wildcard', 1)`, [PICKER])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("Wildcard: unlimited free transfers that stay, once a season", async () => {
    const gw = (await state()).gameweek_id!;
    await playChip("wildcard");
    await playChip("wildcard"); // pressing it twice is fine
    expect(await save([cheap[0], cheap[5], cheap[7], cheap[8], cheap[9]])).toMatchObject({ transfers_made: 3, transfer_hit: 0 });
    await passDeadline(gw);

    expect(await entry(gw)).toEqual({ chip: "wildcard", transfers_made: 3, transfer_hit: 0 });
    const { rows } = await db.query(`select bool_and(is_free) as all_free from public.transfers where user_id = $1 and gameweek_id = $2`, [PICKER, gw]);
    expect(rows).toEqual([{ all_free: true }]);
    expect(await squadIds()).toEqual([cheap[0], cheap[5], cheap[7], cheap[8], cheap[9]]); // changes stay

    await newGameweek();
    await expect(playChip("wildcard")).rejects.toThrow(/already used that chip in gameweek/);
    await expect(cancelChip("wildcard")).rejects.toThrow(/deadline has passed/);
  });

  it("Free Hit: free transfers for one week, then the squad goes back", async () => {
    const gw = (await state()).gameweek_id!;
    const before = await squadIds();
    await playChip("free_hit");
    expect(await save([cheap[1], cheap[2], cheap[3], cheap[4], cheap[9]])).toMatchObject({ transfers_made: 4, transfer_hit: 0 });
    await passDeadline(gw);

    expect(await entry(gw)).toEqual({ chip: "free_hit", transfers_made: 4, transfer_hit: 0 });
    const { rows } = await db.query<{ player_id: string }>(
      `select player_id from public.gameweek_picks where user_id = $1 and gameweek_id = $2 order by position`,
      [PICKER, gw],
    );
    expect(rows.map((r) => r.player_id)).toEqual([cheap[1], cheap[2], cheap[3], cheap[4], cheap[9]]); // played the Free Hit team
    expect(await squadIds()).toEqual(before); // and got the old team back
    const { rows: armbands } = await db.query(
      `select count(*) filter (where is_captain)::int as c, count(*) filter (where is_vice_captain)::int as vc from public.squad_picks where user_id = $1`,
      [PICKER],
    );
    expect(armbands).toEqual([{ c: 1, vc: 1 }]);

    // The next week counts transfers against the team before the Free Hit.
    await newGameweek();
    expect(await state()).toMatchObject({ transfers_made: 0, transfer_hit: 0 });
    expect(await save([cheap[0], cheap[5], cheap[6], cheap[7], cheap[9]])).toMatchObject({ transfers_made: 1, transfer_hit: 0 });
  });

  it("gives a chip back if the manager's team wasn't complete at the deadline", async () => {
    const gw = (await state(MEMBER)).gameweek_id!;
    await playChip("triple_captain", MEMBER); // MEMBER has no squad
    await passDeadline(gw);
    const { rows } = await db.query(`select count(*)::int as n from public.chip_plays where user_id = $1`, [MEMBER]);
    expect(rows).toEqual([{ n: 0 }]);
  });
});

describe("results and publishing", () => {
  let gameweekId: number; // a locked gameweek PICKER has a team in
  let openId: number;
  let rules: { id: string; type: string; points: number }[];
  let picked: string[];

  const saveResults = (results: unknown, uid = ADMIN, gw = gameweekId) =>
    as(uid, `select public.admin_save_results($1, $2::jsonb) as n`, [gw, JSON.stringify(results)]);
  const storePoints = (players: unknown, entries: unknown, publish: boolean, uid = ADMIN) =>
    as(uid, `select public.admin_store_points($1, $2::jsonb, $3::jsonb, $4)`, [gameweekId, JSON.stringify(players), JSON.stringify(entries), publish]);

  beforeAll(async () => {
    const { rows } = await db.query<{ gameweek_id: number }>(
      `select e.gameweek_id from public.gameweek_entries e join public.gameweeks g on g.id = e.gameweek_id
       where e.user_id = $1 and g.status = 'locked' order by g.deadline desc limit 1`,
      [PICKER],
    );
    gameweekId = rows[0].gameweek_id;
    openId = (await db.query<{ id: number }>(`select id from private.upcoming_gameweek()`)).rows[0].id;
    rules = (await db.query<{ id: string; type: string; points: number }>(`select id, type, points from public.scoring_rules order by sort_order`)).rows;
    picked = (await db.query<{ player_id: string }>(
      `select player_id from public.gameweek_picks where user_id = $1 and gameweek_id = $2 order by position`,
      [PICKER, gameweekId],
    )).rows.map((r) => r.player_id);
  });

  const tick = () => rules.find((r) => r.type === "tick")!;
  const count = () => rules.find((r) => r.type === "count")!;

  it("only lets admins save results, and only after the deadline", async () => {
    await expect(saveResults([], MEMBER)).rejects.toThrow(/Admins only/);
    await expect(saveResults([], ADMIN, openId)).rejects.toThrow(/hasn't reached its deadline/);
    await expect(
      as(MEMBER, `insert into public.rule_results (gameweek_id, player_id, rule_id, count) values ($1, $2, $3, 1)`, [gameweekId, picked[0], tick().id]),
    ).rejects.toThrow(/row-level security/);
  });

  it("saves raw results as rows, skipping zeros, and replaces them on re-save", async () => {
    const results = [
      { player_id: picked[0], did_not_play: false, counts: { [tick().id]: 1, [count().id]: 3 } },
      { player_id: picked[1], did_not_play: true, counts: {} },
      { player_id: picked[2], did_not_play: false, counts: { [tick().id]: 0 } }, // nothing: no rows
    ];
    expect(await saveResults(results)).toEqual([{ n: 2 }]);
    const { rows } = await db.query(
      `select player_id, count from public.rule_results where gameweek_id = $1 order by count`,
      [gameweekId],
    );
    expect(rows).toEqual([
      { player_id: picked[0], count: 1 },
      { player_id: picked[0], count: 3 },
    ]);
    const { rows: apps } = await db.query(
      `select player_id, did_not_play from public.player_gameweeks where gameweek_id = $1 order by did_not_play`,
      [gameweekId],
    );
    expect(apps).toEqual([
      { player_id: picked[0], did_not_play: false },
      { player_id: picked[1], did_not_play: true },
    ]);

    await saveResults([{ player_id: picked[0], did_not_play: false, counts: { [tick().id]: 1 } }]);
    const { rows: after } = await db.query(`select count(*)::int as n from public.rule_results where gameweek_id = $1`, [gameweekId]);
    expect(after).toEqual([{ n: 1 }]);
    const { rows: appsAfter } = await db.query(`select count(*)::int as n from public.player_gameweeks where gameweek_id = $1`, [gameweekId]);
    expect(appsAfter).toEqual([{ n: 1 }]);
  });

  it("rejects impossible numbers", async () => {
    await expect(saveResults([{ player_id: picked[0], counts: { [tick().id]: 2 } }])).rejects.toThrow(/ticks are 0 or 1/);
    await expect(saveResults([{ player_id: picked[0], counts: { [count().id]: -1 } }])).rejects.toThrow(/counts 0–99/);
    await expect(saveResults([{ player_id: picked[0], counts: { "00000000-0000-4000-8000-000000000000": 1 } }])).rejects.toThrow(
      /scoring rules no longer exists/,
    );
  });

  it("keeps drafts hidden from members until published", async () => {
    expect(await as(PICKER, `select * from public.rule_results where gameweek_id = $1`, [gameweekId])).toEqual([]);
    await expect(storePoints([], [], true, MEMBER)).rejects.toThrow(/Admins only/);
  });

  it("stores points, publishes, and then members can see the results", async () => {
    await storePoints([{ player_id: picked[0], points: tick().points }], [{ user_id: PICKER, points: 42 }], true);
    const { rows: gw } = await db.query(`select status, published_at is not null as stamped from public.gameweeks where id = $1`, [gameweekId]);
    expect(gw).toEqual([{ status: "published", stamped: true }]);
    expect(await as(PICKER, `select points from public.gameweek_entries where user_id = $1 and gameweek_id = $2`, [PICKER, gameweekId])).toEqual([
      { points: 42 },
    ]);
    // Managers not in the list get 0 rather than staying blank.
    const { rows } = await db.query(`select count(*)::int as n from public.gameweek_entries where gameweek_id = $1 and points is null`, [gameweekId]);
    expect(rows).toEqual([{ n: 0 }]);
    expect(await as(MEMBER, `select points from public.player_gameweeks where gameweek_id = $1`, [gameweekId])).toEqual([
      { points: tick().points },
    ]);
    expect(await as(MEMBER, `select count(*)::int as n from public.rule_results where gameweek_id = $1`, [gameweekId])).toEqual([{ n: 1 }]);
  });

  it("can still edit and recalculate a published gameweek", async () => {
    await saveResults([{ player_id: picked[0], counts: { [tick().id]: 1, [count().id]: 2 } }]);
    await storePoints([{ player_id: picked[0], points: 7 }], [{ user_id: PICKER, points: 50 }], false);
    const { rows } = await db.query(
      `select g.status, e.points from public.gameweeks g join public.gameweek_entries e on e.gameweek_id = g.id where g.id = $1 and e.user_id = $2`,
      [gameweekId, PICKER],
    );
    expect(rows).toEqual([{ status: "published", points: 50 }]);
  });
});

describe("publishing end to end (same queries as src/lib/recalculate.ts)", () => {
  it("doubles the captain, switches to the vice-captain and auto-subs the bench", async () => {
    // A brand-new manager (so no transfer hits) with captain pos 1, vice pos 2.
    await signUp(SCORER, "scorer@example.com", "Sam Scorer");
    await as(SCORER, `select public.join_club($1)`, [await joinCode()]);
    await as(SCORER, `update public.profiles set team_name = 'Score Draw' where id = $1`, [SCORER]);
    const [gw] = await as<{ id: number }>(
      ADMIN,
      `insert into public.gameweeks (number, deadline) values (950, now() + interval '20 minutes') returning id`,
    );
    const ids = (await db.query<{ id: string }>(`select id from public.players where is_test_data order by price, name limit 5`)).rows.map((r) => r.id);
    await as(SCORER, `select public.save_squad($1::jsonb)`, [
      JSON.stringify(ids.map((player_id, i) => ({ position: i + 1, player_id, is_captain: i === 0, is_vice_captain: i === 1 }))),
    ]);
    await as(ADMIN, `update public.gameweeks set deadline = now() - interval '1 second' where id = $1`, [gw.id]);
    await as(MEMBER, `select public.sync_gameweeks()`);

    const rule = (await db.query<{ id: string }>(`select id from public.scoring_rules where type = 'tick' and points > 0 order by points desc limit 1`)).rows[0];
    const points = (await db.query<{ points: number }>(`select points from public.scoring_rules where id = $1`, [rule.id])).rows[0].points;
    const publish = async (results: unknown) => {
      await as(ADMIN, `select public.admin_save_results($1, $2::jsonb)`, [gw.id, JSON.stringify(results)]);
      const q = <T,>(sql: string) => as<T>(ADMIN, sql, [gw.id]);
      const rows: GameweekRows = {
        rules: await q(`select id, points from public.scoring_rules where $1::bigint is not null`),
        results: await q(`select player_id, rule_id, count from public.rule_results where gameweek_id = $1`),
        appearances: await q(`select player_id, did_not_play from public.player_gameweeks where gameweek_id = $1`),
        entries: await q(`select user_id, chip, transfer_hit from public.gameweek_entries where gameweek_id = $1`),
        picks: await q(`select user_id, position, player_id, is_captain, is_vice_captain from public.gameweek_picks where gameweek_id = $1`),
      };
      const scored = scoreGameweek(scoringInputFromRows(rows));
      await as(ADMIN, `select public.admin_store_points($1, $2::jsonb, $3::jsonb, true)`, [
        gw.id,
        JSON.stringify(Object.entries(scored.players).map(([player_id, s]) => ({ player_id, points: s.points }))),
        JSON.stringify(Object.entries(scored.entries).map(([user_id, s]) => ({ user_id, points: s.total }))),
      ]);
      return (await db.query<{ points: number }>(`select points from public.gameweek_entries where user_id = $1 and gameweek_id = $2`, [SCORER, gw.id])).rows[0].points;
    };
    const won = (i: number, dnp = false) => ({ player_id: ids[i], did_not_play: dnp, counts: dnp ? {} : { [rule.id]: 1 } });

    // Everyone wins: captain doubled, bench not used.
    expect(await publish([0, 1, 2, 3, 4].map((i) => won(i)))).toBe(points * 5);
    // Captain didn't play: vice-captain doubled, bench comes on.
    expect(await publish([won(0, true), won(1), won(2), won(3), won(4)])).toBe(points * (2 + 1 + 1 + 1));
    // A non-captain starter didn't play: captain doubled and bench comes on.
    expect(await publish([won(0), won(1), won(2, true), won(3), won(4)])).toBe(points * (2 + 1 + 1 + 1));

    // The owner's read-only check script agrees with the stored points.
    const check = (await db.query<{ team: string; stored_points: number; expected_points: number }>(
      sqlFile("admin/check_points.sql"),
    )).rows.filter((r) => r.team === "Score Draw");
    expect(check).toHaveLength(1);
    expect(check[0].expected_points).toBe(check[0].stored_points);
  });
});

describe("team captains", () => {
  let gw: number;
  let players: string[];
  let tickRule: string;
  let countRule: string;

  const save = (uid: string, results: unknown) =>
    as(uid, `select public.save_results($1, $2::jsonb) as n`, [gw, JSON.stringify(results)]);
  const rows = async () =>
    (await db.query<{ player_id: string; did_not_play: boolean; entered_by: string | null; n: number }>(
      `select pg.player_id, pg.did_not_play, pg.entered_by,
              (select coalesce(sum(count), 0)::int from public.rule_results rr
               where rr.gameweek_id = pg.gameweek_id and rr.player_id = pg.player_id) as n
       from public.player_gameweeks pg where pg.gameweek_id = $1`,
      [gw],
    )).rows;

  beforeAll(async () => {
    for (const [id, name] of [[CAPTAIN, "Cara Captain"], [CAPTAIN_2, "Cal Captain"]]) {
      await signUp(id, `${name.split(" ")[0].toLowerCase()}@example.com`, name);
      await as(id, `select public.join_club($1)`, [await joinCode()]);
    }
    const [row] = await as<{ id: number }>(
      ADMIN,
      `insert into public.gameweeks (number, deadline, status) values (960, now() - interval '1 hour', 'locked') returning id`,
    );
    gw = row.id;
    players = (await db.query<{ id: string }>(`select id from public.players order by name limit 3`)).rows.map((r) => r.id);
    tickRule = (await db.query<{ id: string }>(`select id from public.scoring_rules where type = 'tick' limit 1`)).rows[0].id;
    countRule = (await db.query<{ id: string }>(`select id from public.scoring_rules where type = 'count' limit 1`)).rows[0].id;
  });

  it("only admins can make someone a captain, and the last admin can't step down", async () => {
    await expect(as(MEMBER, `select public.set_user_role($1, 'captain')`, [CAPTAIN])).rejects.toThrow(/Admins only/);
    await as(ADMIN, `select public.set_user_role($1, 'captain')`, [CAPTAIN]);
    await as(ADMIN, `select public.set_user_role($1, 'captain')`, [CAPTAIN_2]);
    await expect(as(ADMIN, `select public.set_user_role($1, 'boss')`, [MEMBER])).rejects.toThrow(/Unknown role/);
    await expect(as(ADMIN, `select public.set_user_role($1, 'captain')`, [ADMIN])).rejects.toThrow(/at least one admin/);
    await expect(as(CAPTAIN, `update public.profiles set role = 'admin' where id = $1`, [CAPTAIN])).rejects.toThrow(/permission denied/);
    expect(await as(CAPTAIN, `select public.can_enter_results() as ok, public.is_admin() as admin`)).toEqual([{ ok: true, admin: false }]);
    expect(await as(MEMBER, `select public.can_enter_results() as ok`)).toEqual([{ ok: false }]);
  });

  it("lets captains save drafts that only change the players they sent", async () => {
    await expect(save(MEMBER, [])).rejects.toThrow(/Only team captains and admins/);
    await save(CAPTAIN, [{ player_id: players[0], did_not_play: false, counts: { [tickRule]: 1, [countRule]: 2 } }]);
    await save(CAPTAIN_2, [{ player_id: players[1], did_not_play: true, counts: {} }]);
    expect(await rows()).toEqual(
      expect.arrayContaining([
        { player_id: players[0], did_not_play: false, entered_by: CAPTAIN, n: 3 },
        { player_id: players[1], did_not_play: true, entered_by: CAPTAIN_2, n: 0 },
      ]),
    );
    expect(await rows()).toHaveLength(2);

    // Clearing a player removes only their results.
    await save(CAPTAIN_2, [{ player_id: players[0], did_not_play: false, counts: {} }]);
    expect(await rows()).toEqual([{ player_id: players[1], did_not_play: true, entered_by: CAPTAIN_2, n: 0 }]);
  });

  it("lets captains read drafts but not write to the tables directly", async () => {
    expect(await as(CAPTAIN, `select count(*)::int as n from public.player_gameweeks where gameweek_id = $1`, [gw])).toEqual([{ n: 1 }]);
    expect(await as(MEMBER, `select count(*)::int as n from public.player_gameweeks where gameweek_id = $1`, [gw])).toEqual([{ n: 0 }]);
    await expect(
      as(CAPTAIN, `insert into public.rule_results (gameweek_id, player_id, rule_id, count) values ($1, $2, $3, 1)`, [gw, players[2], tickRule]),
    ).rejects.toThrow(/row-level security/);
  });

  it("leaves publishing and published gameweeks to admins", async () => {
    await expect(
      as(CAPTAIN, `select public.admin_store_points($1, '[]'::jsonb, '[]'::jsonb, true)`, [gw]),
    ).rejects.toThrow(/Admins only/);
    await as(ADMIN, `select public.admin_store_points($1, '[]'::jsonb, '[]'::jsonb, true)`, [gw]);
    await expect(save(CAPTAIN, [{ player_id: players[2], did_not_play: true, counts: {} }])).rejects.toThrow(
      /already published, so only an admin/,
    );
    await save(ADMIN, [{ player_id: players[2], did_not_play: true, counts: {} }]);
    expect(await rows()).toHaveLength(2);
  });

  it("keeps results when a captain's account is removed", async () => {
    await as(ADMIN, `select public.remove_user($1)`, [CAPTAIN_2]);
    expect((await rows()).find((r) => r.player_id === players[1])).toMatchObject({ entered_by: null, did_not_play: true });
  });
});

describe("non-playing accounts and the club-team limit", () => {
  const NON_PLAYER = "77777777-7777-4777-8777-777777777777";
  const LIMIT_TESTER = "88888888-8888-4888-8888-888888888888";
  const pick = (ids: string[]) =>
    JSON.stringify(ids.map((player_id, i) => ({ position: i + 1, player_id, is_captain: i === 0, is_vice_captain: i === 1 })));
  const team = async (club: number, n: number) =>
    (await db.query<{ id: string }>(`select id from public.players where club_team = $1 and is_active order by price limit $2`, [club, n])).rows.map((r) => r.id);

  beforeAll(async () => {
    for (const [id, email, name] of [[NON_PLAYER, "organiser@example.com", "Org Aniser"], [LIMIT_TESTER, "limit@example.com", "Lim Itter"]]) {
      await signUp(id, email, name);
      await as(id, `select public.join_club($1)`, [await joinCode()]);
      await as(id, `update public.profiles set team_name = $2 where id = $1`, [id, `Team ${name}`]);
    }
  });

  it("only lets admins switch someone to not playing, and shows it in the user list", async () => {
    await expect(as(MEMBER, `select public.admin_set_playing($1, false)`, [NON_PLAYER])).rejects.toThrow(/Admins only/);
    await expect(as(NON_PLAYER, `update public.profiles set is_playing = false where id = $1`, [NON_PLAYER])).rejects.toThrow(/permission denied/);
    await as(ADMIN, `select public.admin_set_playing($1, false)`, [NON_PLAYER]);
    const rows = await as<{ id: string; is_playing: boolean }>(ADMIN, `select id, is_playing from public.admin_list_users() where id = $1`, [NON_PLAYER]);
    expect(rows).toEqual([{ id: NON_PLAYER, is_playing: false }]);
  });

  it("never locks in a team for a non-playing account", async () => {
    await db.query(`update public.club_settings set max_per_club_team = 5 where id`);
    const ids = (await db.query<{ id: string }>(`select id from public.players where is_active order by price limit 5`)).rows.map((r) => r.id);
    await as(NON_PLAYER, `select public.save_squad($1::jsonb)`, [pick(ids)]);
    await as(LIMIT_TESTER, `select public.save_squad($1::jsonb)`, [pick(ids)]);
    const [gw] = await as<{ id: number }>(ADMIN, `insert into public.gameweeks (number, deadline) values (990, now() + interval '15 minutes') returning id`);
    await as(ADMIN, `update public.gameweeks set deadline = now() - interval '1 second' where id = $1`, [gw.id]);
    await as(MEMBER, `select public.sync_gameweeks()`);
    const { rows } = await db.query<{ user_id: string }>(`select user_id from public.gameweek_entries where gameweek_id = $1`, [gw.id]);
    expect(rows.map((r) => r.user_id)).toContain(LIMIT_TESTER);
    expect(rows.map((r) => r.user_id)).not.toContain(NON_PLAYER);
  });

  it("allows at most 2 players from any one club team when players change", async () => {
    await db.query(`update public.club_settings set max_per_club_team = 2 where id`);
    const ones = await team(6, 3); // cheapest club team, so the budget isn't what fails
    const others = [...(await team(5, 1)), ...(await team(4, 1))];
    expect(ones).toHaveLength(3);
    await expect(as(LIMIT_TESTER, `select public.save_squad($1::jsonb)`, [pick([...ones, ...others])])).rejects.toThrow(
      /at most 2 players from the 6s/,
    );
    const ok = [...ones.slice(0, 2), ...(await team(3, 1)), ...others];
    await expect(as(LIMIT_TESTER, `select public.save_squad($1::jsonb)`, [pick(ok)])).resolves.toBeTruthy();
    await db.query(`update public.club_settings set max_per_club_team = 5 where id`);
  });
});

describe("deleting players and restarting the season", () => {
  const count = async (sql: string, params: unknown[] = []) => (await db.query<{ n: number }>(sql, params)).rows[0].n;
  const deletePlayer = (id: string, uid = ADMIN) => as<{ r: { name: string; squads: number } }>(uid, `select public.admin_delete_player($1) as r`, [id]);
  const reset = (clearSquads: boolean, uid = ADMIN) =>
    as<{ r: { entries: number; gameweeks: number; squads: number } }>(uid, `select public.admin_reset_season($1) as r`, [clearSquads]);

  it("won't delete a player with history, and only admins can delete or reset", async () => {
    const { rows } = await db.query<{ player_id: string }>(`select player_id from public.gameweek_picks where user_id = $1 limit 1`, [PICKER]);
    await expect(deletePlayer(rows[0].player_id)).rejects.toThrow(/locked team this season/);
    await expect(deletePlayer(rows[0].player_id, MEMBER)).rejects.toThrow(/Admins only/);
    await expect(reset(false, MEMBER)).rejects.toThrow(/Admins only/);
  });

  it("restarts the season: history and past gameweeks go, future ones reopen, squads stay", async () => {
    const future = await count(`select count(*)::int as n from public.gameweeks where deadline > now()`);
    await db.query(`update public.gameweeks set status = 'locked' where deadline > now() and id = (select min(id) from public.gameweeks where deadline > now())`);
    const squadsBefore = await count(`select count(distinct user_id)::int as n from public.squad_picks`);

    const [{ r }] = await reset(false);
    expect(r.entries).toBeGreaterThan(0);
    expect(r.gameweeks).toBeGreaterThan(0);
    expect(r.squads).toBe(0);

    for (const table of ["gameweek_entries", "gameweek_picks", "transfers", "chip_plays", "rule_results", "player_gameweeks"]) {
      expect(await count(`select count(*)::int as n from public.${table}`)).toBe(0);
    }
    expect(await count(`select count(*)::int as n from public.gameweeks where deadline <= now()`)).toBe(0);
    expect(await count(`select count(*)::int as n from public.gameweeks`)).toBe(future);
    expect(await count(`select count(*)::int as n from public.gameweeks where status <> 'open'`)).toBe(0);
    expect(await count(`select count(distinct user_id)::int as n from public.squad_picks`)).toBe(squadsBefore);
    // Everyone is a new manager again: free changes until the first deadline.
    expect(await as(PICKER, `select public.get_transfer_state() -> 'baseline_player_ids' as b`)).toEqual([{ b: null }]);
    // Numbers start from 1 again.
    expect(await count(`select min(number)::int as n from public.gameweeks`)).toBe(1);
  });

  it("then deletes a player who is only in current squads, taking them out of those squads", async () => {
    const { rows } = await db.query<{ player_id: string }>(`select player_id from public.squad_picks where user_id = $1 order by position limit 1`, [PICKER]);
    const id = rows[0].player_id;
    const owners = await count(`select count(*)::int as n from public.squad_picks where player_id = $1`, [id]);
    const [{ r }] = await deletePlayer(id);
    expect(r.squads).toBe(owners);
    expect(await count(`select count(*)::int as n from public.players where id = $1`, [id])).toBe(0);
    expect(await count(`select count(*)::int as n from public.squad_picks where user_id = $1`, [PICKER])).toBe(4);
  });

  it("can also clear everyone's squads", async () => {
    const [{ r }] = await reset(true);
    expect(r.squads).toBeGreaterThan(0);
    expect(await count(`select count(*)::int as n from public.squad_picks`)).toBe(0);
  });
});

describe("deleting test data", () => {
  it("removes every fake player, rule and manager but keeps real data", async () => {
    // A real manager who picked a fake player should just lose that pick.
    await db.query(
      `insert into public.squad_picks (user_id, position, player_id)
       select $1, 1, id from public.players where is_test_data limit 1`,
      [MEMBER],
    );

    await db.exec(DELETE_TEST_DATA);

    const { rows } = await db.query<Record<string, number>>(`
      select
        (select count(*)::int from public.players where is_test_data) as fake_players,
        (select count(*)::int from public.players where not is_test_data) as real_players,
        (select count(*)::int from public.scoring_rules) as rules,
        (select count(*)::int from public.profiles where is_test_data) as fake_managers,
        (select count(*)::int from auth.users where email like '%@example.invalid') as fake_logins,
        (select count(*)::int from public.profiles where id in ($1, $2, $3)) as real_people,
        (select count(*)::int from public.squad_picks) as picks
    `.replace("$1, $2, $3", `'${ADMIN}', '${MEMBER}', '${EARLY_USER}'`));
    expect(rows[0]).toEqual({
      fake_players: 0, real_players: 1, rules: 0, fake_managers: 0, fake_logins: 0, real_people: 3, picks: 0,
    });
    expect(await joinCode()).toBe("ACES2026");
  });
});
