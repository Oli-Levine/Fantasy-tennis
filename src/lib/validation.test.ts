import { describe, expect, it } from "vitest";
import { cleanName, validateDisplayName, validateTeamName } from "./validation";

describe("cleanName", () => {
  it("trims and collapses spaces", () => {
    expect(cleanName("  Net   Gains ")).toBe("Net Gains");
    expect(cleanName(null)).toBe("");
  });
});

describe("validateTeamName", () => {
  it("accepts 2–30 characters", () => {
    expect(validateTeamName("Ac")).toBeNull();
    expect(validateTeamName("x".repeat(30))).toBeNull();
  });
  it("rejects too short or long", () => {
    expect(validateTeamName("A")).toMatch(/at least 2/);
    expect(validateTeamName("x".repeat(31))).toMatch(/at most 30/);
  });
});

describe("validateDisplayName", () => {
  it("requires 1–40 characters", () => {
    expect(validateDisplayName("")).toMatch(/enter your name/);
    expect(validateDisplayName("Mo")).toBeNull();
    expect(validateDisplayName("x".repeat(41))).toMatch(/at most 40/);
  });
});
