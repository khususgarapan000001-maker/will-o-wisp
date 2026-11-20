import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeDb } from "../helpers/fake-supabase";
import { MemoryTickStore } from "../helpers/memory-store";
import {
  advanceDemoClock,
  recordCheckIn,
  loadHeartbeatView,
  updateCadenceAndGrace,
} from "@/lib/heartbeat/service";
import { processOwnerTick, type TickOwner } from "@/lib/heartbeat/tick";
import { createLogMailer } from "@/lib/heartbeat/mailer";
import { buildReminderForOwner } from "@/lib/heartbeat/reminder-builder";
import { DAY_MS } from "@/lib/heartbeat/cadence";
import { nextState } from "@/lib/heartbeat/state-machine";
import { machineFromRows } from "@/lib/heartbeat/rows";

const OWNER = "owner-1";
const DEMO_ENV = { DEMO_MODE: "true", DEMO_ACCOUNT_EMAIL: "demo@will-o-wisp.example" };
const user = { id: OWNER, email: "demo@will-o-wisp.example" };
const real = new Date("2026-11-20T03:00:00Z");

function seed(db: FakeDb, opts: { offset?: string } = {}) {
  db.tables.profiles.push({
    id: OWNER,
    display_name: "Demo Owner",
    timezone: "UTC",
    demo_time_offset: opts.offset ?? "00:00:00",
  });
  db.tables.heartbeat_settings.push({
    owner_id: OWNER,
    cadence_days: 7,
    grace_days: 7,
    reminder_days_before: [3, 1],
    next_checkin_due: new Date(real.getTime() + 7 * DAY_MS).toISOString(),
    state: "ALIVE",
    state_changed_at: real.toISOString(),
  });
}

