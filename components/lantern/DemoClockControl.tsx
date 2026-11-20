"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const STEPS = [1, 7, 14] as const;

/** Demo-only: advances the demo clock. Rendered only when DEMO_MODE is on. */
export function DemoClockControl({ offsetDays }: { offsetDays: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function advance(days: number) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/demo/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      if (!res.ok) {
        setMessage("The demo clock couldn't be moved.");
      } else {
        const body = (await res.json()) as { after: string };
        setMessage(`Time moved forward ${days} day${days === 1 ? "" : "s"}. State: ${body.after.toLowerCase().replace("_", " ")}.`);
        router.refresh();
      }
    } catch {
      setMessage("The demo clock couldn't be moved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Demo clock"
      className="mt-6 rounded-xl border border-dashed border-primary/40 bg-card p-4"
    >
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        Demo clock · {offsetDays} day{offsetDays === 1 ? "" : "s"} ahead
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {STEPS.map((d) => (
          <Button key={d} variant="outline" size="sm" disabled={busy} onClick={() => advance(d)}>
            +{d} day{d === 1 ? "" : "s"}
          </Button>
        ))}
      </div>
      {message && (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          {message}
        </p>
      )}
    </section>
  );
}
