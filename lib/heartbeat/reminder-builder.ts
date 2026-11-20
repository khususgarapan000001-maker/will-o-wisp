import { buildReminderEmail } from "../email/templates/heartbeat.ts";
import type { PlannedReminder } from "./cadence.ts";
import type { EmailMessage } from "./mailer.ts";
import type { TickOwner } from "./tick.ts";

export function formatDateLabel(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Builds the reminder email for an owner. Returns null when there is no address. */
export function buildReminderForOwner(
  owner: TickOwner,
  reminder: PlannedReminder,
  checkInUrl: string
): EmailMessage | null {
  if (!owner.email) return null;
  return buildReminderEmail({
    to: owner.email,
    displayName: owner.displayName,
    kind: reminder.kind,
    dueDateLabel: formatDateLabel(owner.machine.nextCheckinDue, owner.machine.timeZone),
    checkInUrl,
    graceDays: owner.machine.graceDays,
  });
}
