import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  addCalendarDays,
  computeNextDue,
  dueAfterCadenceChange,
  graceEndsAt,
  localDateKey,
  planReminders,
} from "@/lib/heartbeat/cadence";

const d = (iso: string) => new Date(iso);

describe("cadence math", () => {
  it("adds cadence_days in UTC", () => {
    expect(computeNextDue(d("2026-11-20T09:00:00Z"), 14).toISOString()).toBe(
      "2026-12-04T09:00:00.000Z"
    );
  });

  it("is a plain 24h×N shift for zones without DST (Asia/Jakarta)", () => {
    const last = d("2026-11-20T02:00:00Z");
    expect(computeNextDue(last, 7, "Asia/Jakarta").getTime()).toBe(last.getTime() + 7 * DAY_MS);
  });

  it("computes the end of the grace period from the due date", () => {
    const due = d("2026-12-04T09:00:00Z");
    expect(graceEndsAt(due, 14).toISOString()).toBe("2026-12-18T09:00:00.000Z");
  });

  it("falls back to UTC for an unknown time zone", () => {
    const last = d("2026-11-20T09:00:00Z");
    expect(computeNextDue(last, 7, "Not/AZone").getTime()).toBe(last.getTime() + 7 * DAY_MS);
  });
});

describe("DST boundaries (America/New_York)", () => {
  const tz = "America/New_York";

  it("keeps 09:00 local across spring-forward (2026-03-08)", () => {
    // 09:00 EST on 1 March = 14:00Z; 14 days later is 09:00 EDT = 13:00Z.
    const next = computeNextDue(d("2026-03-01T14:00:00Z"), 14, tz);
    expect(next.toISOString()).toBe("2026-03-15T13:00:00.000Z");
  });

  it("keeps 09:00 local across fall-back (2026-11-01)", () => {
    // 09:00 EDT on 25 Oct = 13:00Z; 14 days later is 09:00 EST = 14:00Z.
    const next = computeNextDue(d("2026-10-25T13:00:00Z"), 14, tz);
    expect(next.toISOString()).toBe("2026-11-08T14:00:00.000Z");
  });

  it("moves a nonexistent wall time (02:30 in the spring gap) forward, never back", () => {
    // 02:30 EST on 7 March = 07:30Z. +1 day would be 02:30 on the 8th, which
    // does not exist; the result must be 03:30 EDT = 07:30Z.
    const last = d("2026-03-07T07:30:00Z");
    const next = addCalendarDays(last, 1, tz);
    expect(next.toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(next.getTime()).toBeGreaterThan(last.getTime());
  });

  it("works for Europe/London across the March change", () => {
    const next = computeNextDue(d("2026-03-20T09:00:00Z"), 14, "Europe/London");
    // BST starts 29 March: 09:00 GMT -> 09:00 BST = 08:00Z.
    expect(next.toISOString()).toBe("2026-04-03T08:00:00.000Z");
  });

  it("never returns an earlier instant for positive day counts", () => {
    const start = d("2026-03-06T00:00:00Z");
    for (let h = 0; h < 24 * 5; h++) {
      const t = new Date(start.getTime() + h * 3_600_000);
      expect(addCalendarDays(t, 7, tz).getTime()).toBeGreaterThan(t.getTime());
    }
  });
});

describe("cadence change", () => {
  const base = {
    currentDue: d("2026-12-04T09:00:00Z"),
    lastCheckin: d("2026-11-20T09:00:00Z"),
    oldCadenceDays: 14,
  };

  it("moves the due date later when the cadence grows", () => {
    const due = dueAfterCadenceChange({ ...base, newCadenceDays: 30 });
    expect(due.toISOString()).toBe("2026-12-20T09:00:00.000Z");
  });

  it("never moves the due date backwards when the cadence shrinks", () => {
    const due = dueAfterCadenceChange({ ...base, newCadenceDays: 7 });
    expect(due.toISOString()).toBe(base.currentDue.toISOString());
  });

  it("infers the last check-in from the due date when there is no history", () => {
    const due = dueAfterCadenceChange({
      currentDue: d("2026-12-04T09:00:00Z"),
      lastCheckin: null,
      oldCadenceDays: 14,
      newCadenceDays: 30,
    });
    expect(due.toISOString()).toBe("2026-12-20T09:00:00.000Z");
  });
});

describe("reminder schedule", () => {
  const due = d("2026-12-04T09:00:00Z");
  const common = { due, graceDays: 14, reminderDaysBefore: [3, 1], timeZone: "UTC" } as const;

  it("plans nothing earlier than the 3-day mark", () => {
    expect(planReminders({ ...common, state: "ALIVE", now: d("2026-11-30T08:00:00Z") })).toEqual([]);
  });

  it("plans the 3-day reminder inside its window", () => {
    const [r] = planReminders({ ...common, state: "ALIVE", now: d("2026-12-01T09:00:00Z") });
    expect(r.kind).toBe("checkin_reminder_3d");
    expect(r.dueDate).toBe("2026-12-04");
  });

  it("plans only the nearest slot after an outage (no backlog)", () => {
    const plan = planReminders({ ...common, state: "ALIVE", now: d("2026-12-03T12:00:00Z") });
    expect(plan.map((p) => p.kind)).toEqual(["checkin_reminder_1d"]);
  });

  it("plans nothing once the due date has passed while still ALIVE", () => {
    expect(planReminders({ ...common, state: "ALIVE", now: d("2026-12-04T10:00:00Z") })).toEqual([]);
  });

  it("plans one nudge per day while OVERDUE, capped at grace_days", () => {
    const day1 = planReminders({ ...common, state: "OVERDUE", now: d("2026-12-04T10:00:00Z") });
    const day3 = planReminders({ ...common, state: "OVERDUE", now: d("2026-12-06T10:00:00Z") });
    const late = planReminders({ ...common, graceDays: 7, state: "OVERDUE", now: d("2027-01-30T10:00:00Z") });
    expect(day1[0].kind).toBe("overdue_day_1");
    expect(day3[0].kind).toBe("overdue_day_3");
    expect(late[0].kind).toBe("overdue_day_7");
  });

  it("plans nothing for AWAITING_KEEPERS or RELEASED", () => {
    const now = d("2026-12-30T10:00:00Z");
    expect(planReminders({ ...common, state: "AWAITING_KEEPERS", now })).toEqual([]);
    expect(planReminders({ ...common, state: "RELEASED", now })).toEqual([]);
  });

  it("keys the due date by the owner's local calendar day", () => {
    // 20:00Z on 3 Dec is already 4 Dec in Jakarta (UTC+7).
    expect(localDateKey(d("2026-12-03T20:00:00Z"), "Asia/Jakarta")).toBe("2026-12-04");
    expect(localDateKey(d("2026-12-03T20:00:00Z"), "UTC")).toBe("2026-12-03");
  });
});
