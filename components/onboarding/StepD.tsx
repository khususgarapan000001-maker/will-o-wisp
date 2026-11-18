"use client";

import { Button } from "@/components/ui/button";

/**
 * Step (d) — Invite keepers (explainer + skip).
 *
 * The actual keeper invite flow is Spec 4 (keeper-confirmation).
 * This step explains what keepers are and allows skipping.
 */
interface StepDProps {
  onSkip: () => void;
  onComplete: () => void;
}

export function StepD({ onSkip, onComplete }: StepDProps) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Keepers are the trusted people who will confirm your passing and receive
        your letters and instructions. You need at least two keepers — both must
        agree before anything is released.
      </p>

      <ul className="space-y-3 text-sm">
        <li className="flex gap-3">
          <span className="mt-0.5 text-primary">✦</span>
          <span>
            <strong className="text-foreground">They cannot read your vault now.</strong>{" "}
            Everything stays encrypted until both confirm a release.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="mt-0.5 text-primary">✦</span>
          <span>
            <strong className="text-foreground">Either can flag a false alarm.</strong>{" "}
            If your keeper thinks you&apos;re fine, they can cancel the release and
            everything resets.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="mt-0.5 text-primary">✦</span>
          <span>
            <strong className="text-foreground">Choose people you trust completely</strong>{" "}
            — a spouse, a sibling, a close friend.
          </span>
        </li>
      </ul>

      <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        Keeper invites are set up in the Keepers section after onboarding.
        You can skip this step and add keepers any time.
      </p>

      <div className="flex gap-3">
        <Button variant="outline" type="button" onClick={onSkip} className="flex-1">
          Skip for now
        </Button>
        {/* TODO(spec-4): once /app/keepers exists, this button should finish
            onboarding and navigate there instead of to the dashboard. */}
        <Button type="button" onClick={onComplete} className="flex-1">
          Finish setup
        </Button>
      </div>
    </div>
  );
}
