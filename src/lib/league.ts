/**
 * League standings as a pure function: totals over published gameweeks,
 * shared ranks for equal points (1, 1, 3…) and movement since the previous
 * published gameweek.
 */

export type Manager = { userId: string; teamName: string; displayName: string };

/** A manager's points for one published gameweek. */
export type GameweekPoints = { userId: string; gameweekId: number; points: number };

export type Movement = "up" | "down" | "same" | "new";

export type StandingRow = Manager & {
  rank: number;
  /** Rank before the latest published gameweek (null if there wasn't one). */
  previousRank: number | null;
  movement: Movement;
  /** Points in the latest published gameweek (null = no team that week). */
  gameweekPoints: number | null;
  total: number;
};

/** Competition ranking: equal values share a rank and the next rank skips. */
export function sharedRanks(values: number[]): number[] {
  return values.map((v) => values.filter((other) => other > v).length + 1);
}

function totals(managers: Manager[], points: GameweekPoints[], gameweekIds: Set<number>) {
  const sum = new Map(managers.map((m) => [m.userId, 0]));
  for (const p of points) {
    if (gameweekIds.has(p.gameweekId) && sum.has(p.userId)) sum.set(p.userId, sum.get(p.userId)! + p.points);
  }
  return sum;
}

/**
 * @param publishedGameweekIds published gameweeks in deadline order (oldest first)
 */
export function computeStandings(
  managers: Manager[],
  points: GameweekPoints[],
  publishedGameweekIds: number[],
): StandingRow[] {
  const latest = publishedGameweekIds.at(-1);
  const now = totals(managers, points, new Set(publishedGameweekIds));
  const before = totals(managers, points, new Set(publishedGameweekIds.slice(0, -1)));

  const rankMap = (sum: Map<string, number>) => {
    const ids = [...sum.keys()];
    const ranks = sharedRanks(ids.map((id) => sum.get(id)!));
    return new Map(ids.map((id, i) => [id, ranks[i]]));
  };
  const rankNow = rankMap(now);
  const rankBefore = publishedGameweekIds.length > 1 ? rankMap(before) : null;
  // Managers who had no team in any earlier published week are new to the table.
  const playedBefore = new Set(
    points.filter((p) => publishedGameweekIds.slice(0, -1).includes(p.gameweekId)).map((p) => p.userId),
  );

  return managers
    .map((m): StandingRow => {
      const rank = rankNow.get(m.userId)!;
      const previousRank = rankBefore && playedBefore.has(m.userId) ? rankBefore.get(m.userId)! : null;
      const gw = latest == null ? undefined : points.find((p) => p.userId === m.userId && p.gameweekId === latest);
      return {
        ...m,
        rank,
        previousRank,
        movement:
          previousRank == null
            ? rankBefore
              ? "new"
              : "same"
            : rank < previousRank
              ? "up"
              : rank > previousRank
                ? "down"
                : "same",
        gameweekPoints: gw ? gw.points : null,
        total: now.get(m.userId)!,
      };
    })
    .sort((a, b) => a.rank - b.rank || a.teamName.localeCompare(b.teamName, "en", { sensitivity: "base" }));
}
