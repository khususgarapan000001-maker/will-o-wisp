"use client";

import { Button } from "@/components/ui/button";

/**
 * Step (e) — Write your first letter (explainer + skip).
 *
 * The letter editor lives at /app/letters (Spec 5). This step explains what
 * letters are; "Write my first letter" finishes onboarding and goes there,
 * "Skip for now" finishes onboarding and goes to the dashboard.
 */
interface StepEProps {
  onSkip: () => void;
  onComplete: () => void;
}

export function StepE({ onSkip, onComplete }: StepEProps) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Last letters are private messages delivered to your keepers only after
        a confirmed release. They&apos;re the heart of WILL-O&apos;-WISP.
      </p>

      <ul className="space-y-3 text-sm">
        <li className="flex gap-3">
          <span className="mt-0.5 text-primary">✦</span>
          <span>
            <strong className="text-foreground">Write to each keeper separately.</strong>{" "}
            What you say to your spouse can stay private from your sibling.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="mt-0.5 text-primary">✦</span>
          <span>
            <strong className="text-foreground">End-to-end encrypted.</strong>{" "}
            Only your keeper can read your words — not us, not anyone else.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="mt-0.5 text-primary">✦</span>
          <span>
            <strong className="text-foreground">Edit any time.</strong>{" "}
            Your letters are yours until they&apos;re released. Update them whenever life changes.
          </span>
        </li>
      </ul>

      <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        You can write your first letter from the Letters section of your dashboard.
      </p>

      <div className="flex gap-3">
        <Button variant="outline" type="button" onClick={onSkip} className="flex-1">
          Skip for now
        </Button>
        <Button type="button" onClick={onComplete} className="flex-1">
          Write my first letter
        </Button>
      </div>
    </div>
  );
}
