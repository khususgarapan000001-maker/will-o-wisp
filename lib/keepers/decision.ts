/**
 * Keeper decisions expressed as state-machine events.
 *
 * The persisted counterpart is the SQL function record_keeper_decision()
 * (supabase/migrations/20261121090100_keeper_confirmations.sql). The pure
 * machine in lib/heartbeat/state-machine.ts is the tested specification of the
 * counting rules: distinct keepers only, release at >= required confirmations,
 * one false alarm cancels everything.
 */

import {
  nextState,
  type HeartbeatEvent,
  type HeartbeatMachine,
  type Transition,
} from "../heartbeat/state-machine.ts";

export type KeeperDecisionKind = "confirm" | "false_alarm";

export function decisionToEvent(keeperId: string, decision: KeeperDecisionKind): HeartbeatEvent {
  return decision === "confirm"
    ? { type: "KEEPER_CONFIRMED", keeperId }
    : { type: "FALSE_ALARM", keeperId };
}

export function applyKeeperDecision(
  machine: HeartbeatMachine,
  keeperId: string,
  decision: KeeperDecisionKind,
  now: Date
): Transition {
  return nextState(machine, decisionToEvent(keeperId, decision), now);
}

/** Distinct confirming keepers, ignoring anyone who is not currently accepted. */
export function countConfirmations(
  rows: readonly { keeperId: string; decision: KeeperDecisionKind }[],
  acceptedKeeperIds: ReadonlySet<string>
): number {
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.decision === "confirm" && acceptedKeeperIds.has(r.keeperId)) seen.add(r.keeperId);
  }
  return seen.size;
}
