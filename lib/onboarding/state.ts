/**
 * Derives the current onboarding step from the server-side profile and
 * heartbeat_settings rows — no client state needed to resume after a refresh.
 *
 * Steps:
 *   "a" — display name + timezone (always first)
 *   "b" — vault passphrase (TODO: check vaults table once Spec 2 exists)
 *   "c" — heartbeat cadence + grace period (requires heartbeat_settings row)
 *   "d" — keeper invites (skippable)
 *   "e" — first letter (skippable)
 *   "done" — onboarding_completed_at is set
 */

export type OnboardingStep = "a" | "b" | "c" | "d" | "e" | "done";

export interface OnboardingStateInput {
  /** profiles.onboarding_completed_at — null if not yet complete. */
  onboardingCompletedAt: string | null;
  /** True when heartbeat_settings row exists for this user. */
  hasHeartbeatSettings: boolean;
  /**
   * True when the vault row exists and has a wrapped_dek.
   * Always false until Spec 2 (encrypted-vault) is implemented.
   */
  hasVault: boolean;
}

export interface OnboardingState {
  /** The step the user should be on when they arrive at /app/onboarding. */
  currentStep: OnboardingStep;
  /** Set of steps that have been completed. */
  completedSteps: Set<OnboardingStep>;
}

export function deriveOnboardingState(input: OnboardingStateInput): OnboardingState {
  if (input.onboardingCompletedAt !== null) {
    const all = new Set<OnboardingStep>(["a", "b", "c", "d", "e", "done"]);
    return { currentStep: "done", completedSteps: all };
  }

  const completedSteps = new Set<OnboardingStep>();

  // Step (c) requires the heartbeat_settings row.
  const stepCDone = input.hasHeartbeatSettings;
  // Step (b) requires the vault row (pending Spec 2).
  const stepBDone = input.hasVault;

  // The minimum required steps before "done" are (a) and (c).
  // We infer step (a) is done if (c) is done (they are sequential).
  if (stepCDone) {
    completedSteps.add("a");
    completedSteps.add("c");
  }
  if (stepBDone) {
    completedSteps.add("b");
  }

  // Determine the current step in sequence: a → b → c → d → e
  if (!completedSteps.has("a")) return { currentStep: "a", completedSteps };
  if (!completedSteps.has("b")) return { currentStep: "b", completedSteps };
  if (!completedSteps.has("c")) return { currentStep: "c", completedSteps };
  // Steps d and e are skippable — if the user has not done a or c, those
  // come first. Once a and c are done and the user reaches d, they can skip
  // to e and then mark done. We track these via the wizard's local state only.
  return { currentStep: "d", completedSteps };
}

/**
 * Returns which setup items are still incomplete for the dashboard checklist.
 */
export interface SetupChecklistItem {
  id: "vault" | "keepers" | "letter";
  label: string;
  description: string;
  href: string;
}

export function getIncompleteSetupItems(input: OnboardingStateInput): SetupChecklistItem[] {
  const items: SetupChecklistItem[] = [];

  if (!input.hasVault) {
    items.push({
      id: "vault",
      label: "Set your vault passphrase",
      description: "Create the passphrase that encrypts your vault. We cannot recover it.",
      href: "/app/onboarding",
    });
  }

  // Keeper and letter items are always shown as "optional setup" until Spec 4/5
  // provide the data to check them. For now we always include them so the
  // checklist renders — they are removed once keepers/letters are confirmed.
  items.push({
    id: "keepers",
    label: "Invite your keepers",
    description: "Choose two trusted people who will confirm your release.",
    href: "/app/keepers",
  });

  items.push({
    id: "letter",
    label: "Write your first letter",
    description: "Leave a message for your keepers to read after your release.",
    href: "/app/letters",
  });

  return items;
}
