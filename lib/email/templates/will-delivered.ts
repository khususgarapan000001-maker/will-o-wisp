/**
 * "A checklist of wishes was left for you" email. LINK ONLY: no service names,
 * wishes, transfer assignments or notes, so a compromised inbox cannot expose
 * them. The checklist is read in the keeper's browser after signing in. Warm,
 * short, never alarming (steering/product.md). Plain-text and HTML versions.
 */

import type { EmailMessage } from "../../heartbeat/mailer.ts";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface WillDeliveredEmailInput {
  to: string;
  keeperName: string;
  ownerName: string;
  willUrl: string;
}

export function buildWillDeliveredEmail(i: WillDeliveredEmailInput): EmailMessage {
  const lines = [
    `Hello ${i.keeperName},`,
    `${i.ownerName} left a list of wishes for their online accounts. It is ready for you now.`,
    "For privacy, the details are not in this email. You can read them in WILL-O'-WISP, on the device where you accepted your invitation.",
    "Take your time. There's no hurry.",
  ];
  const label = "Open the list of wishes";
  const text = [...lines, "", `${label}: ${i.willUrl}`, "", "— WILL-O'-WISP"].join("\n");
  const html =
    lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("") +
    `<p><a href="${escapeHtml(i.willUrl)}">${escapeHtml(label)}</a></p>` +
    "<p>— WILL-O'-WISP</p>";
  return {
    to: i.to,
    subject: `${i.ownerName} left you a list of wishes`,
    text,
    html,
    tag: "will_delivered",
  };
}
