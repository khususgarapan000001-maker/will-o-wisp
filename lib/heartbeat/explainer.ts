/** Plain-language "what happens next" copy per state (calm, never alarming). */

import type { HeartbeatState } from "./state-machine.ts";

export interface ExplainerInput {
  state: HeartbeatState;
  dueLabel: string;
  graceEndLabel: string;
  graceDays: number;
}

export interface Explainer {
  headline: string;
  steps: string[];
}

export function explainState(input: ExplainerInput): Explainer {
  switch (input.state) {
    case "ALIVE":
      return {
        headline: "Your lantern is burning steadily.",
        steps: [
          `Your next check-in is due on ${input.dueLabel}.`,
          "We'll send a gentle reminder beforehand. One tap is all it takes.",
          `If the date passes, nothing is shared. You'll have ${input.graceDays} more days.`,
        ],
      };
    case "OVERDUE":
      return {
        headline: "Your check-in is overdue. The lantern is flickering.",
        steps: [
          `You're in your grace period, which ends on ${input.graceEndLabel}.`,
          "We'll nudge you once a day. Nobody else has been told.",
          "Checking in now puts everything back to normal.",
        ],
      };
    case "AWAITING_KEEPERS":
      return {
        headline: "The grace period has ended. The lantern is guttering.",
        steps: [
          "Your keepers are being asked to confirm. Two of them must agree before anything is released.",
          "Any one of them can say it's a false alarm.",
          "You can still check in at any time to cancel this and return to normal.",
        ],
      };
    case "RELEASED":
      return {
        headline: "Your light has been shared.",
        steps: [
          "Your keepers confirmed, and your letters and instructions were released to them.",
          "This can't be undone.",
        ],
      };
  }
}
