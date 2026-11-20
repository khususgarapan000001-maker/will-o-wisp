/**
 * Reminder idempotency (design-doc §6.2 invariant 8).
 *
 * A reminder is identified by (owner, kind, due_date) — the unique key of the
 * `notifications` table. Before sending, a tick "claims" the key. This pure
 * function decides what a claim should do given the existing row (if any);
 * every store (Postgres, Supabase client, in-memory test double) applies it.
 */

import { MAX_REMINDER_ATTEMPTS } from "./cadence.ts";

export interface NotificationRow {
  sentAt: Date | null;
  attempts: number;
}

export type ClaimDecision =
  /** No row yet: insert it (attempts = 1) and send. */
  | "insert_and_send"
  /** Row exists, unsent, attempts left: increment attempts and send again. */
  | "retry"
  /** Already delivered: skip. */
  | "already_sent"
  /** Too many failed attempts: skip, flagged for manual review. */
  | "exhausted";

export function decideClaim(
  existing: NotificationRow | null,
  maxAttempts: number = MAX_REMINDER_ATTEMPTS
): ClaimDecision {
  if (existing === null) return "insert_and_send";
  if (existing.sentAt !== null) return "already_sent";
  if (existing.attempts >= maxAttempts) return "exhausted";
  return "retry";
}
