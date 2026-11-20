"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { updateHeartbeatSettingsAction } from "@/lib/heartbeat/actions";

const OPTIONS = [7, 14, 30] as const;

function Picker({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {OPTIONS.map((o) => (
          <option key={o} value={o}>
            {o} days
          </option>
        ))}
      </select>
    </div>
  );
}

export function HeartbeatSettingsForm({
  cadenceDays,
  graceDays,
}: {
  cadenceDays: number;
  graceDays: number;
}) {
  const [cadence, setCadence] = useState(cadenceDays);
  const [grace, setGrace] = useState(graceDays);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = cadence !== cadenceDays || grace !== graceDays;

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateHeartbeatSettingsAction(cadence, grace);
      setMessage(
        result.error
          ? { kind: "error", text: result.error }
          : { kind: "ok", text: "Saved. Your next check-in date has been updated." }
      );
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Picker id="cadence" label="Check in every" value={cadence} onChange={setCadence} />
        <Picker id="grace" label="Grace period" value={grace} onChange={setGrace} />
      </div>
      <p className="text-xs text-muted-foreground">
        A longer rhythm moves your next due date later right away. A shorter one
        takes effect after your next check-in, so a date never jumps closer.
      </p>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!dirty || pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={
              message.kind === "error"
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
          >
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
