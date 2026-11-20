/**
 * Keeper emails. Every template has a plain-text version.
 * Tone: warm, short, never alarming (steering/product.md). No horror language,
 * no fake urgency.
 */

import type { EmailMessage } from "../../heartbeat/mailer.ts";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function compose(args: {
  to: string;
  subject: string;
  tag: string;
  lines: string[];
  cta?: { label: string; url: string };
}): EmailMessage {
  const textParts = [...args.lines];
  if (args.cta) textParts.push("", `${args.cta.label}: ${args.cta.url}`);
  textParts.push("", "— WILL-O'-WISP");
  const html =
    args.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("") +
    (args.cta
      ? `<p><a href="${escapeHtml(args.cta.url)}">${escapeHtml(args.cta.label)}</a></p>`
      : "") +
    "<p>— WILL-O'-WISP</p>";
  return {
    to: args.to,
    subject: args.subject,
    text: textParts.join("\n"),
    html,
    tag: args.tag,
  };
}

export interface KeeperInviteEmailInput {
  to: string;
  keeperName: string;
  ownerName: string;
  inviteUrl: string;
  expiresInDays: number;
}

export function buildKeeperInviteEmail(i: KeeperInviteEmailInput): EmailMessage {
  return compose({
    to: i.to,
    subject: `${i.ownerName} would like you to be a keeper`,
    tag: "keeper_invite",
    lines: [
      `Hello ${i.keeperName},`,
      `${i.ownerName} has asked you to be one of two people they trust to carry their lantern.`,
      "A keeper doesn't do anything day to day. Only if " +
        `${i.ownerName} stops checking in, and you and one other keeper confirm you can't reach them, would you be able to read what they left for you.`,
      `You can accept or decline whenever you like. This link works for ${i.expiresInDays} days.`,
    ],
    cta: { label: "Read the invitation", url: i.inviteUrl },
  });
}

export interface ReleasePendingEmailInput {
  to: string;
  keeperName: string;
  ownerName: string;
  lastCheckinLabel: string | null;
  releaseUrl: string;
}

export function buildReleasePendingEmail(i: ReleasePendingEmailInput): EmailMessage {
  const since = i.lastCheckinLabel
    ? `Their last check-in was on ${i.lastCheckinLabel}.`
    : "We don't have a recent check-in from them.";
  return compose({
    to: i.to,
    subject: `Can you confirm you can't reach ${i.ownerName}?`,
    tag: "release_pending",
    lines: [
      `Hello ${i.keeperName},`,
      `We haven't heard from ${i.ownerName} in a while. ${since}`,
      `If you can't reach them either, you can confirm. If another keeper also confirms, what ${i.ownerName} left for you will be shared. If you know they're fine, tell us it's a false alarm and nothing will be shared.`,
      "Please take your time and try to reach them first.",
    ],
    cta: { label: "Open the decision page", url: i.releaseUrl },
  });
}

export interface ReleasedEmailInput {
  to: string;
  recipientName: string;
  ownerName: string;
  audience: "owner" | "keeper";
  url: string;
}

export function buildReleasedEmail(i: ReleasedEmailInput): EmailMessage {
  const keeper = i.audience === "keeper";
  return compose({
    to: i.to,
    subject: keeper
      ? `What ${i.ownerName} left for you is ready`
      : "Your lantern has been passed on",
    tag: "released",
    lines: keeper
      ? [
          `Hello ${i.recipientName},`,
          `Two keepers confirmed they couldn't reach ${i.ownerName}, so what they left for you is now available.`,
          "Read it when you feel ready. There's no hurry.",
        ]
      : [
          `Hello ${i.recipientName},`,
          "Two of your keepers confirmed they couldn't reach you, so your lantern has been passed on as you planned.",
          "If this is a mistake, please contact your keepers.",
        ],
    cta: { label: keeper ? "Open what was left for you" : "Open WILL-O'-WISP", url: i.url },
  });
}

export interface FalseAlarmEmailInput {
  to: string;
  recipientName: string;
  ownerName: string;
  audience: "owner" | "keeper";
  /** Optional note the keeper wrote, shown to the owner. Plain text. */
  note: string | null;
  url: string;
}

export function buildFalseAlarmEmail(i: FalseAlarmEmailInput): EmailMessage {
  const owner = i.audience === "owner";
  const lines = owner
    ? [
        `Hello ${i.recipientName},`,
        "One of your keepers said it was a false alarm, so nothing was shared and your lantern is burning again.",
      ]
    : [
        `Hello ${i.recipientName},`,
        `A keeper said ${i.ownerName} is fine, so the release was cancelled and nothing was shared. Thank you for looking out for them.`,
      ];
  if (i.note) lines.push(`Their note: “${i.note}”`);
  return compose({
    to: i.to,
    subject: owner ? "A gentle all-clear" : `${i.ownerName} is fine, the release was cancelled`,
    tag: "false_alarm",
    lines,
    cta: owner ? { label: "Open WILL-O'-WISP", url: i.url } : undefined,
  });
}
