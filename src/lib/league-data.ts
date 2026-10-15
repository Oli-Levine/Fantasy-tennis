import "server-only";
import { DEMO_LEAGUE } from "@/lib/dev-fixtures";
import { devAuthBypass } from "@/lib/env";
import { computeStandings, type StandingRow } from "@/lib/league";
import { createClient } from "@/lib/supabase/server";

export type LeagueData = {
  standings: StandingRow[];
  /** The latest published gameweek (null before anything is published). */
  latest: { id: number; number: number } | null;
};

/** Standings over every published gameweek, for the League and Home pages. */
export async function loadLeague(): Promise<LeagueData> {
  if (devAuthBypass()) return DEMO_LEAGUE;

  const supabase = await createClient();
  const [gameweeks, profiles] = await Promise.all([
    supabase.from("gameweeks").select("id, number").eq("status", "published").order("deadline"),
    supabase
      .from("profiles")
      .select("id, team_name, display_name")
      .not("joined_at", "is", null)
      .not("team_name", "is", null),
  ]);
  const failed = [gameweeks, profiles].find((r) => r.error);
  if (failed?.error) throw new Error(`Couldn't load the league: ${failed.error.message}`);

  const published = gameweeks.data!;
  const ids = published.map((g) => g.id);
  // Supabase returns at most 1000 rows per request, so page through a long season.
  const entries: { user_id: string; gameweek_id: number; points: number | null }[] = [];
  for (let from = 0; ids.length; from += 1000) {
    const page = await supabase
      .from("gameweek_entries")
      .select("user_id, gameweek_id, points")
      .in("gameweek_id", ids)
      .order("gameweek_id")
      .order("user_id")
      .range(from, from + 999);
    if (page.error) throw new Error(`Couldn't load the league: ${page.error.message}`);
    entries.push(...page.data);
    if (page.data.length < 1000) break;
  }

  const standings = computeStandings(
    profiles.data!.map((p) => ({ userId: p.id, teamName: p.team_name!, displayName: p.display_name })),
    entries.map((e) => ({ userId: e.user_id, gameweekId: e.gameweek_id, points: e.points ?? 0 })),
    published.map((g) => g.id),
  );
  return { standings, latest: published.at(-1) ?? null };
}
