/**
 * Runs the real migration and seed files against Postgres (PGlite) with a
 * small Supabase stand-in, then checks the schema, seed data and the Row Level
 * Security rules from the point of view of different users.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const sqlFile = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

const STUB = sqlFile("tests/supabase-stub.sql");
const SCHEMA = sqlFile("migrations/0001_schema.sql");
const SECURITY = sqlFile("migrations/0002_security.sql");
const ADMIN_TOOLS = sqlFile("migrations/0003_admin.sql");
const SQUADS = sqlFile("migrations/0004_squads.sql");
const TRANSFERS = sqlFile("migrations/0005_transfers_chips.sql");
const SEED = sqlFile("seed/seed_test_data.sql");
const DELETE_TEST_DATA = sqlFile("seed/delete_test_data.sql");

const EARLY_USER = "11111111-1111-4111-8111-111111111111"; // signed in before the migrations ran
const ADMIN = "22222222-2222-4222-8222-222222222222";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const OUTSIDER = "44444444-4444-4444-8444-444444444444"; // signed in, never entered the code
const FAKE_MANAGER_1 = "00000000-0000-4000-a000-000000000001";
const PICKER = "55555555-5555-4555-8555-555555555555"; // picks a squad in the Phase 4 tests

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
    await db.exec(SEED);
  }
  await signUp(ADMIN, "admin@example.com", "Ada Admin");
  await signUp(MEMBER, "member@example.com", "Mo Member");
  await signUp(OUTSIDER, "outsider@example.com", "Otto Outsider");
  await db.query(`update public.profiles set role = 'admin', joined_at = now() where id = $1`, [ADMIN]);
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
