import { describe, expect, it } from "vitest";
import { computeStandings, sharedRanks } from "./league";

const managers = [
  { userId: "u1", teamName: "Aces", displayName: "Ann" },
  { userId: "u2", teamName: "Baseliners", displayName: "Bo" },
  { userId: "u3", teamName: "Cross Court", displayName: "Cy" },
  { userId: "u4", teamName: "Drop Shots", displayName: "Di" },
];

describe("sharedRanks", () => {
  it("gives equal points the same rank and skips the next", () => {
    expect(sharedRanks([10, 20, 20, 5])).toEqual([3, 1, 1, 4]);
    expect(sharedRanks([0, 0])).toEqual([1, 1]);
  });
});

describe("computeStandings", () => {
  it("ranks everyone on 0 together before anything is published", () => {
    const rows = computeStandings(managers, [], []);
    expect(rows.map((r) => [r.teamName, r.rank, r.total, r.gameweekPoints, r.movement])).toEqual([
      ["Aces", 1, 0, null, "same"],
      ["Baseliners", 1, 0, null, "same"],
      ["Cross Court", 1, 0, null, "same"],
      ["Drop Shots", 1, 0, null, "same"],
    ]);
  });

  it("totals published weeks, shows the latest week, and tracks movement", () => {
    const points = [
      { userId: "u1", gameweekId: 1, points: 30 },
      { userId: "u2", gameweekId: 1, points: 20 },
      { userId: "u3", gameweekId: 1, points: 10 },
      { userId: "u1", gameweekId: 2, points: 0 },
      { userId: "u2", gameweekId: 2, points: 15 },
      { userId: "u3", gameweekId: 2, points: 20 },
      { userId: "u4", gameweekId: 2, points: 30 }, // late joiner
      { userId: "u1", gameweekId: 3, points: 99 }, // not published yet: ignored
    ];
    const rows = computeStandings(managers, points, [1, 2]);
    expect(rows.map((r) => [r.teamName, r.rank, r.previousRank, r.movement, r.gameweekPoints, r.total])).toEqual([
      ["Baseliners", 1, 2, "up", 15, 35],
      ["Aces", 2, 1, "down", 0, 30],
      ["Cross Court", 2, 3, "up", 20, 30], // shares 2nd with Aces
      ["Drop Shots", 2, null, "new", 30, 30],
    ]);
  });

  it("shows no team that week as null points, not 0", () => {
    const rows = computeStandings(managers.slice(0, 2), [{ userId: "u1", gameweekId: 1, points: 4 }], [1]);
    expect(rows.find((r) => r.userId === "u2")).toMatchObject({ gameweekPoints: null, total: 0, rank: 2 });
  });
});
