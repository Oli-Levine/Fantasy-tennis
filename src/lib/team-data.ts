import "server-only";
import type { Player } from "@/lib/database.types";
import { DEMO_GAMEWEEKS, DEMO_PLAYERS, DEMO_SQUAD_PICKS } from "@/lib/dev-fixtures";
import { devAuthBypass } from "@/lib/env";
import type { SavedPick } from "@/lib/squad";
import { createClient } from "@/lib/supabase/server";

export type PlayerStats = { total: number; last: number | null };

export type TeamData = {
  players: Player[];
  picks: SavedPick[];
  budget: number;
  /** The next gameweek whose deadline hasn't passed (null if none scheduled). */
  nextGameweek: { id: number; number: number; deadline: string } | null;
  /** False once the manager's team has been locked in for any gameweek (then changes are transfers). */
  canChangePlayers: boolean;
  /** Points per player from published gameweeks. */
  stats: Record<string, PlayerStats>;
};

/**
 * Everything the Team and Home pages need for the signed-in manager. Locks any
 * gameweek whose deadline has passed first, so the "next gameweek" is right.
 */
export async function loadTeamData(userId: string): Promise<TeamData> {
  if (devAuthBypass()) return demoTeamData();

  const supabase = await createClient();
  const { error: syncError } = await supabase.rpc("sync_gameweeks");
  if (syncError) throw new Error(`Couldn't update gameweeks: ${syncError.message}`);

  const nowIso = new Date().toISOString();
  const [players, picks, settings, next, entry, published, results] = await Promise.all([
    supabase.from("players").select("*").order("name"),
    supabase.from("squad_picks").select("position, player_id, is_captain, is_vice_captain").eq("user_id", userId).order("position"),
    supabase.from("club_settings").select("budget").single(),
    supabase
      .from("gameweeks")
      .select("id, number, deadline")
      .eq("status", "open")
      .eq("is_blank", false)
      .gt("deadline", nowIso)
      .order("deadline")
      .limit(1)
      .maybeSingle(),
    supabase.from("gameweek_entries").select("gameweek_id").eq("user_id", userId).limit(1),
    supabase.from("gameweeks").select("id").eq("status", "published").order("deadline", { ascending: false }).limit(1),
    supabase.from("player_gameweeks").select("player_id, gameweek_id, points"),
  ]);
  const failed = [players, picks, settings, next, entry, published, results].find((r) => r.error);
  if (failed?.error) throw new Error(`Couldn't load your team: ${failed.error.message}`);

  const lastPublishedId = published.data?.[0]?.id ?? null;
  const stats: Record<string, PlayerStats> = {};
  for (const row of results.data ?? []) {
    const s = (stats[row.player_id] ??= { total: 0, last: lastPublishedId == null ? null : 0 });
    s.total += row.points ?? 0;
    if (row.gameweek_id === lastPublishedId) s.last = row.points ?? 0;
  }

  return {
    players: players.data!,
    picks: picks.data!,
    budget: Number(settings.data!.budget),
    nextGameweek: next.data,
    canChangePlayers: (entry.data ?? []).length === 0,
    stats,
  };
}

function demoTeamData(): TeamData {
  const next = DEMO_GAMEWEEKS[2];
  return {
    players: DEMO_PLAYERS,
    picks: process.env.DEV_EMPTY_SQUAD === "1" ? [] : DEMO_SQUAD_PICKS,
    budget: 35,
    nextGameweek: { id: next.id, number: next.number, deadline: next.deadline },
    canChangePlayers: true,
    stats: Object.fromEntries(DEMO_PLAYERS.map((p, i) => [p.id, { total: (i * 7) % 31, last: (i * 3) % 9 }])),
  };
}
