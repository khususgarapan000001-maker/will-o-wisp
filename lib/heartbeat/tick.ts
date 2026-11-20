/**
 * One owner's heartbeat tick — shared by the heartbeat-tick Edge Function, the
 * demo-clock route and the tests. Storage is behind `TickStore` so the same
 * orchestration runs against Postgres (Edge Function), the Supabase client
 * (demo route) or memory (tests). Pure of Date.now(): `realNow` is injected.
 */

import { planReminders, type PlannedReminder } from "./cadence.ts";
import type { ClaimDecision } from "./reminders.ts";
import { effectiveNow } from "./demo-clock.ts";
import type { Mailer, EmailMessage } from "./mailer.ts";
import {
  nextState,
  type HeartbeatMachine,
  type HeartbeatState,
} from "./state-machine.ts";

export interface TickOwner {
  ownerId: string;
  email: string | null;
  displayName: string;
  machine: HeartbeatMachine;
  reminderDaysBefore: readonly number[];
  /** Raw profiles.demo_time_offset. */
  demoTimeOffset: string | null;
}

export interface TickStore {
  /** Persist the machine's state, due date and state_changed_at. */
  saveMachine(ownerId: string, machine: HeartbeatMachine, changedAt: Date): Promise<void>;
  /** Create the `release_processes` row (state awaiting_keepers). */
  openRelease(ownerId: string, triggeredAt: Date, required: number): Promise<void>;
  /**
   * Claim a reminder key. Implementations insert/increment the `notifications`
   * row atomically and return the outcome of `decideClaim`.
   */
  claimNotification(ownerId: string, reminder: PlannedReminder): Promise<ClaimDecision>;
  /** Record the delivery result for a claimed reminder. */
  finishNotification(
    ownerId: string,
    reminder: PlannedReminder,
    result: { sent: boolean; delivery: string; at: Date }
  ): Promise<void>;
}

export interface TickDeps {
  store: TickStore;
  mailer: Mailer;
  /** Builds the email for a planned reminder; null = skip delivery (still recorded). */
  buildEmail: (owner: TickOwner, reminder: PlannedReminder) => Promise<EmailMessage | null>;
  demoMode: boolean;
  /**
   * Called after a release process is opened (Spec 4): email the accepted
   * keepers and write their in-app notices. Failures are logged, never thrown,
   * so a mail problem cannot undo the state change.
   */
  onReleaseOpened?: (owner: TickOwner, openedAt: Date) => Promise<void>;
}

export interface TickOutcome {
  ownerId: string;
  before: HeartbeatState;
  after: HeartbeatState;
  releaseOpened: boolean;
  remindersSent: string[];
  remindersFailed: string[];
  remindersSkipped: string[];
}

export async function processOwnerTick(
  owner: TickOwner,
  deps: TickDeps,
  realNow: Date
): Promise<TickOutcome> {
  const now = effectiveNow({ demo_time_offset: owner.demoTimeOffset }, realNow, deps.demoMode);
  const outcome: TickOutcome = {
    ownerId: owner.ownerId,
    before: owner.machine.state,
    after: owner.machine.state,
    releaseOpened: false,
    remindersSent: [],
    remindersFailed: [],
    remindersSkipped: [],
  };

  // 1. Transition (one step per tick: ALIVE→OVERDUE, then OVERDUE→AWAITING).
  const t = nextState(owner.machine, { type: "TICK" }, now);
  let machine = owner.machine;
  if (t.changed) {
    machine = t.machine;
    await deps.store.saveMachine(owner.ownerId, machine, now);
    for (const effect of t.effects) {
      if (effect.type === "OPEN_RELEASE") {
        await deps.store.openRelease(owner.ownerId, now, machine.requiredConfirmations);
        outcome.releaseOpened = true;
        if (deps.onReleaseOpened) {
          try {
            await deps.onReleaseOpened(owner, now);
          } catch (err) {
            console.error(
              "[tick] release notification failed:",
              err instanceof Error ? err.message : "unknown error"
            );
          }
        }
      }
    }
  }
  outcome.after = machine.state;

  // 2. Reminders (idempotent via the notifications unique key).
  const planned = planReminders({
    state: machine.state,
    due: machine.nextCheckinDue,
    graceDays: machine.graceDays,
    reminderDaysBefore: owner.reminderDaysBefore,
    now,
    timeZone: machine.timeZone,
  });

  for (const reminder of planned) {
    const decision = await deps.store.claimNotification(owner.ownerId, reminder);
    if (decision === "already_sent" || decision === "exhausted") {
      outcome.remindersSkipped.push(reminder.kind);
      continue;
    }
    const email = owner.email ? await deps.buildEmail(owner, reminder) : null;
    const result = email
      ? await deps.mailer.send(email)
      : { ok: false, delivery: "failed" as const };
    await deps.store.finishNotification(owner.ownerId, reminder, {
      sent: result.ok,
      delivery: result.delivery,
      at: realNow,
    });
    (result.ok ? outcome.remindersSent : outcome.remindersFailed).push(reminder.kind);
  }

  return outcome;
}
