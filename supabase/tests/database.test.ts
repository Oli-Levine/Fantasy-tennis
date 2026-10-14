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
const SEED = sqlFile("seed/seed_test_data.sql");
const DELETE_TEST_DATA = sqlFile("seed/delete_test_data.sql");

const EARLY_USER = "11111111-1111-4111-8111-111111111111"; // signed in before the migrations ran
const ADMIN = "22222222-2222-4222-8222-222222222222";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const OUTSIDER = "44444444-4444-4444-8444-444444444444"; // signed in, never entered the code
const FAKE_MANAGER_1 = "00000000-0000-4000-a000-000000000001";

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
