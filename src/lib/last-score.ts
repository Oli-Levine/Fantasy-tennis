import "server-only";
import type { Chip } from "@/lib/database.types";
import { DEMO_SQUAD_PICKS } from "@/lib/dev-fixtures";
import { devAuthBypass } from "@/lib/env";
import { scoreEntry, type EntryPick, type EntryScore, type PlayerScore } from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";

export type LastScore = {
  gameweekId: number;
  number: number;
  chip: Chip | null;
  /** The team that was locked in for that gameweek. */
  picks: EntryPick[];
  score: EntryScore;
};

/** The manager's scored team for a published gameweek (null if they had no team that week). */
export async function loadLastScore(
  userId: string,
  gameweek: { id: number; number: number } | null,
): Promise<LastScore | null> {
  if (!gameweek) return null;
  if (devAuthBypass()) return demoLastScore(gameweek);

  const supabase = await createClient();
  const [entry, picks, appearances] = await Promise.all([
    supabase
      .from("gameweek_entries")
      .select("chip, transfer_hit")
      .eq("user_id", userId)
      .eq("gameweek_id", gameweek.id)
      .maybeSingle(),
    supabase
      .from("gameweek_picks")
      .select("position, player_id, is_captain, is_vice_captain")
      .eq("user_id", userId)
      .eq("gameweek_id", gameweek.id),
    supabase.from("player_gameweeks").select("player_id, did_not_play, points").eq("gameweek_id", gameweek.id),
  ]);
  const failed = [entry, picks, appearances].find((r) => r.error);
  if (failed?.error) throw new Error(`Couldn't load your last gameweek: ${failed.error.message}`);
  if (!entry.data) return null;

  const entryPicks = picks.data!.map((p) => ({
    position: p.position,
    playerId: p.player_id,
    isCaptain: p.is_captain,
    isViceCaptain: p.is_vice_captain,
  }));
  const scores: Record<string, PlayerScore> = {};
  for (const a of appearances.data!) scores[a.player_id] = { points: a.points ?? 0, didNotPlay: a.did_not_play };

  return {
    gameweekId: gameweek.id,
    number: gameweek.number,
    chip: entry.data.chip,
    picks: entryPicks,
    score: scoreEntry({ picks: entryPicks, chip: entry.data.chip, transferHit: entry.data.transfer_hit }, scores),
  };
}

function demoLastScore(gameweek: { id: number; number: number }): LastScore {
  const picks = DEMO_SQUAD_PICKS.map((p) => ({
    position: p.position,
    playerId: p.player_id,
    isCaptain: p.is_captain,
    isViceCaptain: p.is_vice_captain,
  }));
  const scores: Record<string, PlayerScore> = {
    p1: { points: 6, didNotPlay: true },
    p3: { points: 8, didNotPlay: false },
    p4: { points: 5, didNotPlay: false },
    p12: { points: 7, didNotPlay: false },
    p7: { points: 4, didNotPlay: false },
  };
  return {
    gameweekId: gameweek.id,
    number: gameweek.number,
    chip: null,
    picks,
    score: scoreEntry({ picks, chip: null, transferHit: 0 }, scores),
  };
}
