/**
 * Squad editing as pure functions, used by the Team page for instant
 * (optimistic) updates. The database (public.save_squad) re-checks every rule.
 *
 * A squad is 5 slots: indexes 0–3 are starters, index 4 is the bench.
 */

export const SQUAD_SIZE = 5;
export const STARTER_COUNT = 4;
export const BENCH_INDEX = 4;

export type Slot = { playerId: string; isCaptain: boolean; isViceCaptain: boolean } | null;
export type Squad = Slot[];

export type PoolPlayer = { id: string; name: string; price: number; is_active: boolean };

export type SavedPick = { position: number; player_id: string; is_captain: boolean; is_vice_captain: boolean };

export const emptySquad = (): Squad => Array.from({ length: SQUAD_SIZE }, () => null);

export function fromPicks(picks: SavedPick[]): Squad {
  const squad = emptySquad();
  for (const p of picks) {
    if (p.position >= 1 && p.position <= SQUAD_SIZE) {
      squad[p.position - 1] = { playerId: p.player_id, isCaptain: p.is_captain, isViceCaptain: p.is_vice_captain };
    }
  }
  return squad;
}

export function toPicks(squad: Squad): SavedPick[] {
  return squad.flatMap((slot, i) =>
    slot ? [{ position: i + 1, player_id: slot.playerId, is_captain: slot.isCaptain, is_vice_captain: slot.isViceCaptain }] : [],
  );
}

export const playerIds = (squad: Squad) => squad.flatMap((s) => (s ? [s.playerId] : []));
export const isFull = (squad: Squad) => squad.every(Boolean);
export const indexOf = (squad: Squad, playerId: string) => squad.findIndex((s) => s?.playerId === playerId);
export const isStarterIndex = (i: number) => i >= 0 && i < STARTER_COUNT;

