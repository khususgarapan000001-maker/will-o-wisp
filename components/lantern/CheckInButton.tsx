"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Method = "button" | "login" | "magic_link";

interface CheckInButtonProps {
  method?: Method;
  /** Label shown before the check-in. */
  label?: string;
  /** Called after a successful check-in (e.g. to dismiss a prompt). */
  onDone?: () => void;
}

/**
 * One-tap check-in with optimistic UI: the confirmation appears immediately and
 * is rolled back with a gentle message if the request fails.
 */
export function CheckInButton({
  method = "button",
  label = "I'm here",
  onDone,
}: CheckInButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setStatus("pending");
    setMessage("Thank you. Your lantern is bright again.");
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus("error");
        setMessage(body.error ?? "We couldn't record that just now. Please try again in a moment.");
        return;
      }
      setStatus("done");
      onDone?.();
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("We couldn't reach the server. Please check your connection and try again.");
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        size="lg"
        onClick={handleClick}
        disabled={status === "pending" || status === "done"}
      >
        {status === "done" ? "Checked in" : label}
      </Button>
      <p
        role={status === "error" ? "alert" : "status"}
        aria-live="polite"
        className={
          status === "error"
            ? "text-sm text-destructive"
            : "text-sm text-muted-foreground"
        }
      >
        {status === "pending" || status === "done" || status === "error" ? message : ""}
      </p>
    </div>
  );
}
