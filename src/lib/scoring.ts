/**
 * All of the game's scoring, as pure functions (no database, no clock).
 *
 * - Player gameweek points = sum of (rule points × count). Every rule counts,
 *   whatever its category: "did not play" doesn't remove points, it only
 *   triggers the bench auto-sub and the vice-captain switch.
 * - Manager gameweek points = the 4 starters, plus the bench player if any
 *   starter didn't play, with the captain multiplier (2×, or 3× with Triple
 *   Captain; the vice-captain gets it if the captain didn't play), minus the
 *   transfer hit (never charged with a Wildcard or Free Hit).
 * - Each gameweek is scored from that gameweek's locked snapshot, so a Free
 *   Hit squad only scores in its own week and the reverted squad scores after.
 */
import type { Chip } from "@/lib/database.types";

export const STARTERS = 4;
export const BENCH_POSITION = 5;

export type RuleDef = { id: string; points: number };

/** Raw results for one player in one gameweek. */
export type PlayerResult = { didNotPlay: boolean; counts: Record<string, number> };

/** A player's final score for the gameweek. */
export type PlayerScore = { points: number; didNotPlay: boolean };

export type EntryPick = { position: number; playerId: string; isCaptain: boolean; isViceCaptain: boolean };

export type EntryInput = { picks: EntryPick[]; chip: Chip | null; transferHit: number };

export type PickBreakdown = {
  playerId: string;
  position: number;
  /** The player's own points. */
  basePoints: number;
  didNotPlay: boolean;
  /** 0 = didn't count (bench not needed), 1 = normal, 2/3 = armband. */
  multiplier: number;
  /** What this pick added to the manager's total. */
  points: number;
  /** The bench player came in because a starter didn't play. */
  autoSubbedIn: boolean;
};

export type EntryScore = {
  total: number;
  /** Before the transfer hit. */
  gross: number;
  hit: number;
  /** Who got the captain multiplier (null if neither captain nor vice played). */
  multiplierPlayerId: string | null;
  picks: PickBreakdown[];
};

/** Sum of (rule points × count). Unknown rules are ignored. */
export function playerPoints(result: PlayerResult | undefined, rules: RuleDef[]): number {
  if (!result) return 0;
  return rules.reduce((sum, rule) => sum + rule.points * (result.counts[rule.id] ?? 0), 0);
}

export function captainMultiplier(chip: Chip | null): number {
  return chip === "triple_captain" ? 3 : 2;
}

/** Points deducted for transfers (a Wildcard or Free Hit makes them free). */
export function effectiveHit(entry: Pick<EntryInput, "chip" | "transferHit">): number {
  return entry.chip === "wildcard" || entry.chip === "free_hit" ? 0 : Math.max(0, entry.transferHit);
}

/** Scores one manager's locked team, given each player's points for the week. */
export function scoreEntry(entry: EntryInput, players: Record<string, PlayerScore | undefined>): EntryScore {
  const picks = [...entry.picks].sort((a, b) => a.position - b.position);
  const score = (id: string) => players[id] ?? { points: 0, didNotPlay: false };
  const starters = picks.filter((p) => p.position <= STARTERS);
  const bench = picks.find((p) => p.position === BENCH_POSITION);

  const benchComesIn = bench != null && starters.some((p) => score(p.playerId).didNotPlay);

  const captain = starters.find((p) => p.isCaptain);
  const vice = starters.find((p) => p.isViceCaptain);
  const armband =
    captain && !score(captain.playerId).didNotPlay
      ? captain
      : vice && !score(vice.playerId).didNotPlay
        ? vice
        : null;
  const multiplier = captainMultiplier(entry.chip);

  const breakdown = picks.map((p): PickBreakdown => {
    const s = score(p.playerId);
    const isBench = p.position === BENCH_POSITION;
    const m = isBench ? (benchComesIn ? 1 : 0) : p === armband ? multiplier : 1;
    return {
      playerId: p.playerId,
      position: p.position,
      basePoints: s.points,
      didNotPlay: s.didNotPlay,
      multiplier: m,
      points: s.points * m,
      autoSubbedIn: isBench && benchComesIn,
    };
  });

  const gross = breakdown.reduce((sum, p) => sum + p.points, 0);
  const hit = effectiveHit(entry);
  return { total: gross - hit, gross, hit, multiplierPlayerId: armband?.playerId ?? null, picks: breakdown };
}

/**
 * Scores a whole gameweek from the raw results: every player's points and
 * every manager's total. This is what publishing (and any recalculation) runs.
 */
export function scoreGameweek(input: {
  rules: RuleDef[];
  results: Record<string, PlayerResult>;
  entries: Record<string, EntryInput>;
}): { players: Record<string, PlayerScore>; entries: Record<string, EntryScore> } {
  const players: Record<string, PlayerScore> = {};
  for (const [playerId, result] of Object.entries(input.results)) {
    players[playerId] = { points: playerPoints(result, input.rules), didNotPlay: result.didNotPlay };
  }
  const entries: Record<string, EntryScore> = {};
  for (const [userId, entry] of Object.entries(input.entries)) {
    entries[userId] = scoreEntry(entry, players);
  }
  return { players, entries };
}
