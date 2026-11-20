/** Plain-language status for the release timeline (owner dashboard + keeper page). */

export type ReleaseStateName =
  | "awaiting_keepers"
  | "released"
  | "cancelled_false_alarm"
  | "expired";

export interface ReleaseStatusInput {
  state: ReleaseStateName;
  received: number;
  required: number;
  /** Keepers currently accepted for this owner; omit when unknown (keeper view). */
  acceptedKeepers?: number;
}

export interface ReleaseStatus {
  tone: "waiting" | "done" | "calm";
  headline: string;
  detail: string;
  /** True when fewer accepted keepers exist than the release needs. */
  blockedByKeeperCount: boolean;
}

export function describeRelease(input: ReleaseStatusInput): ReleaseStatus {
  const { state, received, required, acceptedKeepers } = input;
  if (state === "released") {
    return {
      tone: "done",
      headline: "Shared with the keepers",
      detail: "The release was confirmed. The keepers can now read what was left for them.",
      blockedByKeeperCount: false,
    };
  }
  if (state === "cancelled_false_alarm") {
    return {
      tone: "calm",
      headline: "False alarm — all is well",
      detail: "The release was cancelled and the lantern is burning again.",
      blockedByKeeperCount: false,
    };
  }
  if (state === "expired") {
    return {
      tone: "calm",
      headline: "This release is closed",
      detail: "It is no longer waiting for anyone.",
      blockedByKeeperCount: false,
    };
  }
  const blocked = acceptedKeepers !== undefined && acceptedKeepers < required;
  return {
    tone: "waiting",
    headline: `${received} of ${required} confirmations`,
    detail: blocked
      ? `Only ${acceptedKeepers} keeper${acceptedKeepers === 1 ? " has" : "s have"} accepted, so the release is waiting. It needs ${required}.`
      : "Nothing is shared until enough keepers confirm. Any keeper can say it's a false alarm.",
    blockedByKeeperCount: blocked,
  };
}

export const MIN_KEEPERS_WARNING = "You need 2 keepers for the release to work.";

/** Dashboard warning text, or null when there are enough accepted keepers. */
export function keeperMinimumWarning(acceptedKeepers: number, required = 2): string | null {
  return acceptedKeepers < required ? MIN_KEEPERS_WARNING : null;
}

/** "3 days", "5 hours", "less than an hour" — for "time since last check-in". */
export function formatElapsed(from: Date, to: Date): string {
  const ms = Math.max(0, to.getTime() - from.getTime());
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "less than an hour";
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `${days} days`;
}
