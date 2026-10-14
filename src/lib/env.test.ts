import { describe, expect, it } from "vitest";
import { normaliseSupabaseUrl } from "./env";

describe("normaliseSupabaseUrl", () => {
  it("strips whitespace, trailing slashes and /rest/v1", () => {
    const base = "https://abc.supabase.co";
    expect(normaliseSupabaseUrl(base)).toBe(base);
    expect(normaliseSupabaseUrl(` ${base}/ `)).toBe(base);
    expect(normaliseSupabaseUrl(`${base}/rest/v1/`)).toBe(base);
    expect(normaliseSupabaseUrl(`${base}/rest/v1`)).toBe(base);
  });
  it("treats blank as missing", () => {
    expect(normaliseSupabaseUrl(undefined)).toBeUndefined();
    expect(normaliseSupabaseUrl("   ")).toBeUndefined();
  });
});
