/**
 * The heartbeat_settings guard trigger (20261121090200_heartbeat_state_guard.sql)
 * cannot run here (no live database), so its rule is mirrored in
 * lib/heartbeat/transition-rules.ts and checked against the pure state machine:
 * a signed-in owner may drive every transition the machine makes EXCEPT the one
 * into RELEASED, which only the privileged keeper-decision path may write.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { DAY_MS } from "@/lib/heartbeat/cadence";
import {
  HEARTBEAT_STATES,
  nextState,
  type HeartbeatEvent,
  type HeartbeatMachine,
  type HeartbeatState,
} from "@/lib/heartbeat/state-machine";
import { isLegalDbInsert, isLegalDbTransition } from "@/lib/heartbeat/transition-rules";

const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);

describe("isLegalDbTransition (mirror of heartbeat_settings_guard)", () => {
  const legalForOwner: [HeartbeatState, HeartbeatState][] = [
    ["ALIVE", "OVERDUE"],
    ["OVERDUE", "AWAITING_KEEPERS"],
    ["OVERDUE", "ALIVE"],
    ["AWAITING_KEEPERS", "ALIVE"],
  ];

  it("allows the demo-tick and check-in transitions for a normal owner", () => {
    for (const [from, to] of legalForOwner) {
      expect(isLegalDbTransition(from, to, false), `${from} -> ${to}`).toBe(true);
    }
  });

  it("never lets an owner write RELEASED, from any state", () => {
    for (const from of HEARTBEAT_STATES) {
      if (from === "RELEASED") continue;
      expect(isLegalDbTransition(from, "RELEASED", false), `${from} -> RELEASED`).toBe(false);
    }
  });

  it("lets only the privileged path release, and only from AWAITING_KEEPERS", () => {
    expect(isLegalDbTransition("AWAITING_KEEPERS", "RELEASED", true)).toBe(true);
    expect(isLegalDbTransition("ALIVE", "RELEASED", true)).toBe(false);
    expect(isLegalDbTransition("OVERDUE", "RELEASED", true)).toBe(false);
  });

  it("treats RELEASED as terminal for everyone", () => {
    for (const to of HEARTBEAT_STATES) {
      if (to === "RELEASED") continue;
      expect(isLegalDbTransition("RELEASED", to, true)).toBe(false);
      expect(isLegalDbTransition("RELEASED", to, false)).toBe(false);
    }
  });

  it("rejects skipping steps forward", () => {
    expect(isLegalDbTransition("ALIVE", "AWAITING_KEEPERS", false)).toBe(false);
    expect(isLegalDbTransition("ALIVE", "AWAITING_KEEPERS", true)).toBe(false);
  });

  it("allows same-state updates (cadence/grace edits)", () => {
    for (const s of HEARTBEAT_STATES) expect(isLegalDbTransition(s, s, false)).toBe(true);
  });

  it("new heartbeat rows must start ALIVE unless privileged", () => {
    expect(isLegalDbInsert("ALIVE", false)).toBe(true);
    expect(isLegalDbInsert("RELEASED", false)).toBe(false);
    expect(isLegalDbInsert("AWAITING_KEEPERS", false)).toBe(false);
    expect(isLegalDbInsert("RELEASED", true)).toBe(true);
  });
});

describe("PBT: the guard accepts everything the state machine does", () => {
  const events: fc.Arbitrary<HeartbeatEvent> = fc.oneof(
    fc.constant<HeartbeatEvent>({ type: "CHECK_IN" }),
    fc.constant<HeartbeatEvent>({ type: "TICK" }),
    fc.constantFrom("k1", "k2", "k3").map<HeartbeatEvent>((keeperId) => ({
      type: "KEEPER_CONFIRMED",
      keeperId,
    })),
    fc.constantFrom("k1", "k2").map<HeartbeatEvent>((keeperId) => ({ type: "FALSE_ALARM", keeperId }))
  );

  it("owner-driven transitions are legal; only entering RELEASED needs privilege", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(events, fc.integer({ min: 0, max: 20 * DAY_MS })), { minLength: 1, maxLength: 50 }),
        (steps) => {
          let m: HeartbeatMachine = {
            state: "ALIVE",
            nextCheckinDue: new Date(T0 + 7 * DAY_MS),
            lastCheckinAt: new Date(T0),
            cadenceDays: 7,
            graceDays: 7,
            timeZone: "UTC",
            requiredConfirmations: 2,
            confirmations: [],
            falseAlarmFlagged: false,
          };
          let clock = T0;
          for (const [event, advance] of steps) {
            clock += advance;
            const next = nextState(m, event, new Date(clock)).machine;
            const entersReleased = next.state === "RELEASED" && m.state !== "RELEASED";
            expect(isLegalDbTransition(m.state, next.state, true)).toBe(true);
            expect(isLegalDbTransition(m.state, next.state, false)).toBe(!entersReleased);
            m = next;
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
