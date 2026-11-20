/**
 * Heartbeat reminder emails. Every template has a plain-text version.
 * Tone: warm, short, never alarming (steering/product.md).
 */

import type { EmailMessage } from "../../heartbeat/mailer.ts";

export interface ReminderEmailInput {
  to: string;
  displayName: string;
  kind: string;
  /** Human-readable due date in the owner's zone, e.g. "21 November 2026". */
  dueDateLabel: string;
  /** One-tap check-in link. */
  checkInUrl: string;
  graceDays: number;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildReminderEmail(input: ReminderEmailInput): EmailMessage {
  const overdue = input.kind.startsWith("overdue_day_");
  const name = input.displayName || "there";

  const subject = overdue
    ? "Your lantern is waiting for you"
    : "A gentle reminder to check in";

  const lines = overdue
    ? [
        `Hello ${name},`,
        `Your check-in was due on ${input.dueDateLabel}. There's no rush and nothing has been shared with anyone.`,
        `You have a grace period of ${input.graceDays} days. One tap tells your lantern you're here.`,
      ]
    : [
        `Hello ${name},`,
        `Your next check-in is due on ${input.dueDateLabel}.`,
        "One tap is all it takes to keep your lantern burning.",
      ];

  const text = [...lines, "", `I'm here: ${input.checkInUrl}`, "", "— WILL-O'-WISP"].join("\n");
  const html =
    lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("") +
    `<p><a href="${escapeHtml(input.checkInUrl)}">I'm here</a></p><p>— WILL-O'-WISP</p>`;

  return { to: input.to, subject, text, html, tag: input.kind };
}
