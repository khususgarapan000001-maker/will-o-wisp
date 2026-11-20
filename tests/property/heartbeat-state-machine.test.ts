/**
 * Property-based tests for the heartbeat state machine (design-doc §9.1).
 * Random event sequences are replayed against the pure machine and the
 * invariants are asserted after EVERY event, against an independent model.
 * ≥100 iterations locally, ≥1,000 in CI.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  DAY_MS,
  graceEndsAt,
  planReminders,
} from "@/lib/heartbeat/cadence";
import {
  nextState,
  type HeartbeatEvent,
  type HeartbeatMachine,
  type HeartbeatState,
} from "@/lib/heartbeat/state-machine";
import { processOwnerTick, type TickOwner } from "@/lib/heartbeat/tick";
import { applyKeeperDecision } from "@/lib/keepers/decision";
import type { Mailer } from "@/lib/heartbeat/mailer";
import { buildReminderForOwner } from "@/lib/heartbeat/reminder-builder";
import { MemoryTickStore } from "../helpers/memory-store";

const NUM_RUNS = process.env.CI ? 1000 : 200;
const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);
const KEEPERS = ["k1", "k2", "k3", "k4"] as const;
const ZONES = ["UTC", "Asia/Jakarta", "America/New_York", "Europe/London"] as const;
const OPTIONS = [7, 14, 30] as const;

const eventArb: fc.Arbitrary<HeartbeatEvent> = fc.oneof(
  { weight: 2, arbitrary: fc.constant<HeartbeatEvent>({ type: "CHECK_IN" }) },
  { weight: 5, arbitrary: fc.constant<HeartbeatEvent>({ type: "TICK" }) },
  { weight: 1, arbitrary: fc.constant<HeartbeatEvent>({ type: "GRACE_EXPIRED" }) },
  {
    weight: 4,
    arbitrary: fc.constantFrom(...KEEPERS).map<HeartbeatEvent>((keeperId) => ({
      type: "KEEPER_CONFIRMED",
      keeperId,
    })),
  },
  {
    weight: 1,
    arbitrary: fc.constantFrom(...KEEPERS).map<HeartbeatEvent>((keeperId) => ({
      type: "FALSE_ALARM",
      keeperId,
    })),
  }
);

const stepArb = fc.record({
  event: eventArb,
  // Time only moves forward; up to 20 days per step, sometimes zero.
  advanceMs: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 20 * DAY_MS })),
});

const initialArb = fc.record({
  cadenceDays: fc.constantFrom(...OPTIONS),
  graceDays: fc.constantFrom(...OPTIONS),
  timeZone: fc.constantFrom(...ZONES),
});

const sequenceArb = fc.tuple(initialArb, fc.array(stepArb, { minLength: 1, maxLength: 60 }));

function initial(cfg: {
  cadenceDays: number;
  graceDays: number;
  timeZone: string;
}): HeartbeatMachine {
  return {
    state: "ALIVE",
    nextCheckinDue: new Date(T0 + cfg.cadenceDays * DAY_MS),
    lastCheckinAt: new Date(T0),
    cadenceDays: cfg.cadenceDays,
    graceDays: cfg.graceDays,
    timeZone: cfg.timeZone,
    requiredConfirmations: 2,
    confirmations: [],
    falseAlarmFlagged: false,
  };
}

const ALLOWED: Record<HeartbeatState, readonly HeartbeatState[]> = {
  ALIVE: ["ALIVE", "OVERDUE"],
  OVERDUE: ["OVERDUE", "ALIVE", "AWAITING_KEEPERS"],
  AWAITING_KEEPERS: ["AWAITING_KEEPERS", "ALIVE", "RELEASED"],
  RELEASED: ["RELEASED"],
};

describe("PBT: heartbeat state machine", () => {
  it("replays random sequences, asserting every invariant after every event", () => {
    fc.assert(
      fc.property(sequenceArb, ([cfg, steps]) => {
        let m = initial(cfg);
        let clock = T0;
        // Independent model of "who confirmed the current release process".
        let modelConfirmed = new Set<string>();

        for (const { event, advanceMs } of steps) {
          clock += advanceMs;
          const now = new Date(clock);
          const prev = m;
          const before = JSON.stringify(prev);
          const t = nextState(prev, event, now);
          const next = t.machine;

          // Model bookkeeping, derived from the events only.
          if (next.state !== "AWAITING_KEEPERS") {
            // Left (or never in) a release process: keeper decisions reset.
            if (prev.state === "AWAITING_KEEPERS" && next.state === "RELEASED" &&
                event.type === "KEEPER_CONFIRMED") {
              modelConfirmed.add(event.keeperId);
            } else {
              modelConfirmed = new Set();
            }
          } else if (prev.state !== "AWAITING_KEEPERS") {
            modelConfirmed = new Set();
          } else if (event.type === "KEEPER_CONFIRMED") {
            modelConfirmed.add(event.keeperId);
          }

          // Legal edges only.
          expect(ALLOWED[prev.state]).toContain(next.state);

          // Inv. 6: terminal — nothing at all changes after RELEASED.
          if (prev.state === "RELEASED") {
            expect(next).toBe(prev);
            expect(t.changed).toBe(false);
          }

          // Inv. 7 / property 4: due date never decreases.
          expect(next.nextCheckinDue.getTime()).toBeGreaterThanOrEqual(
            prev.nextCheckinDue.getTime()
          );

          // Inv. 1: OVERDUE only after the due date.
          if (prev.state === "ALIVE" && next.state === "OVERDUE") {
            expect(now.getTime()).toBeGreaterThan(prev.nextCheckinDue.getTime());
          }
          // Inv. 2: AWAITING only after due + grace.
          if (prev.state === "OVERDUE" && next.state === "AWAITING_KEEPERS") {
            expect(now.getTime()).toBeGreaterThan(
              graceEndsAt(prev.nextCheckinDue, prev.graceDays, prev.timeZone).getTime()
            );
            expect(t.effects).toContainEqual({ type: "OPEN_RELEASE" });
          }

          // Property 1 / Inv. 3: no premature release.
          if (next.state === "RELEASED" && prev.state !== "RELEASED") {
            expect(prev.state).toBe("AWAITING_KEEPERS");
            expect(new Set(next.confirmations).size).toBeGreaterThanOrEqual(2);
            expect(modelConfirmed.size).toBeGreaterThanOrEqual(2);
            expect(next.falseAlarmFlagged).toBe(false);
            expect(now.getTime()).toBeGreaterThan(
              graceEndsAt(next.nextCheckinDue, next.graceDays, next.timeZone).getTime()
            );
          }

          // Property 2 / Inv. 5: check-in always rescues (any non-terminal state).
          if (event.type === "CHECK_IN" && prev.state !== "RELEASED") {
            expect(next.state).toBe("ALIVE");
            expect(next.confirmations).toEqual([]);
            expect(next.nextCheckinDue.getTime()).toBeGreaterThanOrEqual(now.getTime());
            expect(t.effects.some((e) => e.type === "CANCEL_RELEASE")).toBe(
              prev.state === "AWAITING_KEEPERS"
            );
          }

          // Property 3 / Inv. 4: a single false alarm cancels an open release.
          if (event.type === "FALSE_ALARM" && prev.state === "AWAITING_KEEPERS") {
            expect(next.state).toBe("ALIVE");
            expect(t.effects).toContainEqual({
              type: "CANCEL_RELEASE",
              reason: "keeper_false_alarm",
            });
            expect(next.nextCheckinDue.getTime()).toBeGreaterThan(now.getTime());
          }

          // Property 6: no duplicate confirmations, ever.
          expect(new Set(next.confirmations).size).toBe(next.confirmations.length);

          // Confirmations exist only inside a release process (or its end).
          if (next.state === "ALIVE" || next.state === "OVERDUE") {
            expect(next.confirmations).toEqual([]);
          }

          // Purity: the input was not mutated.
          expect(JSON.stringify(prev)).toBe(before);

          m = next;
        }
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it("property 1: without two distinct keepers, RELEASED is unreachable", () => {
    // Only one keeper ever speaks, however often and whenever.
    const lonely = fc.tuple(
      initialArb,
      fc.array(
        fc.record({
          event: fc.oneof(
            fc.constant<HeartbeatEvent>({ type: "TICK" }),
            fc.constant<HeartbeatEvent>({ type: "CHECK_IN" }),
            fc.constant<HeartbeatEvent>({ type: "GRACE_EXPIRED" }),
            fc.constant<HeartbeatEvent>({ type: "KEEPER_CONFIRMED", keeperId: "solo" })
          ),
          advanceMs: fc.integer({ min: 0, max: 40 * DAY_MS }),
        }),
        { minLength: 1, maxLength: 80 }
      )
    );
    fc.assert(
      fc.property(lonely, ([cfg, steps]) => {
        let m = initial(cfg);
        let clock = T0;
        for (const { event, advanceMs } of steps) {
          clock += advanceMs;
          m = nextState(m, event, new Date(clock)).machine;
          expect(m.state).not.toBe("RELEASED");
        }
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it("property 1 (positive): enough ticks + two keepers after grace does release", () => {
    fc.assert(
      fc.property(initialArb, fc.constantFrom(...KEEPERS), fc.constantFrom(...KEEPERS), (cfg, a, b) => {
        fc.pre(a !== b);
        let m = initial(cfg);
        const farFuture = new Date(T0 + (cfg.cadenceDays + cfg.graceDays + 2) * DAY_MS);
        m = nextState(m, { type: "TICK" }, farFuture).machine; // OVERDUE
        m = nextState(m, { type: "TICK" }, farFuture).machine; // AWAITING
        expect(m.state).toBe("AWAITING_KEEPERS");
        m = nextState(m, { type: "KEEPER_CONFIRMED", keeperId: a }, farFuture).machine;
        m = nextState(m, { type: "KEEPER_CONFIRMED", keeperId: b }, farFuture).machine;
        expect(m.state).toBe("RELEASED");
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

describe("PBT: keeper decisions (Spec 4)", () => {
  const decisionArb = fc.record({
    keeperId: fc.constantFrom(...KEEPERS),
    decision: fc.constantFrom<"confirm" | "false_alarm">("confirm", "confirm", "confirm", "false_alarm"),
  });

  /** A machine that has just opened a release (after grace). */
  function awaitingMachine(cfg: { cadenceDays: number; graceDays: number; timeZone: string }) {
    const m = initial(cfg);
    const afterGrace = new Date(T0 + (cfg.cadenceDays + cfg.graceDays + 2) * DAY_MS);
    const overdue = nextState(m, { type: "TICK" }, afterGrace).machine;
    const open = nextState(overdue, { type: "TICK" }, afterGrace).machine;
    expect(open.state).toBe("AWAITING_KEEPERS");
    return { open, afterGrace };
  }

  it("no release without 2 distinct confirms; a false alarm always cancels", () => {
    fc.assert(
      fc.property(initialArb, fc.array(decisionArb, { minLength: 1, maxLength: 30 }), (cfg, decisions) => {
        const { open, afterGrace } = awaitingMachine(cfg);
        let m = open;
        // Independent model of the persisted rows: one decision per keeper (the
        // unique (release_id, keeper_id) constraint), release at >= 2 confirms,
        // a false alarm closes the release.
        const decided = new Map<string, "confirm" | "false_alarm">();
        let modelState: "open" | "released" | "cancelled" = "open";

        for (const { keeperId, decision } of decisions) {
          const prev = m;
          // The persistence layer (unique (release_id, keeper_id) + the release
          // row lock) only forwards a decision to the machine if it is the
          // keeper's first on a still-open release; anything else is rejected
          // as "already_decided" / "not_open" and never reaches the machine.
          const accepted = modelState === "open" && !decided.has(keeperId);
          if (!accepted) continue;
          decided.set(keeperId, decision);
          if (decision === "false_alarm") modelState = "cancelled";
          else if ([...decided.values()].filter((d) => d === "confirm").length >= 2) {
            modelState = "released";
          }
          const t = applyKeeperDecision(m, keeperId, decision, afterGrace);
          m = t.machine;

          // No release without 2 distinct confirms.
          if (m.state === "RELEASED") {
            expect(new Set(m.confirmations).size).toBeGreaterThanOrEqual(2);
            if (prev.state !== "RELEASED") expect(prev.state).toBe("AWAITING_KEEPERS");
          }
          // False alarm always cancels an open release.
          if (decision === "false_alarm" && prev.state === "AWAITING_KEEPERS") {
            expect(m.state).toBe("ALIVE");
            expect(m.confirmations).toEqual([]);
            expect(t.effects).toContainEqual({ type: "CANCEL_RELEASE", reason: "keeper_false_alarm" });
          }
        }

        // The pure machine and the persistence model agree on the final outcome.
        if (modelState === "released") expect(m.state).toBe("RELEASED");
        if (modelState === "cancelled") expect(m.state).toBe("ALIVE");
        if (modelState === "open") expect(m.state).toBe("AWAITING_KEEPERS");
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it("a single keeper, however many times they confirm, never releases", () => {
    fc.assert(
      fc.property(initialArb, fc.constantFrom(...KEEPERS), fc.integer({ min: 1, max: 20 }), (cfg, who, n) => {
        const { open, afterGrace } = awaitingMachine(cfg);
        let m = open;
        for (let i = 0; i < n; i++) m = applyKeeperDecision(m, who, "confirm", afterGrace).machine;
        expect(m.state).toBe("AWAITING_KEEPERS");
        expect(m.confirmations).toEqual([who]);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it("false alarm after any number of confirmations still cancels, then confirms are inert", () => {
    fc.assert(
      fc.property(
        initialArb,
        fc.array(fc.constantFrom(...KEEPERS), { maxLength: 1 }),
        fc.constantFrom(...KEEPERS),
        fc.array(fc.constantFrom(...KEEPERS), { maxLength: 6 }),
        (cfg, before, alarmist, after) => {
          const { open, afterGrace } = awaitingMachine(cfg);
          let m = open;
          for (const k of before) m = applyKeeperDecision(m, k, "confirm", afterGrace).machine;
          m = applyKeeperDecision(m, alarmist, "false_alarm", afterGrace).machine;
          expect(m.state).toBe("ALIVE");
          for (const k of after) m = applyKeeperDecision(m, k, "confirm", afterGrace).machine;
          expect(m.state).toBe("ALIVE");
          expect(m.confirmations).toEqual([]);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});

describe("PBT: idempotent reminders", () => {
  const ownerFor = (machine: HeartbeatMachine, reminderDaysBefore: number[]): TickOwner => ({
    ownerId: "o1",
    email: "owner@example.com",
    displayName: "Owner",
    machine,
    reminderDaysBefore,
    demoTimeOffset: null,
  });

  function counting(failure: (n: number) => boolean) {
    const sent: string[] = [];
    let calls = 0;
    const mailer: Mailer = {
      provider: "log",
      async send(m) {
        calls++;
        if (failure(calls)) return { ok: false, delivery: "failed", error: "boom" };
        sent.push(m.tag);
        return { ok: true, delivery: "sent" };
      },
    };
    return { mailer, sent };
  }

  it("running the tick twice (or more) sends each reminder at most once", async () => {
    await fc.assert(
      fc.asyncProperty(
        initialArb,
        fc.uniqueArray(fc.integer({ min: 1, max: 5 }), { minLength: 1, maxLength: 3 }),
        fc.array(fc.integer({ min: 0, max: 6 * 3600 * 1000 }), { minLength: 1, maxLength: 80 }),
        fc.integer({ min: 1, max: 4 }),
        async (cfg, reminderDays, gaps, repeats) => {
          const store = new MemoryTickStore();
          const { mailer, sent } = counting(() => false);
          let machine = initial(cfg);
          let clock = T0;
          for (const gap of gaps) {
            clock += gap * 10; // up to ~60h between ticks
            for (let i = 0; i < repeats; i++) {
              const owner = ownerFor(store.machines.get("o1") ?? machine, reminderDays);
              await processOwnerTick(
                owner,
                {
                  store,
                  mailer,
                  demoMode: false,
                  buildEmail: async (o, r) => buildReminderForOwner(o, r, "https://x/app/checkin"),
                },
                new Date(clock)
              );
              machine = store.machines.get("o1") ?? machine;
            }
          }
          // Each (kind, dueDate) key was emailed at most once...
          const keys = [...store.notifications.keys()];
          expect(sent.length).toBe(keys.length);
          // ...and every recorded row is a delivered one.
          for (const row of store.notifications.values()) expect(row.sentAt).not.toBeNull();
          // One OPEN_RELEASE at most (no check-ins in this sequence).
          expect(store.releases.length).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: Math.min(NUM_RUNS, 150) }
    );
  });

  it("failed deliveries are retried at most 3 times and never sent twice", async () => {
    await fc.assert(
      fc.asyncProperty(
        initialArb,
        fc.array(fc.boolean(), { minLength: 1, maxLength: 12 }),
        fc.integer({ min: 1, max: 10 }),
        async (cfg, failures, ticks) => {
          const store = new MemoryTickStore();
          const { mailer, sent } = counting((n) => failures[(n - 1) % failures.length]);
          const machine = initial(cfg);
          // Park the clock inside the 3-day window so exactly one key is in play.
          const now = new Date(machine.nextCheckinDue.getTime() - 2.5 * DAY_MS);
          for (let i = 0; i < ticks; i++) {
            await processOwnerTick(
              ownerFor(machine, [3, 1]),
              {
                store,
                mailer,
                demoMode: false,
                buildEmail: async (o, r) => buildReminderForOwner(o, r, "https://x/app/checkin"),
              },
              now
            );
          }
          expect(sent.length).toBeLessThanOrEqual(1);
          for (const row of store.notifications.values()) {
            expect(row.attempts).toBeLessThanOrEqual(3);
            if (row.sentAt) expect(sent.length).toBe(1);
          }
        }
      ),
      { numRuns: Math.min(NUM_RUNS, 150) }
    );
  });

  it("the plan itself is a pure function of its inputs", () => {
    fc.assert(
      fc.property(
        initialArb,
        fc.integer({ min: 0, max: 80 * DAY_MS }),
        fc.constantFrom<HeartbeatState>("ALIVE", "OVERDUE", "AWAITING_KEEPERS", "RELEASED"),
        (cfg, offset, state) => {
          const m = initial(cfg);
          const args = {
            state,
            due: m.nextCheckinDue,
            graceDays: m.graceDays,
            reminderDaysBefore: [3, 1],
            now: new Date(T0 + offset),
            timeZone: m.timeZone,
          };
          expect(planReminders(args)).toEqual(planReminders(args));
          expect(planReminders(args).length).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});
