import type { Chip } from "@/lib/database.types";
import type { EntryInput, PlayerResult } from "@/lib/scoring";

/** Rows as they come from the database for one gameweek. */
export type GameweekRows = {
  rules: { id: string; points: number }[];
  results: { player_id: string; rule_id: string; count: number }[];
  appearances: { player_id: string; did_not_play: boolean }[];
  entries: { user_id: string; chip: Chip | null; transfer_hit: number }[];
  picks: { user_id: string; position: number; player_id: string; is_captain: boolean; is_vice_captain: boolean }[];
};

/** Turns database rows into the scoring function's input. */
export function scoringInputFromRows(rows: GameweekRows) {
  const results: Record<string, PlayerResult> = {};
  for (const a of rows.appearances) results[a.player_id] = { didNotPlay: a.did_not_play, counts: {} };
  for (const r of rows.results) {
    (results[r.player_id] ??= { didNotPlay: false, counts: {} }).counts[r.rule_id] = r.count;
  }

  const entries: Record<string, EntryInput> = {};
  for (const e of rows.entries) entries[e.user_id] = { picks: [], chip: e.chip, transferHit: e.transfer_hit };
  for (const p of rows.picks) {
    entries[p.user_id]?.picks.push({
      position: p.position,
      playerId: p.player_id,
      isCaptain: p.is_captain,
      isViceCaptain: p.is_vice_captain,
    });
  }
  return { rules: rows.rules, results, entries };
}
