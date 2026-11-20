"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckInButton } from "./CheckInButton";
import { Button } from "@/components/ui/button";

/** Shown once after sign-in when a check-in is due soon (or overdue). */
export function LoginCheckInPrompt({ dueLabel, overdue }: { dueLabel: string; overdue: boolean }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  function close() {
    setDismissed(true);
    router.replace("/app");
  }

  return (
    <section
      aria-label="Check-in prompt"
      className="mt-6 rounded-xl border border-primary/40 bg-card p-4 text-center"
    >
      <p className="text-sm text-foreground">
        {overdue
          ? `Welcome back. Your check-in was due on ${dueLabel}. Shall we let your lantern know you're here?`
          : `Welcome back. Your next check-in is due on ${dueLabel}. Check in now while you're here?`}
      </p>
      <div className="mt-3 flex items-center justify-center gap-3">
        <CheckInButton method="login" onDone={() => setTimeout(close, 1200)} />
        <Button variant="ghost" size="sm" onClick={close}>
          Not now
        </Button>
      </div>
    </section>
  );
}
