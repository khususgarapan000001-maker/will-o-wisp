"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { saveStepC } from "@/lib/onboarding/actions";
import { validateStepC, VALID_CADENCE_DAYS, VALID_GRACE_DAYS } from "@/lib/onboarding/validation";

const CADENCE_LABELS: Record<number, string> = {
  7: "Every week (7 days)",
  14: "Every two weeks (14 days) — recommended",
  30: "Every month (30 days)",
};

const GRACE_LABELS: Record<number, string> = {
  7: "7 days",
  14: "14 days — recommended",
  30: "30 days",
};

interface StepCProps {
  onComplete: () => void;
}

export function StepC({ onComplete }: StepCProps) {
  const [cadenceDays, setCadenceDays] = useState<number>(14);
  const [graceDays, setGraceDays] = useState<number>(14);
  const [fieldErrors, setFieldErrors] = useState<{ cadenceDays?: string; graceDays?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const { valid, errors } = validateStepC({ cadenceDays, graceDays });
    if (!valid) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    startTransition(async () => {
      const result = await saveStepC(cadenceDays, graceDays);
      if (result.fieldErrors) {
        setFieldErrors(result.fieldErrors);
      } else if (result.error) {
        setServerError(result.error);
      } else {
        onComplete();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {serverError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        How often do you want to check in? If we don&apos;t hear from you after
        your grace period ends, your keepers will be notified.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label>Check-in cadence</Label>
        <div className="flex flex-col gap-2">
          {VALID_CADENCE_DAYS.map((days) => (
            <label
              key={days}
              className="flex cursor-pointer items-center gap-3 rounded-md border border-input p-3 transition-colors hover:bg-accent/50 has-[:checked]:border-primary has-[:checked]:bg-accent/30"
            >
              <input
                type="radio"
                name="cadence"
                value={days}
                checked={cadenceDays === days}
                onChange={() => setCadenceDays(days)}
                className="accent-primary"
              />
              <span className="text-sm">{CADENCE_LABELS[days]}</span>
            </label>
          ))}
        </div>
        {fieldErrors.cadenceDays && (
          <p className="text-sm text-destructive">{fieldErrors.cadenceDays}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Grace period after a missed check-in</Label>
        <div className="flex flex-col gap-2">
          {VALID_GRACE_DAYS.map((days) => (
            <label
              key={days}
              className="flex cursor-pointer items-center gap-3 rounded-md border border-input p-3 transition-colors hover:bg-accent/50 has-[:checked]:border-primary has-[:checked]:bg-accent/30"
            >
              <input
                type="radio"
                name="grace"
                value={days}
                checked={graceDays === days}
                onChange={() => setGraceDays(days)}
                className="accent-primary"
              />
              <span className="text-sm">{GRACE_LABELS[days]}</span>
            </label>
          ))}
        </div>
        {fieldErrors.graceDays && (
          <p className="text-sm text-destructive">{fieldErrors.graceDays}</p>
        )}
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