describe("demo-clock lifecycle (service level, in-memory DB)", () => {
  let db: FakeDb;
  const originalDemoMode = process.env.DEMO_MODE;
  beforeEach(() => {
    db = new FakeDb();
    seed(db);
    // loadHeartbeatView reads DEMO_MODE from the process environment.
    process.env.DEMO_MODE = "true";
  });
  afterEach(() => {
    if (originalDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = originalDemoMode;
  });

  it("walks ALIVE → OVERDUE → AWAITING_KEEPERS and opens exactly one release", async () => {
    // +7 days: due date reached but not passed (strictly greater required).
    const r1 = await advanceDemoClock(db.client(), user, 7, DEMO_ENV, real);
    expect(r1).toMatchObject({ ok: true, after: "ALIVE" });

    // +1 day: due date passed → OVERDUE (grace not over).
    const r2 = await advanceDemoClock(db.client(), user, 1, DEMO_ENV, real);
    expect(r2).toMatchObject({ ok: true, after: "OVERDUE" });
    expect(db.tables.release_processes).toHaveLength(0);

    // +7 days more: grace (7d) over → AWAITING_KEEPERS in one call.
    const r3 = await advanceDemoClock(db.client(), user, 7, DEMO_ENV, real);
    expect(r3).toMatchObject({ ok: true, before: "OVERDUE", after: "AWAITING_KEEPERS" });
    expect(db.tables.release_processes).toHaveLength(1);
    expect(db.tables.release_processes[0]).toMatchObject({
      state: "awaiting_keepers",
      required_confirmations: 2,
    });

    // One call can also take a fresh owner all the way through.
    const state = db.tables.heartbeat_settings[0].state;
    expect(state).toBe("AWAITING_KEEPERS");
  });

  it("records reminder notifications and never duplicates them", async () => {
    await advanceDemoClock(db.client(), user, 5, DEMO_ENV, real); // 2 days before due -> 3d slot open
    const first = db.tables.notifications.map((n) => n.kind);
    expect(first).toContain("checkin_reminder_3d");
    await advanceDemoClock(db.client(), user, 1, DEMO_ENV, real); // 1d slot opens
    const kinds = db.tables.notifications.map((n) => n.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds).toEqual(expect.arrayContaining(["checkin_reminder_3d", "checkin_reminder_1d"]));
    // Logged (no provider) still counts as recorded.
    expect(db.tables.notifications.every((n) => n.sent_at !== null)).toBe(true);
  });

  it("check-in rescue from OVERDUE", async () => {
    await advanceDemoClock(db.client(), user, 8, DEMO_ENV, real);
    expect(db.tables.heartbeat_settings[0].state).toBe("OVERDUE");
    const res = await recordCheckIn(db.client(), OWNER, "button", null, real);
    expect(res).toMatchObject({ ok: true, previousState: "OVERDUE", state: "ALIVE", cancelledRelease: false });
    expect(db.tables.heartbeat_settings[0].state).toBe("ALIVE");
    expect(db.tables.checkins).toHaveLength(1);
    const view = await loadHeartbeatView(db.client(), OWNER, real);
    if (!view.ok) throw new Error("no view");
    // due = effective now (real + 8d) + 7d
    expect(view.view.machine.nextCheckinDue.getTime()).toBe(real.getTime() + 15 * DAY_MS);
  });

  it("check-in rescue from AWAITING_KEEPERS cancels the open release", async () => {
    await advanceDemoClock(db.client(), user, 15, DEMO_ENV, real); // due +7d, grace +7d: both passed
    expect(db.tables.heartbeat_settings[0].state).toBe("AWAITING_KEEPERS");
    const res = await recordCheckIn(db.client(), OWNER, "magic_link", "hash", real);
    expect(res).toMatchObject({ ok: true, previousState: "AWAITING_KEEPERS", cancelledRelease: true });
    expect(db.tables.release_processes[0]).toMatchObject({
      state: "cancelled_false_alarm",
      cancel_reason: "owner_checkin",
    });
    expect(db.tables.checkins[0]).toMatchObject({ method: "magic_link", ip_hash: "hash" });
    // And a later tick does not re-open it.
    const again = await advanceDemoClock(db.client(), user, 1, DEMO_ENV, real);
    expect(again).toMatchObject({ ok: true, after: "ALIVE" });
    expect(db.tables.release_processes.filter((r) => r.state === "awaiting_keepers")).toHaveLength(0);
  });

  it("refuses to set any offset when DEMO_MODE is off", async () => {
    const result = await advanceDemoClock(db.client(), user, 7, { DEMO_MODE: "false" }, real);
    expect(result).toEqual({ ok: false, reason: "demo_disabled" });
    expect(db.tables.profiles[0].demo_time_offset).toBe("00:00:00");
    const unset = await advanceDemoClock(db.client(), user, 7, {}, real);
    expect(unset).toEqual({ ok: false, reason: "demo_disabled" });
  });

  it("refuses non-demo accounts even when DEMO_MODE is on", async () => {
    const result = await advanceDemoClock(db.client(), { id: OWNER, email: "someone@else.com" }, 7, DEMO_ENV, real);
    expect(result).toEqual({ ok: false, reason: "not_demo_account" });
    expect(db.tables.profiles[0].demo_time_offset).toBe("00:00:00");
  });

  it("rejects out-of-range steps", async () => {
    for (const days of [0, -1, 1.5, 31, NaN]) {
      expect(await advanceDemoClock(db.client(), user, days, DEMO_ENV, real)).toEqual({
        ok: false,
        reason: "invalid_days",
      });
    }
  });

  it("a stray offset on a real account is inert when DEMO_MODE is off", async () => {
    const db2 = new FakeDb();
    seed(db2, { offset: "30 days" });
    const prev = process.env.DEMO_MODE;
    process.env.DEMO_MODE = "false";
    try {
      const view = await loadHeartbeatView(db2.client(), OWNER, real);
      if (!view.ok) throw new Error("no view");
      expect(view.view.now).toEqual(real);
      expect(view.view.demoOffsetMs).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.DEMO_MODE;
      else process.env.DEMO_MODE = prev;
    }
  });

  it("changing cadence recomputes the due date and never moves it earlier", async () => {
    // seed: due = real+7d, cadence 7 -> inferred last check-in = real.
    const longer = await updateCadenceAndGrace(db.client(), OWNER, 30, 14);
    expect(longer).toMatchObject({ ok: true });
    expect(new Date(String(db.tables.heartbeat_settings[0].next_checkin_due)).getTime()).toBe(
      real.getTime() + 30 * DAY_MS
    );
    await updateCadenceAndGrace(db.client(), OWNER, 7, 7);
    expect(new Date(String(db.tables.heartbeat_settings[0].next_checkin_due)).getTime()).toBe(
      real.getTime() + 30 * DAY_MS
    );
    expect(db.tables.heartbeat_settings[0]).toMatchObject({ cadence_days: 7, grace_days: 7 });
  });
});

describe("full lifecycle through the pure machine (demo offsets 7/14/30 days)", () => {
  it("reaches RELEASED only via two distinct keepers after grace, with the cron's one-step ticks", async () => {
    const store = new MemoryTickStore();
    let machine = machineFromRows({
      settings: {
        state: "ALIVE",
        next_checkin_due: new Date(real.getTime() + 7 * DAY_MS),
        cadence_days: 7,
        grace_days: 7,
      },
      timeZone: "UTC",
      lastCheckinAt: real,
    });
    const owner = (): TickOwner => ({
      ownerId: OWNER,
      email: "demo@will-o-wisp.example",
      displayName: "Demo",
      machine,
      reminderDaysBefore: [3, 1],
      demoTimeOffset: null,
    });
    const deps = {
      store,
      mailer: createLogMailer(() => undefined),
      buildEmail: async (o: TickOwner, r: Parameters<typeof buildReminderForOwner>[1]) =>
        buildReminderForOwner(o, r, "https://x/app/checkin"),
      demoMode: false,
    };
    const tickAt = async (days: number) => {
      await processOwnerTick(owner(), deps, new Date(real.getTime() + days * DAY_MS));
      machine = store.machines.get(OWNER) ?? machine;
    };

    await tickAt(8);
    expect(machine.state).toBe("OVERDUE");
    await tickAt(12);
    expect(machine.state).toBe("OVERDUE");
    await tickAt(15);
    expect(machine.state).toBe("AWAITING_KEEPERS");
    expect(store.releases).toHaveLength(1);

    const now = new Date(real.getTime() + 15 * DAY_MS);
    machine = nextState(machine, { type: "KEEPER_CONFIRMED", keeperId: "k1" }, now).machine;
    expect(machine.state).toBe("AWAITING_KEEPERS");
    machine = nextState(machine, { type: "KEEPER_CONFIRMED", keeperId: "k2" }, now).machine;
    expect(machine.state).toBe("RELEASED");
  });
});
