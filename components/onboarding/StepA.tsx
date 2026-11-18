"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveStepA } from "@/lib/onboarding/actions";
import { validateStepA } from "@/lib/onboarding/validation";

// Common IANA timezones grouped for the select.
const TIMEZONES = [
  "Asia/Jakarta",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Bangkok",
  "Asia/Manila",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

interface StepAProps {
  initialDisplayName?: string;
  initialTimezone?: string;
  onComplete: () => void;
}

export function StepA({ initialDisplayName = "", initialTimezone = "Asia/Jakarta", onComplete }: StepAProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [fieldErrors, setFieldErrors] = useState<{ displayName?: string; timezone?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const { valid, errors } = validateStepA({ displayName, timezone });
    if (!valid) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    startTransition(async () => {
      const result = await saveStepA(displayName, timezone);
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="display-name">Your name</Label>
        <Input
          id="display-name"
          type="text"
          autoComplete="name"
          placeholder="How should we address you?"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          aria-invalid={!!fieldErrors.displayName}
          aria-describedby={fieldErrors.displayName ? "display-name-error" : undefined}
          disabled={isPending}
        />
        {fieldErrors.displayName && (
          <p id="display-name-error" className="text-sm text-destructive">
            {fieldErrors.displayName}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="timezone">Your timezone</Label>
        <select
          id="timezone"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          aria-invalid={!!fieldErrors.timezone}
          aria-describedby={fieldErrors.timezone ? "timezone-error" : undefined}
          disabled={isPending}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        {fieldErrors.timezone && (
          <p id="timezone-error" className="text-sm text-destructive">
            {fieldErrors.timezone}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Used for check-in reminders and due-date display.
        </p>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
