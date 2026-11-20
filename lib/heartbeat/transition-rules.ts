/**
 * Database-level legal transitions for heartbeat_settings.state.
 *
 * This is the TypeScript twin of the `heartbeat_settings_guard` trigger in
 * supabase/migrations/20261121090200_heartbeat_state_guard.sql. There is no
 * live database in the test environment, so the rule is expressed here too and
 * unit-tested against the pure state machine: every transition the machine can
 * produce must be accepted by the trigger for the right kind of caller.
 *
 *   ALIVE            -> OVERDUE
 *   OVERDUE          -> AWAITING_KEEPERS
 *   any non-terminal -> ALIVE
 *   AWAITING_KEEPERS -> RELEASED   (privileged only)
 *   RELEASED         -> (nothing)
 *   same -> same     always fine
 *
 * "privileged" = service role, or a SECURITY DEFINER function running as its
 * owner (record_keeper_decision). A signed-in owner is never privileged.
 */

import type { HeartbeatState } from "./state-machine.ts";

export function isLegalDbTransition(
  from: HeartbeatState,
  to: HeartbeatState,
  privileged: boolean
): boolean {
  if (from === to) return true;
  if (from === "RELEASED") return false;
  if (to === "RELEASED") return privileged && from === "AWAITING_KEEPERS";
  if (to === "ALIVE") return true;
  return (
    (from === "ALIVE" && to === "OVERDUE") ||
    (from === "OVERDUE" && to === "AWAITING_KEEPERS")
  );
}

/** A brand-new heartbeat row must start ALIVE unless the writer is privileged. */
export function isLegalDbInsert(state: HeartbeatState, privileged: boolean): boolean {
  return state === "ALIVE" || privileged;
}
