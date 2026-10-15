import { describe, expect, it } from "vitest";
import {
  addBlocker,
  addPlayer,
  autoPick,
  emptySquad,
  fixArmbands,
  fromPicks,
  playerIds,
  removePlayer,
  setCaptain,
  setViceCaptain,
  squadCost,
  squadProblems,
  swapSlots,
  toPicks,
  transferSummary,
  type PoolPlayer,
  type Squad,
} from "./squad";

const pool: PoolPlayer[] = [
  { id: "a", name: "A", price: 12.5, is_active: true },
  { id: "b", name: "B", price: 9, is_active: true },
  { id: "c", name: "C", price: 7, is_active: true },
  { id: "d", name: "D", price: 4, is_active: true },
  { id: "e", name: "E", price: 3, is_active: true },
  { id: "f", name: "F", price: 3, is_active: false },
  { id: "g", name: "G", price: 11, is_active: true },
];
const price = (id: string) => pool.find((p) => p.id === id)!.price;
const build = (...ids: string[]) => ids.reduce<Squad>((s, id) => addPlayer(s, id), emptySquad());
const armbands = (s: Squad) => ({
  captain: s.find((x) => x?.isCaptain)?.playerId,
  vice: s.find((x) => x?.isViceCaptain)?.playerId,
});

describe("adding and removing", () => {
  it("fills starters first, then the bench, and hands out armbands", () => {
    const s = build("a", "b", "c", "d", "e");
    expect(playerIds(s)).toEqual(["a", "b", "c", "d", "e"]);
    expect(armbands(s)).toEqual({ captain: "a", vice: "b" });
    expect(addPlayer(s, "g")).toBe(s); // full
    expect(addPlayer(s, "a")).toBe(s); // already picked
  });

  it("promotes the vice-captain when the captain is removed", () => {
    const s = removePlayer(build("a", "b", "c", "d", "e"), "a");
    expect(s[0]).toBeNull();
    expect(armbands(s)).toEqual({ captain: "b", vice: "c" });
    expect(playerIds(addPlayer(s, "g"))).toEqual(["g", "b", "c", "d", "e"]); // refills the gap
  });
});

describe("armbands", () => {
  it("setCaptain swaps roles with the vice-captain", () => {
    const s = setCaptain(build("a", "b", "c", "d", "e"), "b");
    expect(armbands(s)).toEqual({ captain: "b", vice: "a" });
  });

  it("setViceCaptain swaps roles with the captain", () => {
    const s = setViceCaptain(build("a", "b", "c", "d", "e"), "a");
    expect(armbands(s)).toEqual({ captain: "b", vice: "a" });
    expect(armbands(setViceCaptain(s, "d"))).toEqual({ captain: "b", vice: "d" });
  });

  it("never gives the bench player an armband", () => {
    const s = build("a", "b", "c", "d", "e");
    expect(setCaptain(s, "e")).toBe(s);
    const fixed = fixArmbands(s.map((x, i) => (i === 4 ? { ...x!, isCaptain: true } : x)));
    expect(fixed[4]?.isCaptain).toBe(false);
  });
});

describe("bench swaps", () => {
  it("passes the armband to the player coming off the bench", () => {
    const s = swapSlots(build("a", "b", "c", "d", "e"), 0, 4); // captain a ↔ bench e
    expect(playerIds(s)).toEqual(["e", "b", "c", "d", "a"]);
    expect(armbands(s)).toEqual({ captain: "e", vice: "b" });
    expect(s[4]).toEqual({ playerId: "a", isCaptain: false, isViceCaptain: false });
  });

  it("works the other way round too", () => {
    const s = swapSlots(build("a", "b", "c", "d", "e"), 4, 1); // bench e ↔ vice b
    expect(playerIds(s)).toEqual(["a", "e", "c", "d", "b"]);
    expect(armbands(s)).toEqual({ captain: "a", vice: "e" });
  });
});

