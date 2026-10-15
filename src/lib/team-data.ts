import "server-only";
import { describeDbError } from "@/lib/action-result";
import type { Chip, Player } from "@/lib/database.types";
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
  /** Players in the last locked team; null = no locked team yet, so changes are free. */
  baselineIds: string[] | null;
  freeTransfers: number;
  hitPoints: number;
  /** Chip played for the next gameweek. */
  activeChip: Chip | null;
  /** Chips used (or playing) this season, with the gameweek number. */
  chipsUsed: { chip: Chip; gameweekNumber: number }[];
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
  const [players, picks, settings, next, transferState, chips, published, results] = await Promise.all([
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
    supabase.rpc("get_transfer_state"),
    supabase.from("chip_plays").select("chip, gameweeks(number)").eq("user_id", userId),
    supabase.from("gameweeks").select("id").eq("status", "published").order("deadline", { ascending: false }).limit(1),
    supabase.from("player_gameweeks").select("player_id, gameweek_id, points"),
  ]);
  const failed = [players, picks, settings, next, transferState, chips, published, results].find((r) => r.error);
  if (failed?.error) throw new Error(`Couldn't load your team. ${describeDbError(failed.error)}`);
  const transfers = transferState.data!;

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
    baselineIds: transfers.baseline_player_ids,
    freeTransfers: transfers.free_transfers,
    hitPoints: transfers.hit_points,
    activeChip: transfers.chip,
    chipsUsed: (chips.data ?? []).map((c) => ({ chip: c.chip, gameweekNumber: c.gameweeks?.number ?? 0 })),
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
    baselineIds: DEMO_SQUAD_PICKS.map((p) => p.player_id),
    freeTransfers: 1,
    hitPoints: 5,
    activeChip: (process.env.DEV_CHIP as Chip | undefined) || null,
    chipsUsed: [
      { chip: "free_hit", gameweekNumber: 1 },
      ...(process.env.DEV_CHIP ? [{ chip: process.env.DEV_CHIP as Chip, gameweekNumber: next.number }] : []),
    ],
    stats: Object.fromEntries(DEMO_PLAYERS.map((p, i) => [p.id, { total: (i * 7) % 31, last: (i * 3) % 9 }])),
  };
}
