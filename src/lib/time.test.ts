import { describe, expect, it } from "vitest";
import { formatCountdown, formatLondonDateTime, nextDeadline } from "./time";

const at = (iso: string) => new Date(iso);

describe("nextDeadline (Tuesday 21:00 UK time)", () => {
  it("finds the coming Tuesday during BST (21:00 BST = 20:00 UTC)", () => {
    expect(nextDeadline(at("2026-10-14T12:00:00Z")).toISOString()).toBe("2026-10-20T20:00:00.000Z");
  });

  it("stays at 21:00 UK time when the clocks go back in October (BST → GMT)", () => {
    // Clocks go back on Sun 25 Oct 2026, so Tue 27 Oct 21:00 is GMT.
    expect(nextDeadline(at("2026-10-24T12:00:00Z")).toISOString()).toBe("2026-10-27T21:00:00.000Z");
  });

  it("stays at 21:00 UK time when the clocks go forward in March (GMT → BST)", () => {
    // Clocks go forward on Sun 28 Mar 2027; this 'now' is after Tue 23 Mar's deadline.
    expect(nextDeadline(at("2027-03-23T21:30:00Z")).toISOString()).toBe("2027-03-30T20:00:00.000Z");
  });

  it("returns today's deadline on a Tuesday before 21:00", () => {
    expect(nextDeadline(at("2026-10-20T19:59:00Z")).toISOString()).toBe("2026-10-20T20:00:00.000Z");
  });

  it("rolls to next week exactly at the deadline", () => {
    expect(nextDeadline(at("2026-10-20T20:00:00Z")).toISOString()).toBe("2026-10-27T21:00:00.000Z");
  });

  it("rolls to next week just after the deadline", () => {
    expect(nextDeadline(at("2026-10-20T20:00:01Z")).toISOString()).toBe("2026-10-27T21:00:00.000Z");
  });

  it("uses the UK date, not the UTC date, around midnight", () => {
    // Mon 19 Oct 23:30 UTC is already Tue 00:30 in London.
    expect(nextDeadline(at("2026-10-19T23:30:00Z")).toISOString()).toBe("2026-10-20T20:00:00.000Z");
  });

  it("crosses month and year boundaries", () => {
    expect(nextDeadline(at("2026-12-30T10:00:00Z")).toISOString()).toBe("2027-01-05T21:00:00.000Z");
  });
});

describe("formatCountdown", () => {
  const s = 1000;
  const m = 60 * s;
  const h = 60 * m;
  const d = 24 * h;

  it("shows days and hours when more than a day away", () => {
    expect(formatCountdown(2 * d + 16 * h + 5 * m)).toBe("2d 16h");
  });
  it("shows hours and minutes when under a day", () => {
    expect(formatCountdown(5 * h + 12 * m + 40 * s)).toBe("5h 12m");
  });
  it("shows minutes and seconds when under an hour", () => {
    expect(formatCountdown(12 * m + 30 * s)).toBe("12m 30s");
  });
  it("shows seconds at the end and never goes negative", () => {
    expect(formatCountdown(9 * s + 999)).toBe("9s");
    expect(formatCountdown(-5000)).toBe("0s");
  });
});

describe("formatLondonDateTime", () => {
  it("formats in UK local time", () => {
    expect(formatLondonDateTime(at("2026-10-20T20:00:00Z"))).toBe("Tue 20 Oct, 21:00");
    expect(formatLondonDateTime(at("2026-10-27T21:00:00Z"))).toBe("Tue 27 Oct, 21:00");
  });
});
