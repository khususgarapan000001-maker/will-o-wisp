/**
 * In-app notification kinds for Spec 4 (rows in `notifications`; kind matches
 * ^[a-z][a-z0-9_]*$). SQL writes `<prefix>_<release/keeper id without dashes>`
 * so the (owner_id, kind, due_date) unique key never collides.
 */

export const KEEPER_NOTICE_PREFIXES = [
  "keeper_accepted",
  "keeper_declined",
  "release_pending",
  "released",
  "false_alarm",
  "letter_delivered",
  "will_delivered",
] as const;
export type KeeperNoticePrefix = (typeof KEEPER_NOTICE_PREFIXES)[number];

export function noticePrefix(kind: string): KeeperNoticePrefix | null {
  // Longest-first so "released" does not shadow anything.
  for (const p of KEEPER_NOTICE_PREFIXES) {
    if (kind === p || kind.startsWith(`${p}_`)) return p;
  }
  return null;
}

export interface NoticeView {
  text: string;
  /** Link target, when the notice points somewhere. */
  href: string | null;
}

export function describeNotice(
  kind: string,
  payload: Record<string, unknown> | null,
  audience: "owner" | "keeper"
): NoticeView | null {
  const prefix = noticePrefix(kind);
  if (!prefix) return null;
  const keeperName = typeof payload?.keeper_name === "string" ? payload.keeper_name : "A keeper";
  const releaseId = typeof payload?.release_id === "string" ? payload.release_id : null;
  switch (prefix) {
    case "keeper_accepted":
      return { text: `${keeperName} accepted your invitation.`, href: "/app/keepers" };
    case "keeper_declined":
      return {
        text: `${keeperName} couldn't take this on. You could invite someone else.`,
        href: "/app/keepers",
      };
    case "release_pending":
      return {
        text: "We haven't heard from them. Can you confirm they're unreachable?",
        href: releaseId ? `/keeper/release/${releaseId}` : "/keeper",
      };
    case "released":
      return {
        text: audience === "owner" ? "Your release was confirmed." : "The release was confirmed.",
        href: audience === "keeper" && releaseId ? `/keeper/release/${releaseId}` : "/app",
      };
    case "letter_delivered":
      return {
        text: "A letter was left for you. Read it when you feel ready.",
        href: releaseId ? `/keeper/release/${releaseId}/letters` : "/keeper",
      };
    case "will_delivered":
      return {
        text: "A list of wishes for their accounts was left for you. Read it when you feel ready.",
        href: releaseId ? `/keeper/release/${releaseId}/will` : "/keeper",
      };
    case "false_alarm":
      return {
        text: "It was a false alarm. All is well.",
        href: audience === "keeper" && releaseId ? `/keeper/release/${releaseId}` : "/app",
      };
  }
}
