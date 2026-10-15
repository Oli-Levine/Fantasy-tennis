import { describe, expect, it } from "vitest";
import { formatPoints, parsePoints, validateRule } from "./rules";

describe("rules helpers", () => {
  it("formats points with signs", () => {
    expect([5, -1, 0].map(formatPoints)).toEqual(["+5", "−1", "0"]);
  });
  it("parses points written in different ways", () => {
    expect(["5", "+5", "-2", "−2", " 3 "].map(parsePoints)).toEqual([5, 5, -2, -2, 3]);
    expect(Number.isNaN(parsePoints("2.5"))).toBe(true);
    expect(Number.isNaN(parsePoints("five"))).toBe(true);
  });
  it("validates like the database", () => {
    expect(validateRule({ name: "Won match", points: 5, type: "tick", category: "match" })).toEqual([]);
    expect(validateRule({ name: "", points: NaN, type: "x", category: "y" })).toHaveLength(4);
    expect(validateRule({ name: "Big", points: 101, type: "count", category: "other" })).toEqual([
      "Points must be between −100 and 100.",
    ]);
  });
});
