"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function DecisionForm({ releaseId, ownerName }: { releaseId: string; ownerName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askNote, setAskNote] = useState(false);
  const [note, setNote] = useState("");

  async function decide(decision: "confirm" | "false_alarm") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/releases/${releaseId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: decision === "false_alarm" ? note : undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      // 409 = already decided / no longer open: refresh shows the current state.
      if (!res.ok && res.status !== 409) {
        setError(body.error ?? "We couldn't record that just now. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("We couldn't record that just now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button disabled={busy} onClick={() => void decide("confirm")}>
          Confirm — I can&apos;t reach them
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => setAskNote(true)}>
          False alarm — they&apos;re fine
        </Button>
      </div>

      {askNote && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <Label htmlFor="false-alarm-note">
            Add a short note for {ownerName} (optional)
          </Label>
          <textarea
            id="false-alarm-note"
            value={note}
            maxLength={500}
            rows={3}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Spoke to her yesterday, she's travelling."
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void decide("false_alarm")}>
              Send the all-clear
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setAskNote(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