describe("saving", () => {
  it("round-trips through database picks", () => {
    const s = build("a", "b", "c", "d", "e");
    expect(fromPicks(toPicks(s))).toEqual(s);
    expect(toPicks(s)[4]).toEqual({ position: 5, player_id: "e", is_captain: false, is_vice_captain: false });
  });

  it("lists what's stopping a save", () => {
    expect(squadProblems(build("a", "b"), 21.5, 35)).toEqual(["Pick 3 more players."]);
    const full = build("a", "g", "b", "c", "d");
    expect(squadProblems(full, squadCost(full, price), 35)).toEqual(["£8.5m over budget."]);
    expect(squadProblems(build("a", "b", "c", "d", "e"), 35.5 - 0.0, 35.5)).toEqual([]);
  });
});

describe("addBlocker", () => {
  const s = build("a", "b");
  it("explains why a player is greyed out", () => {
    expect(addBlocker(pool[0], s, 13.5)).toBe("In your squad");
    expect(addBlocker(pool[5], s, 13.5)).toBe("Unavailable");
    expect(addBlocker(pool[6], s, 10)).toBe("£1.0m over budget");
    expect(addBlocker(pool[6], build("a", "b", "c", "d", "e"), 50)).toBe("Squad full");
    expect(addBlocker(pool[2], s, 7)).toBeNull(); // exactly affordable
  });
});

describe("autoPick", () => {
  it("completes the squad within budget using only available players", () => {
    for (let seed = 1; seed <= 25; seed++) {
      let x = seed;
      const random = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
      const s = autoPick(build("e"), pool, 35, random); // £32m left: the 4 cheapest others cost £31m
      expect(playerIds(s)).toHaveLength(5);
      expect(playerIds(s)).not.toContain("f");
      expect(squadCost(s, price)).toBeLessThanOrEqual(35);
    }
  });

  it("stops rather than overspending when the budget can't be met", () => {
    const s = autoPick(emptySquad(), pool, 10);
    expect(squadCost(s, price)).toBeLessThanOrEqual(10);
    expect(playerIds(s).length).toBeLessThan(5);
  });
});

describe("transfers", () => {
  const rules = { baselineIds: ["a", "b", "c", "d", "e"], freeTransfers: 1, hitPoints: 5, unlimited: false };

  it("is free for new managers with no locked team", () => {
    expect(transferSummary(build("g", "b", "c", "d", "e"), { ...rules, baselineIds: null })).toEqual({
      out: [], in: [], made: 0, hit: 0, freeLeft: null,
    });
  });

  it("counts players who weren't in the last locked team", () => {
    expect(transferSummary(build("a", "b", "c", "d", "e"), rules)).toMatchObject({ made: 0, hit: 0, freeLeft: 1 });
    expect(transferSummary(build("a", "b", "c", "d", "g"), rules)).toEqual({
      out: ["e"], in: ["g"], made: 1, hit: 0, freeLeft: 0,
    });
  });

  it("charges the hit for each transfer beyond the free ones", () => {
    const s = removePlayer(removePlayer(build("a", "b", "c", "d", "e"), "d"), "e");
    expect(transferSummary(addPlayer(addPlayer(s, "g"), "f"), rules)).toMatchObject({ made: 2, hit: 5 });
    expect(transferSummary(build("g", "f", "c", "d", "e"), { ...rules, hitPoints: 4, freeTransfers: 0 })).toMatchObject({ made: 2, hit: 8 });
  });

  it("makes undoing a transfer free", () => {
    const swapped = addPlayer(removePlayer(build("a", "b", "c", "d", "e"), "e"), "g");
    const undone = addPlayer(removePlayer(swapped, "g"), "e");
    expect(transferSummary(undone, rules)).toMatchObject({ made: 0, hit: 0 });
  });

  it("ignores line-up changes and counts a half-finished swap as nothing yet", () => {
    expect(transferSummary(swapSlots(build("a", "b", "c", "d", "e"), 0, 4), rules)).toMatchObject({ made: 0 });
    expect(transferSummary(removePlayer(build("a", "b", "c", "d", "e"), "e"), rules)).toMatchObject({ out: ["e"], in: [], made: 0 });
  });

  it("makes every transfer free with a Wildcard or Free Hit", () => {
    expect(transferSummary(build("g", "f", "c", "d", "e"), { ...rules, unlimited: true })).toMatchObject({
      made: 2, hit: 0, freeLeft: null,
    });
  });
});
