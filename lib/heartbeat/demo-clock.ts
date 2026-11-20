/**
 * Demo clock (design-doc §6.4). The ONLY place a time offset is applied.
 *
 * `profiles.demo_time_offset` is a Postgres interval. It is honoured only when
 * demo mode is on; otherwise `effectiveNow` returns the real time. Offsets are
 * never negative (the demo clock only runs forward).
 */

import { DAY_MS } from "./cadence.ts";

export interface DemoClockProfile {
  /** Raw `demo_time_offset` value (Postgres interval text, ISO 8601, or ms). */
  demo_time_offset?: string | number | null;
}

const PG_UNIT_MS: Record<string, number> = {
  year: 365 * DAY_MS,
  mon: 30 * DAY_MS,
  day: DAY_MS,
};

/**
 * Parses a Postgres interval (default `postgres` style, e.g. "14 days",
 * "1 day 02:30:00", "336:00:00", "-1 days -02:00:00") or ISO 8601 ("P14D",
 * "PT336H") into milliseconds. Unparseable input yields 0.
 */
export function parseIntervalMs(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = value.trim();
  if (text === "") return 0;

  const iso = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
    text
  );
  if (iso) {
    const [, y, mo, d, h, mi, s] = iso.map((x) => (x === undefined ? 0 : Number(x)));
    return (
      y * PG_UNIT_MS.year +
      mo * PG_UNIT_MS.mon +
      d * DAY_MS +
      h * 3_600_000 +
      mi * 60_000 +
      s * 1000
    );
  }

  let total = 0;
  const unitRe = /([+-]?\d+)\s*(years?|mons?|days?)/g;
  for (const m of text.matchAll(unitRe)) {
    const unit = m[2].replace(/s$/, "");
    total += Number(m[1]) * PG_UNIT_MS[unit === "year" ? "year" : unit === "mon" ? "mon" : "day"];
  }
  // Also accept the literal we write ("1209600 seconds") and hour/minute forms.
  const smallRe = /([+-]?\d+(?:\.\d+)?)\s*(hours?|minutes?|mins?|seconds?|secs?)/g;
  for (const m of text.matchAll(smallRe)) {
    const unit = m[2][0] === "h" ? 3_600_000 : m[2].startsWith("m") ? 60_000 : 1000;
    total += Number(m[1]) * unit;
  }
  const rest = text.replace(unitRe, "").replace(smallRe, "").trim();
  const time = /^([+-]?)(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(rest);
  if (time) {
    const sign = time[1] === "-" ? -1 : 1;
    total +=
      sign *
      (Number(time[2]) * 3_600_000 + Number(time[3]) * 60_000 + Number(time[4]) * 1000);
  }
  return Number.isFinite(total) ? total : 0;
}

/** Formats milliseconds as a Postgres interval literal ("1209600 seconds"). */
export function formatIntervalForPg(ms: number): string {
  return `${Math.max(0, Math.round(ms / 1000))} seconds`;
}

/**
 * `now + demo_time_offset` for demo accounts, real `now` for everyone else.
 *
 * @param demoMode whether DEMO_MODE is enabled in this runtime. When false the
 *                 offset is ignored entirely, so a stray offset on a real
 *                 account is inert.
 */
export function effectiveNow(
  profile: DemoClockProfile | null | undefined,
  realNow: Date,
  demoMode: boolean
): Date {
  if (!demoMode) return realNow;
  const offset = Math.max(0, parseIntervalMs(profile?.demo_time_offset));
  return offset === 0 ? realNow : new Date(realNow.getTime() + offset);
}

/** True when DEMO_MODE is enabled in the given environment. */
export function isDemoMode(env: Record<string, string | undefined>): boolean {
  return env.DEMO_MODE === "true";
}

/** Demo clock steps offered in the UI. */
export const DEMO_ADVANCE_DAYS = [1, 7, 14] as const;
