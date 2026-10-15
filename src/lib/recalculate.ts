import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { scoreGameweek, type EntryInput, type PlayerResult } from "@/lib/scoring";

type Client = SupabaseClient<Database>;

/**
 * Re-scores one gameweek from its raw results and locked snapshots with the
 * scoring function, and stores every player's and manager's points.
 * `publish` also marks the gameweek as published. Admins only (the database
 * functions check).
 */
export async function recalculateGameweek(supabase: Client, gameweekId: number, publish: boolean) {
  const [rules, results, appearances, entries, picks] = await Promise.all([
    supabase.from("scoring_rules").select("id, points"),
    supabase.from("rule_results").select("player_id, rule_id, count").eq("gameweek_id", gameweekId),
    supabase.from("player_gameweeks").select("player_id, did_not_play").eq("gameweek_id", gameweekId),
    supabase.from("gameweek_entries").select("user_id, chip, transfer_hit").eq("gameweek_id", gameweekId),
    supabase
      .from("gameweek_picks")
      .select("user_id, position, player_id, is_captain, is_vice_captain")
      .eq("gameweek_id", gameweekId),
  ]);
  const failed = [rules, results, appearances, entries, picks].find((r) => r.error);
  if (failed?.error) return failed.error;

  const raw: Record<string, PlayerResult> = {};
  for (const a of appearances.data!) raw[a.player_id] = { didNotPlay: a.did_not_play, counts: {} };
  for (const r of results.data!) {
    (raw[r.player_id] ??= { didNotPlay: false, counts: {} }).counts[r.rule_id] = r.count;
  }

  const input: Record<string, EntryInput> = {};
  for (const e of entries.data!) input[e.user_id] = { picks: [], chip: e.chip, transferHit: e.transfer_hit };
  for (const p of picks.data!) {
    input[p.user_id]?.picks.push({
      position: p.position,
      playerId: p.player_id,
      isCaptain: p.is_captain,
      isViceCaptain: p.is_vice_captain,
    });
  }

  const scored = scoreGameweek({ rules: rules.data!, results: raw, entries: input });
  const { error } = await supabase.rpc("admin_store_points", {
    p_gameweek_id: gameweekId,
    p_players: Object.entries(scored.players).map(([player_id, s]) => ({ player_id, points: s.points })),
    p_entries: Object.entries(scored.entries).map(([user_id, s]) => ({ user_id, points: s.total })),
    p_publish: publish,
  });
  return error;
}

/** Re-scores every published gameweek (e.g. after a scoring rule's points change). */
export async function recalculatePublished(supabase: Client) {
  const { data, error } = await supabase.from("gameweeks").select("id").eq("status", "published");
  if (error) return error;
  for (const gw of data) {
    const failed = await recalculateGameweek(supabase, gw.id, false);
    if (failed) return failed;
  }
  return null;
}
