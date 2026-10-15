import { describe, expect, it } from "vitest";
import { formatPrice, initials, ordinal, shortName } from "./format";
import { safeNextPath } from "./redirect";

describe("formatPrice", () => {
  it("formats £ millions to one decimal place", () => {
    expect(formatPrice(8.5)).toBe("£8.5m");
    expect(formatPrice(35)).toBe("£35.0m");
    expect(formatPrice(0)).toBe("£0.0m");
    expect(formatPrice(4.45)).toBe("£4.5m");
    expect(formatPrice(-0.5)).toBe("−£0.5m");
    expect(formatPrice(-0.04)).toBe("£0.0m");
  });
});

describe("initials", () => {
  it("uses first and last name", () => {
    expect(initials("Carlos Alcaraz")).toBe("CA");
    expect(initials("alex de minaur")).toBe("AM");
  });
  it("handles single names and blanks", () => {
    expect(initials("Ruud")).toBe("R");
    expect(initials("   ")).toBe("?");
  });
});

describe("shortName", () => {
  it("abbreviates the first name like the reference design", () => {
    expect(shortName("Carlos Alcaraz")).toBe("C.Alcaraz");
    expect(shortName("Alex De Minaur")).toBe("A.De Minaur");
    expect(shortName("Ruud")).toBe("Ruud");
  });
});

describe("ordinal", () => {
  it("adds the right suffix", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th",
    ]);
  });
});

describe("safeNextPath", () => {
  it("allows same-site paths", () => {
    expect(safeNextPath("/team")).toBe("/team");
    expect(safeNextPath("/league?gw=3")).toBe("/league?gw=3");
  });
  it("rejects anything that could leave the site", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
  });
});