export function squadCost(squad: Squad, priceOf: (id: string) => number): number {
  return round1(playerIds(squad).reduce((sum, id) => sum + priceOf(id), 0));
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Armbands only on starters; fill a missing captain / vice-captain from the starters. */
export function fixArmbands(squad: Squad): Squad {
  const next = squad.map((s, i) => (s && !isStarterIndex(i) ? { ...s, isCaptain: false, isViceCaptain: false } : s));
  const starters = next.slice(0, STARTER_COUNT);

  if (!starters.some((s) => s?.isCaptain)) {
    // Promote the vice-captain if there is one, else the first starter.
    const i = starters.findIndex((s) => s?.isViceCaptain) >= 0 ? starters.findIndex((s) => s?.isViceCaptain) : starters.findIndex(Boolean);
    if (i >= 0) next[i] = { ...next[i]!, isCaptain: true, isViceCaptain: false };
  }
  if (!next.slice(0, STARTER_COUNT).some((s) => s?.isViceCaptain)) {
    const i = next.slice(0, STARTER_COUNT).findIndex((s) => s && !s.isCaptain);
    if (i >= 0) next[i] = { ...next[i]!, isViceCaptain: true };
  }
  return next;
}

/** Adds to the first empty starter slot, else the bench. No-op if full or already picked. */
export function addPlayer(squad: Squad, playerId: string): Squad {
  if (indexOf(squad, playerId) >= 0) return squad;
  const empty = squad.findIndex((s) => s === null);
  if (empty < 0) return squad;
  const next = [...squad];
  next[empty] = { playerId, isCaptain: false, isViceCaptain: false };
  return fixArmbands(next);
}

export function removePlayer(squad: Squad, playerId: string): Squad {
  const i = indexOf(squad, playerId);
  if (i < 0) return squad;
  const next = [...squad];
  next[i] = null;
  return fixArmbands(next);
}

/**
 * Swaps two slots (e.g. a starter with the bench). An armband never goes to
 * the bench: it passes to whoever moves into the starting line-up.
 */
export function swapSlots(squad: Squad, a: number, b: number): Squad {
  const next = [...squad];
  [next[a], next[b]] = [next[b], next[a]];
  for (const [from, to] of [
    [a, b],
    [b, a],
  ]) {
    const benched = next[from];
    const promoted = next[to];
    if (!isStarterIndex(from) && benched && (benched.isCaptain || benched.isViceCaptain)) {
      next[from] = { ...benched, isCaptain: false, isViceCaptain: false };
      if (promoted && isStarterIndex(to)) {
        next[to] = { ...promoted, isCaptain: benched.isCaptain, isViceCaptain: benched.isViceCaptain };
      }
    }
  }
  return fixArmbands(next);
}

/** Make a starter captain. If they were vice-captain, the old captain becomes vice. */
export function setCaptain(squad: Squad, playerId: string): Squad {
  const i = indexOf(squad, playerId);
  if (!isStarterIndex(i)) return squad;
  const wasVice = squad[i]!.isViceCaptain;
  return fixArmbands(
    squad.map((s, j) => {
      if (!s) return s;
      if (j === i) return { ...s, isCaptain: true, isViceCaptain: false };
      if (s.isCaptain) return { ...s, isCaptain: false, isViceCaptain: wasVice };
      return s;
    }),
  );
}

/** Make a starter vice-captain. If they were captain, the old vice becomes captain. */
export function setViceCaptain(squad: Squad, playerId: string): Squad {
  const i = indexOf(squad, playerId);
  if (!isStarterIndex(i)) return squad;
  const wasCaptain = squad[i]!.isCaptain;
  return fixArmbands(
    squad.map((s, j) => {
      if (!s) return s;
      if (j === i) return { ...s, isCaptain: false, isViceCaptain: true };
      if (s.isViceCaptain) return { ...s, isViceCaptain: false, isCaptain: wasCaptain };
      return s;
    }),
  );
}

/** Problems that stop the squad being saved (empty = ready). */
export function squadProblems(squad: Squad, cost: number, budget: number): string[] {
  const problems: string[] = [];
  const missing = squad.filter((s) => !s).length;
  if (missing) problems.push(`Pick ${missing} more player${missing === 1 ? "" : "s"}.`);
  if (cost > budget) problems.push(`£${(cost - budget).toFixed(1)}m over budget.`);
  const starters = squad.slice(0, STARTER_COUNT);
  if (!missing && !starters.some((s) => s?.isCaptain)) problems.push("Choose a captain.");
  if (!missing && !starters.some((s) => s?.isViceCaptain)) problems.push("Choose a vice-captain.");
  return problems;
}

/** Why a player can't be added right now (null = they can). */
export function addBlocker(player: PoolPlayer, squad: Squad, budgetLeft: number): string | null {
  if (indexOf(squad, player.id) >= 0) return "In your squad";
  if (!player.is_active) return "Unavailable";
  if (isFull(squad)) return "Squad full";
  if (round1(player.price - budgetLeft) > 0) return `£${round1(player.price - budgetLeft).toFixed(1)}m over budget`;
  return null;
}

/**
 * Fills the empty slots with random available players while staying within
 * budget (it always leaves enough money for the cheapest options).
 */
export function autoPick(squad: Squad, pool: PoolPlayer[], budget: number, random: () => number = Math.random): Squad {
  const priceOf = new Map(pool.map((p) => [p.id, p.price]));
  let next = squad;
  let left = round1(budget - squadCost(squad, (id) => priceOf.get(id) ?? 0));
  const candidates = shuffle(
    pool.filter((p) => p.is_active && indexOf(squad, p.id) < 0),
    random,
  );

  while (!isFull(next)) {
    const slotsAfterThis = next.filter((s) => !s).length - 1;
    const remaining = candidates.filter((p) => indexOf(next, p.id) < 0);
    const pick = remaining.find((p) => {
      const others = remaining.filter((o) => o.id !== p.id).map((o) => o.price).sort((x, y) => x - y);
      const cheapestRest = others.slice(0, slotsAfterThis).reduce((a, b) => a + b, 0);
      return others.length >= slotsAfterThis && round1(p.price + cheapestRest) <= left;
    });
    if (!pick) break; // can't complete within budget
    next = addPlayer(next, pick.id);
    left = round1(left - pick.price);
  }
  return next;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type TransferRules = {
  /** Players in the last locked team; null = no locked team yet (changes are free). */
  baselineIds: string[] | null;
  freeTransfers: number;
  hitPoints: number;
  /** Wildcard / Free Hit active: every transfer is free. */
  unlimited: boolean;
};

export type TransferSummary = {
  /** Players who've left since the last locked team, paired in order with `in`. */
  out: string[];
  in: string[];
  made: number;
  /** Points deducted, as a positive number. */
  hit: number;
  /** Free transfers still unused this gameweek (null = unlimited). */
  freeLeft: number | null;
};

/**
 * Transfers for the coming gameweek, counted against the last locked team
 * (mirrors private.transfer_state in the database). Undoing a transfer before
 * the deadline makes it disappear, so it costs nothing.
 */
export function transferSummary(squad: Squad, rules: TransferRules): TransferSummary {
  if (!rules.baselineIds) return { out: [], in: [], made: 0, hit: 0, freeLeft: null };
  const current = playerIds(squad);
  const out = rules.baselineIds.filter((id) => !current.includes(id));
  const added = current.filter((id) => !rules.baselineIds!.includes(id));
  const made = added.length;
  if (rules.unlimited) return { out, in: added, made, hit: 0, freeLeft: null };
  return {
    out,
    in: added,
    made,
    hit: Math.max(0, made - rules.freeTransfers) * rules.hitPoints,
    freeLeft: Math.max(0, rules.freeTransfers - made),
  };
}
