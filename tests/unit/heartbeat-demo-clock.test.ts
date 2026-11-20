import { describe, expect, it } from "vitest";
import {
  effectiveNow,
  formatIntervalForPg,
  isDemoMode,
  parseIntervalMs,
} from "@/lib/heartbeat/demo-clock";
import { DAY_MS } from "@/lib/heartbeat/cadence";

const real = new Date("2026-11-20T12:00:00Z");

describe("parseIntervalMs", () => {
  it.each([
    ["0 seconds", 0],
    ["00:00:00", 0],
    ["14 days", 14 * DAY_MS],
    ["1 day", DAY_MS],
    ["1 day 12:00:00", 1.5 * DAY_MS],
    ["336:00:00", 14 * DAY_MS],
    ["1209600 seconds", 14 * DAY_MS],
    ["2 hours 30 mins", 2.5 * 3_600_000],
    ["P14D", 14 * DAY_MS],
    ["PT336H", 14 * DAY_MS],
    ["-1 days -02:00:00", -DAY_MS - 2 * 3_600_000],
    ["garbage", 0],
    ["", 0],
  ])("parses %j", (input, expected) => {
    expect(parseIntervalMs(input)).toBe(expected);
  });

  it("handles null / undefined / numbers", () => {
    expect(parseIntervalMs(null)).toBe(0);
    expect(parseIntervalMs(undefined)).toBe(0);
    expect(parseIntervalMs(5000)).toBe(5000);
  });

  it("round-trips through the Postgres literal we write", () => {
    // We write "<n> seconds"; Postgres returns it as HH:MM:SS.
    expect(formatIntervalForPg(14 * DAY_MS)).toBe("1209600 seconds");
    expect(parseIntervalMs(formatIntervalForPg(14 * DAY_MS))).toBe(14 * DAY_MS);
    expect(parseIntervalMs("336:00:00")).toBe(14 * DAY_MS);
  });
});

describe("effectiveNow", () => {
  it("returns real time when demo mode is off, whatever the offset", () => {
    expect(effectiveNow({ demo_time_offset: "14 days" }, real, false)).toBe(real);
  });

  it("adds the offset in demo mode", () => {
    expect(effectiveNow({ demo_time_offset: "7 days" }, real, true).getTime()).toBe(
      real.getTime() + 7 * DAY_MS
    );
  });

  it("is a no-op for a zero / missing offset", () => {
    expect(effectiveNow({ demo_time_offset: "00:00:00" }, real, true)).toBe(real);
    expect(effectiveNow(null, real, true)).toBe(real);
  });

  it("never runs the clock backwards", () => {
    expect(effectiveNow({ demo_time_offset: "-3 days" }, real, true)).toBe(real);
  });
});

describe("isDemoMode", () => {
  it("is true only for the exact string 'true'", () => {
    expect(isDemoMode({ DEMO_MODE: "true" })).toBe(true);
    expect(isDemoMode({ DEMO_MODE: "false" })).toBe(false);
    expect(isDemoMode({ DEMO_MODE: "1" })).toBe(false);
    expect(isDemoMode({})).toBe(false);
  });
});
