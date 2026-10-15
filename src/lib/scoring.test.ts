import { describe, expect, it } from "vitest";
import { effectiveHit, playerPoints, scoreEntry, scoreGameweek, type EntryInput, type PlayerScore } from "./scoring";

const rules = [
  { id: "won", points: 5 },
  { id: "sets", points: 1 },
  { id: "bagelled", points: -1 },
  { id: "social", points: 2 },
];

/** Squad a b c d + bench e; a is captain, b vice-captain. */
const entry = (over: Partial<EntryInput> = {}): EntryInput => ({
  picks: ["a", "b", "c", "d", "e"].map((playerId, i) => ({
    position: i + 1,
    playerId,
    isCaptain: playerId === "a",
    isViceCaptain: playerId === "b",
  })),
  chip: null,
  transferHit: 0,
  ...over,
});

const pts = (points: Record<string, number>, dnp: string[] = []): Record<string, PlayerScore> =>
  Object.fromEntries(
    [...new Set([...Object.keys(points), ...dnp])].map((id) => [id, { points: points[id] ?? 0, didNotPlay: dnp.includes(id) }]),
  );

describe("player points", () => {
  it("sums rule points × count, with negatives", () => {
    expect(playerPoints({ didNotPlay: false, counts: { won: 1, sets: 2, bagelled: 3 } }, rules)).toBe(5 + 2 - 3);
    expect(playerPoints(undefined, rules)).toBe(0);
    expect(playerPoints({ didNotPlay: false, counts: { removed_rule: 4 } }, rules)).toBe(0);
  });

  it("still counts a player's points when they didn't play (e.g. a social)", () => {
    expect(playerPoints({ didNotPlay: true, counts: { social: 1 } }, rules)).toBe(2);
  });
});

describe("manager points", () => {
  it("adds the 4 starters, doubles the captain and leaves the bench out", () => {
    const s = scoreEntry(entry(), pts({ a: 10, b: 4, c: 3, d: 2, e: 7 }));
    expect(s.total).toBe(20 + 4 + 3 + 2);
    expect(s.multiplierPlayerId).toBe("a");
    expect(s.picks.find((p) => p.playerId === "e")).toMatchObject({ multiplier: 0, points: 0, autoSubbedIn: false });
  });

  it("Triple Captain: the captain scores 3×", () => {
    expect(scoreEntry(entry({ chip: "triple_captain" }), pts({ a: 10, b: 4, c: 3, d: 2 })).total).toBe(30 + 4 + 3 + 2);
  });

  it("gives the vice-captain the armband if the captain didn't play", () => {
    const s = scoreEntry(entry(), pts({ a: 2, b: 4, c: 3, d: 2, e: 1 }, ["a"]));
    expect(s.multiplierPlayerId).toBe("b");
    // a still scores their own (off-court) points once; bench comes in for them.
    expect(s.total).toBe(2 + 8 + 3 + 2 + 1);
  });

  it("gives the vice-captain 3× with Triple Captain if the captain didn't play", () => {
    expect(scoreEntry(entry({ chip: "triple_captain" }), pts({ b: 4 }, ["a"])).total).toBe(12);
  });

  it("gives nobody the armband if neither captain nor vice-captain played", () => {
    const s = scoreEntry(entry(), pts({ a: 2, b: 2, c: 3, d: 2, e: 5 }, ["a", "b"]));
    expect(s.multiplierPlayerId).toBeNull();
    expect(s.total).toBe(2 + 2 + 3 + 2 + 5);
  });

  it("auto-subs the bench player in when a starter didn't play", () => {
    const s = scoreEntry(entry(), pts({ a: 10, b: 4, c: 0, d: 2, e: 6 }, ["c"]));
    expect(s.total).toBe(20 + 4 + 0 + 2 + 6);
    expect(s.picks.find((p) => p.playerId === "e")).toMatchObject({ multiplier: 1, points: 6, autoSubbedIn: true });
  });

  it("only brings the one bench player in, however many starters miss out", () => {
    expect(scoreEntry(entry(), pts({ a: 10, e: 6 }, ["c", "d"])).total).toBe(20 + 6);
  });

  it("doesn't use the bench if every starter played, even if the bench didn't", () => {
    expect(scoreEntry(entry(), pts({ a: 1, b: 1, c: 1, d: 1, e: 9 }, ["e"])).total).toBe(5);
  });

  it("takes off the transfer hit", () => {
    const s = scoreEntry(entry({ transferHit: 5 }), pts({ a: 10, b: 4 }));
    expect(s).toMatchObject({ gross: 24, hit: 5, total: 19 });
    expect(scoreEntry(entry({ transferHit: 10 }), pts({})).total).toBe(-10); // can go negative
  });

  it("Wildcard: never charges a hit", () => {
    expect(scoreEntry(entry({ chip: "wildcard", transferHit: 15 }), pts({ a: 10 })).total).toBe(20);
    expect(effectiveHit({ chip: "wildcard", transferHit: 15 })).toBe(0);
  });

  it("Free Hit: no hit that week, and the reverted squad scores the week after", () => {
    // Week 1 (Free Hit): squad f g c d + e.
    const freeHit = entry({ chip: "free_hit", transferHit: 10 });
    freeHit.picks[0] = { ...freeHit.picks[0], playerId: "f" };
    freeHit.picks[1] = { ...freeHit.picks[1], playerId: "g" };
    const week1 = pts({ a: 9, b: 9, f: 3, g: 1, c: 1, d: 1 });
    expect(scoreEntry(freeHit, week1)).toMatchObject({ hit: 0, total: 6 + 1 + 1 + 1, multiplierPlayerId: "f" });
    // Week 2: back to a b c d + e (the snapshot after the revert).
    expect(scoreEntry(entry(), pts({ a: 9, b: 9, f: 3, g: 1 })).total).toBe(18 + 9);
  });

  it("treats players with no results as 0 points who played", () => {
    expect(scoreEntry(entry(), {})).toMatchObject({ total: 0, multiplierPlayerId: "a" });
  });
});

describe("whole gameweek", () => {
  it("scores every player from raw results and every manager from their snapshot", () => {
    const out = scoreGameweek({
      rules,
      results: {
        a: { didNotPlay: false, counts: { won: 1, sets: 2 } }, // 7
        c: { didNotPlay: true, counts: { social: 1 } }, // 2, didn't play
        e: { didNotPlay: false, counts: { won: 1 } }, // 5
      },
      entries: {
        m1: entry(),
        m2: entry({ chip: "triple_captain", transferHit: 5 }),
      },
    });
    expect(out.players).toEqual({
      a: { points: 7, didNotPlay: false },
      c: { points: 2, didNotPlay: true },
      e: { points: 5, didNotPlay: false },
    });
    expect(out.entries.m1.total).toBe(14 + 2 + 5);
    expect(out.entries.m2.total).toBe(21 + 2 + 5 - 5);
  });
});
