/**
 * Sample data for local screenshots only (DEV_SKIP_AUTH=1, no Supabase).
 * Never used in production builds.
 */
import type { Database, Gameweek, Player, ScoringRule } from "@/lib/database.types";
import { computeStandings } from "@/lib/league";

const now = "2026-10-15T12:00:00Z";
const base = { created_at: now, updated_at: now };

export const DEMO_PLAYERS: Player[] = [
  ["Ava Thornton", 1, 12.5], ["Ben Achebe", 1, 11.5], ["Harry Lindqvist", 2, 9.0],
  ["Isla Mensah", 2, 8.5], ["Oscar Bright", 3, 7.5], ["Vera Blackwood", 4, 6.0],
  ["Callum Reid", 5, 5.0], ["Nora Keane", 6, 3.0], ["Chloe Marsh", 1, 11.0],
  ["Kiran Patel", 2, 8.0], ["Poppy Adeyemi", 3, 7.0], ["Will Carver", 4, 5.5],
  ["Daisy Nkemelu", 5, 4.5], ["Jess Holloway", 6, 3.5], ["Milo Tran", 6, 3.0],
].map(([name, club_team, price], i) => ({
  ...base,
  id: `p${i}`,
  name: name as string,
  club_team: club_team as number,
  price: price as number,
  photo_path: null,
  is_active: i !== 5,
  is_test_data: i < 6,
}));

export const DEMO_RULES: ScoringRule[] = [
  ["Played a match", 1, "tick", "match"], ["Won match", 5, "tick", "match"],
  ["Sets won", 1, "count", "match"], ["Bagel (won a set 6–0)", 2, "count", "match"],
  ["Got bagelled", -1, "count", "match"], ["Attended social", 2, "tick", "other"],
  ["No-show", -5, "tick", "other"],
].map(([name, points, type, category], i) => ({
  ...base,
  id: `r${i}`,
  name: name as string,
  points: points as number,
  type: type as ScoringRule["type"],
  category: category as ScoringRule["category"],
  sort_order: (i + 1) * 10,
  archived_at: i === 6 ? now : null,
  is_test_data: true,
}));

export const DEMO_GAMEWEEKS: Gameweek[] = [
  ["2026-10-06T20:00:00Z", "published", false], ["2026-10-13T20:00:00Z", "locked", false],
  ["2026-10-20T20:00:00Z", "open", false], ["2026-10-27T21:00:00Z", "open", true],
  ["2026-11-03T21:00:00Z", "open", false], ["2026-11-10T21:00:00Z", "open", false],
].map(([deadline, status, is_blank], i) => ({
  ...base,
  id: i + 1,
  number: i + 1,
  deadline: deadline as string,
  status: status as Gameweek["status"],
  is_blank: is_blank as boolean,
  locked_at: null,
  published_at: null,
}));

export const DEMO_USERS: Database["public"]["Functions"]["admin_list_users"]["Returns"] = [
  { id: "dev-user", email: "dev@example.com", display_name: "Dev Player", team_name: "Deuce Bigalow", role: "admin", joined_at: now, created_at: now, last_sign_in_at: now, is_test_data: false, is_playing: true },
  { id: "u2", email: "sam@example.com", display_name: "Sam Carter", team_name: null, role: "user", joined_at: null, created_at: now, last_sign_in_at: now, is_test_data: false, is_playing: true },
  { id: "u3", email: "priya@example.com", display_name: "Priya Shah", team_name: "Net Gains", role: "captain", joined_at: now, created_at: now, last_sign_in_at: now, is_test_data: false, is_playing: true },
  { id: "u4", email: "test-manager-01@example.invalid", display_name: "Alex Fern", team_name: "Grand Slammers", role: "user", joined_at: now, created_at: now, last_sign_in_at: null, is_test_data: true, is_playing: true },
];

/** Demo squad for the dev user: 4 starters + bench, captain and vice-captain. */
export const DEMO_SQUAD_PICKS = [
  { position: 1, player_id: "p1", is_captain: true, is_vice_captain: false },
  { position: 2, player_id: "p3", is_captain: false, is_vice_captain: true },
  { position: 3, player_id: "p4", is_captain: false, is_vice_captain: false },
  { position: 4, player_id: "p12", is_captain: false, is_vice_captain: false },
  { position: 5, player_id: "p7", is_captain: false, is_vice_captain: false },
];

const DEMO_MANAGERS = [
  ["dev-user", "Deuce Bigalow", "Dev Player"], ["u3", "Net Gains", "Priya Shah"], ["u4", "Grand Slammers", "Alex Fern"],
  ["u5", "Love Means Nothing", "Tom Hale"], ["u6", "Drop Shot Divas", "Mia Lowe"], ["u7", "Advantage Us", "Raj Iyer"],
  ["u8", "Break Point", "Sophie King"], ["u9", "Smash Bros", "Leo Park"],
].map(([userId, teamName, displayName]) => ({ userId, teamName, displayName }));

/** Two published gameweeks of demo points (GW1, GW2). */
export const DEMO_LEAGUE = {
  standings: computeStandings(
    DEMO_MANAGERS,
    DEMO_MANAGERS.flatMap((m, i) => [
      { userId: m.userId, gameweekId: 1, points: [42, 38, 51, 29, 38, 45, 33, 20][i] },
      ...(i === 7 ? [] : [{ userId: m.userId, gameweekId: 2, points: [36, 47, 22, 41, 40, 31, 33, 0][i] }]),
    ]),
    [1, 2],
  ),
  latest: { id: 2, number: 2 },
};
