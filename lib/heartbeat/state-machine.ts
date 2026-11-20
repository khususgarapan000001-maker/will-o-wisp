/**
 * Heartbeat state machine — design-doc §6.
 *
 * PURE: no Date.now(), no DB, no randomness. The clock is always a parameter
 * (`now`), which is what makes the machine property-testable and the demo
 * clock trivial (a different `now`). Persistence and email are adapters
 * (see tick.ts, service.ts and the heartbeat-tick Edge Function).
 *
 * Invariants (design-doc §6.2) enforced here:
 *  1. ALIVE → OVERDUE only when now > next_checkin_due.
 *  2. OVERDUE → AWAITING_KEEPERS only when now > due + grace_days.
 *  3. AWAITING_KEEPERS → RELEASED only with distinct confirmations ≥
 *     required_confirmations, no false-alarm flag, and grace expired.
 *  4. A keeper false alarm cancels the release and returns to ALIVE with a
 *     fresh due date.
 *  5. A check-in in any non-terminal state returns to ALIVE and cancels any
 *     open release.
 *  6. RELEASED is terminal.
 *  7. next_checkin_due never moves backwards.
 *  8. (Reminder idempotency lives in reminders.ts / the notifications table.)
 *
 * Keeper confirmations arrive as plain events (`KEEPER_CONFIRMED` with an id);
 * the machine needs none of the Spec 4 tables.
 */

import { computeNextDue, graceEndsAt, monotonicDue } from "./cadence.ts";

export const HEARTBEAT_STATES = [
  "ALIVE",
  "OVERDUE",
  "AWAITING_KEEPERS",
  "RELEASED",
] as const;
export type HeartbeatState = (typeof HEARTBEAT_STATES)[number];

export function isHeartbeatState(value: string): value is HeartbeatState {
  return (HEARTBEAT_STATES as readonly string[]).includes(value);
}

export interface HeartbeatMachine {
  state: HeartbeatState;
  nextCheckinDue: Date;
  lastCheckinAt: Date | null;
  cadenceDays: number;
  graceDays: number;
  /** IANA zone used for calendar-day arithmetic. */
  timeZone: string;
  requiredConfirmations: number;
  /** Distinct keeper ids that confirmed the current release process. */
  confirmations: readonly string[];
  /** True when any keeper flagged a false alarm on the current release process. */
  falseAlarmFlagged: boolean;
}

export type HeartbeatEvent =
  | { type: "CHECK_IN" }
  | { type: "TICK" }
  | { type: "GRACE_EXPIRED" }
  | { type: "KEEPER_CONFIRMED"; keeperId: string }
  | { type: "FALSE_ALARM"; keeperId: string };

/** Side effects the caller must persist; the machine itself performs none. */
export type HeartbeatEffect =
  | { type: "OPEN_RELEASE" }
  | { type: "CANCEL_RELEASE"; reason: "owner_checkin" | "keeper_false_alarm" }
  | { type: "MARK_RELEASED" }
  | { type: "NOTIFY_ALL_WELL" };

export interface Transition {
  machine: HeartbeatMachine;
  effects: HeartbeatEffect[];
  /** True when any field of the machine differs from the input. */
  changed: boolean;
}

function unchanged(machine: HeartbeatMachine): Transition {
  return { machine, effects: [], changed: false };
}

function backToAlive(
  m: HeartbeatMachine,
  now: Date,
  reason: "owner_checkin" | "keeper_false_alarm"
): Transition {
  const fresh = computeNextDue(now, m.cadenceDays, m.timeZone);
  const wasAwaiting = m.state === "AWAITING_KEEPERS";
  const next: HeartbeatMachine = {
    ...m,
    state: "ALIVE",
    nextCheckinDue: monotonicDue(m.nextCheckinDue, fresh),
    lastCheckinAt: reason === "owner_checkin" ? now : m.lastCheckinAt,
    confirmations: [],
    falseAlarmFlagged: false,
  };
  const effects: HeartbeatEffect[] = wasAwaiting
    ? [{ type: "CANCEL_RELEASE", reason }, { type: "NOTIFY_ALL_WELL" }]
    : [];
  return { machine: next, effects, changed: true };
}

/**
 * Apply one event. Pure: same inputs, same outputs. Events that do not apply in
 * the current state are ignored (returned unchanged), never thrown, so the cron
 * and API can replay them safely.
 */
export function nextState(
  machine: HeartbeatMachine,
  event: HeartbeatEvent,
  now: Date
): Transition {
  // Invariant 6: terminal.
  if (machine.state === "RELEASED") return unchanged(machine);

  const graceEnd = graceEndsAt(
    machine.nextCheckinDue,
    machine.graceDays,
    machine.timeZone
  );
  const pastDue = now.getTime() > machine.nextCheckinDue.getTime();
  const pastGrace = now.getTime() > graceEnd.getTime();

  switch (event.type) {
    case "CHECK_IN":
      // Invariant 5.
      return backToAlive(machine, now, "owner_checkin");

    case "TICK": {
      if (machine.state === "ALIVE" && pastDue) {
        // Invariant 1.
        return {
          machine: { ...machine, state: "OVERDUE" },
          effects: [],
          changed: true,
        };
      }
      if (machine.state === "OVERDUE") {
        return nextState(machine, { type: "GRACE_EXPIRED" }, now);
      }
      return unchanged(machine);
    }

    case "GRACE_EXPIRED": {
      // Invariant 2.
      if (machine.state !== "OVERDUE" || !pastGrace) return unchanged(machine);
      return {
        machine: {
          ...machine,
          state: "AWAITING_KEEPERS",
          confirmations: [],
          falseAlarmFlagged: false,
        },
        effects: [{ type: "OPEN_RELEASE" }],
        changed: true,
      };
    }

    case "KEEPER_CONFIRMED": {
      if (machine.state !== "AWAITING_KEEPERS") return unchanged(machine);
      // No duplicate confirmations: the same keeper counts once.
      if (machine.confirmations.includes(event.keeperId)) return unchanged(machine);
      const confirmations = [...machine.confirmations, event.keeperId];
      const mayRelease =
        !machine.falseAlarmFlagged &&
        confirmations.length >= machine.requiredConfirmations &&
        pastGrace;
      return {
        machine: {
          ...machine,
          confirmations,
          state: mayRelease ? "RELEASED" : machine.state,
        },
        effects: mayRelease ? [{ type: "MARK_RELEASED" }] : [],
        changed: true,
      };
    }

    case "FALSE_ALARM": {
      // Invariant 4: any single keeper cancels an open release.
      if (machine.state !== "AWAITING_KEEPERS") return unchanged(machine);
      return backToAlive(machine, now, "keeper_false_alarm");
    }
  }
}

/** Convenience: apply a sequence of events at the same instant. */
export function applyEvents(
  machine: HeartbeatMachine,
  events: readonly HeartbeatEvent[],
  now: Date
): HeartbeatMachine {
  return events.reduce((m, e) => nextState(m, e, now).machine, machine);
}
