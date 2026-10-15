import { describe, expect, it } from "vitest";
import { parsePlayersCsv, parseCsv } from "./csv";
import { squareCrop } from "./image";
import { clubTeamLabel, parseActive, parseClubTeam, parsePrice, validatePlayer } from "./players";
import { fromLondonInputValue, toLondonDateInputValue, toLondonInputValue } from "./time";

describe("player field parsing", () => {
  it("reads club teams in common formats", () => {
    expect(["1", "1s", "2nd", "3rds", "Team 4", " 6s "].map(parseClubTeam)).toEqual([1, 1, 2, 3, 4, 6]);
    expect(["7", "0", "", "firsts", "1x"].map(parseClubTeam)).toEqual([null, null, null, null, null]);
    expect(clubTeamLabel(3)).toBe("3s");
  });

  it("reads prices with or without £ and m", () => {
    expect(["8.5", "£8.5m", "10", " 4.25 ", "7.0M"].map(parsePrice)).toEqual([8.5, 8.5, 10, 4.3, 7]);
    expect(["", "abc", "-1", "£"].map(parsePrice)).toEqual([null, null, null, null]);
  });

  it("reads active flags, defaulting to active", () => {
    expect(["", "yes", "Y", "true", "1", "available"].map(parseActive)).toEqual(Array(6).fill(true));
    expect(["no", "unavailable", "0", "injured"].map(parseActive)).toEqual(Array(4).fill(false));
    expect(parseActive("maybe")).toBeNull();
  });

  it("validates like the database", () => {
    expect(validatePlayer({ name: "Ava", club_team: 1, price: 8.5 })).toEqual([]);
    expect(validatePlayer({ name: " ", club_team: null, price: 0 })).toHaveLength(3);
    expect(validatePlayer({ name: "x".repeat(61), club_team: 2, price: 100 })).toHaveLength(2);
  });
});

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF and blank lines", () => {
    expect(parseCsv('a,b\r\n"Smith, Jo","say ""hi"""\n\n')).toEqual([
      ["a", "b"],
      ["Smith, Jo", 'say "hi"'],
    ]);
  });
  it("detects semicolon and tab delimiters (Excel exports)", () => {
    expect(parseCsv("name;team\nAva;1")).toEqual([["name", "team"], ["Ava", "1"]]);
    expect(parseCsv("name\tteam\nAva\t1")).toEqual([["name", "team"], ["Ava", "1"]]);
  });
});

describe("parsePlayersCsv", () => {
  it("reads a file with a header in any order", () => {
    const { rows, error } = parsePlayersCsv("Price,Name,Team,Active\n12.5,Ava Thornton,1s,yes\n3,Sam  Lee,6,no\n");
    expect(error).toBeNull();
    expect(rows.map((r) => r.input)).toEqual([
      { name: "Ava Thornton", club_team: 1, price: 12.5, is_active: true },
      { name: "Sam Lee", club_team: 6, price: 3, is_active: false },
    ]);
    expect(rows.map((r) => r.line)).toEqual([2, 3]);
  });

  it("reads a file without a header as name, team, price", () => {
    const { rows } = parsePlayersCsv("Ava,1,9\nBen,2,8");
    expect(rows.map((r) => r.input?.name)).toEqual(["Ava", "Ben"]);
    expect(rows[0].input?.is_active).toBe(true);
  });

  it("flags bad rows and duplicate names without stopping the rest", () => {
    const { rows } = parsePlayersCsv("name,team,price\nAva,9,8\nBen,2,cheap\nCal,3,7\ncal,4,6");
    expect(rows.map((r) => r.input?.name ?? null)).toEqual([null, null, "Cal", null]);
    expect(rows[0].problems[0]).toMatch(/1s–6s/);
    expect(rows[1].problems[0]).toMatch(/Price/);
    expect(rows[3].problems).toContain("Same name as line 4.");
  });

  it("explains missing columns and empty files", () => {
    expect(parsePlayersCsv("name,price\nAva,8").error).toMatch(/name, team and price/);
    expect(parsePlayersCsv("  \n").error).toMatch(/empty/);
  });
});

describe("squareCrop", () => {
  it("centres landscape photos", () => {
    expect(squareCrop(1600, 1000)).toEqual({ sx: 300, sy: 0, side: 1000 });
  });
  it("keeps the top of portrait photos (faces)", () => {
    expect(squareCrop(1000, 1500)).toEqual({ sx: 0, sy: 100, side: 1000 });
  });
});

describe("London datetime inputs", () => {
  it("round-trips across BST and GMT", () => {
    for (const iso of ["2026-10-20T20:00:00.000Z", "2026-10-27T21:00:00.000Z"]) {
      const value = toLondonInputValue(new Date(iso));
      expect(value).toMatch(/T21:00$/);
      expect(fromLondonInputValue(value)?.toISOString()).toBe(iso);
    }
    expect(toLondonDateInputValue(new Date("2026-10-19T23:30:00Z"))).toBe("2026-10-20");
  });
  it("rejects junk", () => {
    expect(fromLondonInputValue("")).toBeNull();
    expect(fromLondonInputValue("tomorrow")).toBeNull();
  });
});
