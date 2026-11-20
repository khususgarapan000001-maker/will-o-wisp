import { describe, expect, it } from "vitest";
import { nextState, type HeartbeatMachine } from "@/lib/heartbeat/state-machine";
import { DAY_MS } from "@/lib/heartbeat/cadence";

const t0 = new Date("2026-11-20T00:00:00Z");
const at = (days: number) => new Date(t0.getTime() + days * DAY_MS);

function machine(over: Partial<HeartbeatMachine> = {}): HeartbeatMachine {
  return {
    state: "ALIVE",
    nextCheckinDue: at(14),
    lastCheckinAt: t0,
    cadenceDays: 14,
    graceDays: 7,
    timeZone: "UTC",
    requiredConfirmations: 2,
    confirmations: [],
    falseAlarmFlagged: false,
    ...over,
  };
}

describe("nextState", () => {
  it("stays ALIVE up to and including the due instant", () => {
    expect(nextState(machine(), { type: "TICK" }, at(14)).changed).toBe(false);
  });

  it("ALIVE → OVERDUE strictly after the due date", () => {
    const t = nextState(machine(), { type: "TICK" }, new Date(at(14).getTime() + 1));
    expect(t.machine.state).toBe("OVERDUE");
    expect(t.effects).toEqual([]);
  });

  it("OVERDUE → AWAITING_KEEPERS only after the grace period, opening a release", () => {
    const m = machine({ state: "OVERDUE" });
    expect(nextState(m, { type: "TICK" }, at(21)).changed).toBe(false);
    const t = nextState(m, { type: "TICK" }, new Date(at(21).getTime() + 1));
    expect(t.machine.state).toBe("AWAITING_KEEPERS");
    expect(t.effects).toEqual([{ type: "OPEN_RELEASE" }]);
  });

  it("ignores GRACE_EXPIRED when the grace period has not actually ended", () => {
    expect(nextState(machine({ state: "OVERDUE" }), { type: "GRACE_EXPIRED" }, at(15)).changed).toBe(false);
    expect(nextState(machine(), { type: "GRACE_EXPIRED" }, at(99)).changed).toBe(false);
  });

  it("one tick moves one step (so the owner always sees OVERDUE first)", () => {
    const t = nextState(machine(), { type: "TICK" }, at(100));
    expect(t.machine.state).toBe("OVERDUE");
  });

  it("releases only on the second distinct keeper confirmation", () => {
    let m = machine({ state: "AWAITING_KEEPERS" });
    const now = at(30);
    m = nextState(m, { type: "KEEPER_CONFIRMED", keeperId: "a" }, now).machine;
    expect(m.state).toBe("AWAITING_KEEPERS");
    // Same keeper again: no change.
    const dup = nextState(m, { type: "KEEPER_CONFIRMED", keeperId: "a" }, now);
    expect(dup.changed).toBe(false);
    const t = nextState(m, { type: "KEEPER_CONFIRMED", keeperId: "b" }, now);
    expect(t.machine.state).toBe("RELEASED");
    expect(t.effects).toEqual([{ type: "MARK_RELEASED" }]);
  });

  it("does not release when a false alarm is flagged", () => {
    const m = machine({ state: "AWAITING_KEEPERS", confirmations: ["a"], falseAlarmFlagged: true });
    expect(nextState(m, { type: "KEEPER_CONFIRMED", keeperId: "b" }, at(30)).machine.state).toBe(
      "AWAITING_KEEPERS"
    );
  });

  it("ignores confirmations outside AWAITING_KEEPERS", () => {
    expect(nextState(machine(), { type: "KEEPER_CONFIRMED", keeperId: "a" }, at(30)).changed).toBe(false);
    expect(
      nextState(machine({ state: "OVERDUE" }), { type: "KEEPER_CONFIRMED", keeperId: "a" }, at(30)).changed
    ).toBe(false);
  });

  it("a keeper false alarm returns to ALIVE with a fresh due date and cancels the release", () => {
    const m = machine({ state: "AWAITING_KEEPERS", confirmations: ["a"] });
    const now = at(30);
    const t = nextState(m, { type: "FALSE_ALARM", keeperId: "b" }, now);
    expect(t.machine.state).toBe("ALIVE");
    expect(t.machine.confirmations).toEqual([]);
    expect(t.machine.nextCheckinDue.getTime()).toBe(now.getTime() + 14 * DAY_MS);
    expect(t.effects).toContainEqual({ type: "CANCEL_RELEASE", reason: "keeper_false_alarm" });
  });

  it("an owner check-in rescues OVERDUE and AWAITING_KEEPERS", () => {
    for (const state of ["OVERDUE", "AWAITING_KEEPERS"] as const) {
      const t = nextState(machine({ state }), { type: "CHECK_IN" }, at(25));
      expect(t.machine.state).toBe("ALIVE");
      expect(t.machine.nextCheckinDue.getTime()).toBe(at(25).getTime() + 14 * DAY_MS);
      expect(t.effects.some((e) => e.type === "CANCEL_RELEASE")).toBe(state === "AWAITING_KEEPERS");
    }
  });

  it("RELEASED is terminal for every event", () => {
    const m = machine({ state: "RELEASED", confirmations: ["a", "b"] });
    for (const e of [
      { type: "CHECK_IN" },
      { type: "TICK" },
      { type: "GRACE_EXPIRED" },
      { type: "KEEPER_CONFIRMED", keeperId: "c" },
      { type: "FALSE_ALARM", keeperId: "c" },
    ] as const) {
      const t = nextState(m, e, at(500));
      expect(t.machine).toBe(m);
      expect(t.changed).toBe(false);
    }
  });

  it("does not mutate its input", () => {
    const m = machine({ state: "AWAITING_KEEPERS" });
    const snapshot = JSON.stringify(m);
    nextState(m, { type: "KEEPER_CONFIRMED", keeperId: "a" }, at(30));
    expect(JSON.stringify(m)).toBe(snapshot);
  });
});
