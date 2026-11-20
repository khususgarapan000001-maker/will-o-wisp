/**
 * Heartbeat cadence math — pure functions, no Date.now(), no DB.
 *
 * Calendar-day arithmetic is done in the owner's IANA time zone so "every 14
 * days" keeps the same wall-clock time across a DST change (e.g. a check-in due
 * at 09:00 stays due at 09:00 local). Everything is stored/returned as UTC
 * instants. `Asia/Jakarta` (the default) has no DST, so for it this is the same
 * as adding 24h × N.
 *
 * NOTE: imports in lib/heartbeat use explicit `.ts` extensions because the
 * heartbeat-tick Edge Function (Deno) imports these files directly.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

export const CADENCE_OPTIONS = [7, 14, 30] as const;
export const GRACE_OPTIONS = [7, 14, 30] as const;
export const DEFAULT_REMINDER_DAYS_BEFORE: readonly number[] = [3, 1];
/** Max delivery attempts per reminder before it is left for manual review. */
export const MAX_REMINDER_ATTEMPTS = 3;

/** Offset (local wall clock minus UTC) of `timeZone` at the instant `date`, in ms. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(date);
  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  const wholeSecondUtc = date.getTime() - (((date.getTime() % 1000) + 1000) % 1000);
  return asUtc - wholeSecondUtc;
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Adds `days` calendar days to `date` in `timeZone`, preserving the local wall
 * clock time. If the resulting wall time does not exist (spring-forward gap) the
 * instant is moved forward by the gap. Unknown time zones fall back to UTC.
 */
export function addCalendarDays(
  date: Date,
  days: number,
  timeZone: string = "UTC"
): Date {
  if (timeZone === "UTC" || !isValidTimeZone(timeZone)) {
    return new Date(date.getTime() + days * DAY_MS);
  }
  const offset = zoneOffsetMs(date, timeZone);
  const targetLocal = date.getTime() + offset + days * DAY_MS;
  const offset2 = zoneOffsetMs(new Date(targetLocal - offset), timeZone);
  let result = targetLocal - offset2;
  const offset3 = zoneOffsetMs(new Date(result), timeZone);
  if (offset3 !== offset2) {
    // Landed in a DST gap / ambiguous hour: use the offset that is valid at the result.
    result = targetLocal - offset3;
  }
  return new Date(result);
}

/** `last check-in + cadence_days` (calendar days in the owner's zone). */
export function computeNextDue(
  lastCheckin: Date,
  cadenceDays: number,
  timeZone: string = "UTC"
): Date {
  return addCalendarDays(lastCheckin, cadenceDays, timeZone);
}

/** The instant the grace period ends: `due + grace_days`. */
export function graceEndsAt(
  due: Date,
  graceDays: number,
  timeZone: string = "UTC"
): Date {
  return addCalendarDays(due, graceDays, timeZone);
}

/** Never moves a due date backwards (invariant 7). */
export function monotonicDue(current: Date, candidate: Date): Date {
  return candidate.getTime() > current.getTime() ? candidate : current;
}

/**
 * New due date after the owner changes cadence: recomputed from the last
 * check-in, but never earlier than the current due date. A shorter cadence
 * therefore takes effect from the next check-in.
 *
 * `lastCheckin` may be null (no check-in recorded yet): the previous cadence
 * is then used to infer it from the current due date.
 */
export function dueAfterCadenceChange(args: {
  currentDue: Date;
  lastCheckin: Date | null;
  oldCadenceDays: number;
  newCadenceDays: number;
  timeZone?: string;
}): Date {
  const tz = args.timeZone ?? "UTC";
  const last =
    args.lastCheckin ?? addCalendarDays(args.currentDue, -args.oldCadenceDays, tz);
  return monotonicDue(args.currentDue, computeNextDue(last, args.newCadenceDays, tz));
}

// ---------------------------------------------------------------------------
// Reminder schedule
// ---------------------------------------------------------------------------

/** The local calendar date (YYYY-MM-DD) of an instant in `timeZone`. */
export function localDateKey(date: Date, timeZone: string = "UTC"): string {
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export interface PlannedReminder {
  /** e.g. `checkin_reminder_3d` or `overdue_day_2`. Unique per (owner, kind, dueDate). */
  kind: string;
  /** The due date (local YYYY-MM-DD) the reminder belongs to. */
  dueDate: string;
  /** The instant the reminder became due. */
  scheduledFor: Date;
}

export interface ReminderPlanInput {
  state: "ALIVE" | "OVERDUE" | "AWAITING_KEEPERS" | "RELEASED";
  due: Date;
  graceDays: number;
  reminderDaysBefore: readonly number[];
  now: Date;
  timeZone?: string;
}

/**
 * Which reminder (at most one) should be going out right now.
 *
 * - ALIVE: the most imminent `reminder_days_before` slot that has opened and
 *   whose due date has not passed (a long cron outage never sends a backlog).
 * - OVERDUE: one nudge per day of the grace period (`overdue_day_<k>`).
 * - AWAITING_KEEPERS / RELEASED: none (keepers are handled by Spec 4).
 *
 * The result is a *plan*; idempotency comes from the `notifications` unique key
 * (owner, kind, dueDate) — see `decideClaim` in reminders.ts.
 */
export function planReminders(input: ReminderPlanInput): PlannedReminder[] {
  const tz = input.timeZone ?? "UTC";
  const dueDate = localDateKey(input.due, tz);

  if (input.state === "ALIVE") {
    if (input.now.getTime() > input.due.getTime()) return [];
    const opened = [...new Set(input.reminderDaysBefore)]
      .filter((n) => Number.isInteger(n) && n > 0)
      .map((n) => ({ n, at: addCalendarDays(input.due, -n, tz) }))
      .filter((slot) => slot.at.getTime() <= input.now.getTime())
      .sort((a, b) => a.n - b.n);
    const nearest = opened[0];
    return nearest
      ? [{ kind: `checkin_reminder_${nearest.n}d`, dueDate, scheduledFor: nearest.at }]
      : [];
  }

  if (input.state === "OVERDUE") {
    const elapsed = input.now.getTime() - input.due.getTime();
    if (elapsed <= 0) return [];
    const k = Math.min(Math.floor(elapsed / DAY_MS) + 1, Math.max(1, input.graceDays));
    return [
      {
        kind: `overdue_day_${k}`,
        dueDate,
        scheduledFor: new Date(input.due.getTime() + (k - 1) * DAY_MS),
      },
    ];
  }

  return [];
}
