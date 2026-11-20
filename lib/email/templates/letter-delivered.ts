/**
 * "A letter was left for you" email. LINK ONLY: no subject, no body, nothing
 * from the letter itself, so a compromised inbox cannot expose it. The letter
 * is decrypted only in the keeper's browser. Warm, short, never alarming
 * (steering/product.md). Plain-text and HTML versions both ship.
 */

import type { EmailMessage } from "../../heartbeat/mailer.ts";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface LetterDeliveredEmailInput {
  to: string;
  keeperName: string;
  ownerName: string;
  letterCount: number;
  lettersUrl: string;
}

export function buildLetterDeliveredEmail(i: LetterDeliveredEmailInput): EmailMessage {
  const many = i.letterCount > 1;
  const lines = [
    `Hello ${i.keeperName},`,
    many
      ? `${i.ownerName} left you ${i.letterCount} letters. They are ready for you now.`
      : `${i.ownerName} left you a letter. It is ready for you now.`,
    "For privacy, the words themselves are not in this email. You can read them in WILL-O'-WISP, on the device where you accepted your invitation.",
    "Read when you feel ready. There's no hurry.",
  ];
  const label = many ? "Open your letters" : "Open your letter";
  const text = [...lines, "", `${label}: ${i.lettersUrl}`, "", "— WILL-O'-WISP"].join("\n");
  const html =
    lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("") +
    `<p><a href="${escapeHtml(i.lettersUrl)}">${escapeHtml(label)}</a></p>` +
    "<p>— WILL-O'-WISP</p>";
  return {
    to: i.to,
    subject: many ? `${i.ownerName} left you letters` : `${i.ownerName} left you a letter`,
    text,
    html,
    tag: "letter_delivered",
  };
}
