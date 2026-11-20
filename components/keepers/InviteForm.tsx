"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function InviteForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage(null);
    setDevLink(null);
    try {
      const res = await fetch("/api/keepers/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          relationship: data.get("relationship"),
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        emailSent?: boolean;
        devInviteLink?: string;
      };
      if (!res.ok) {
        setMessage({ kind: "error", text: body.error ?? "We couldn't send that invitation." });
        return;
      }
      form.reset();
      setDevLink(body.devInviteLink ?? null);
      setMessage({
        kind: "ok",
        text: body.emailSent
          ? "Invitation sent. They have 7 days to reply."
          : "The invitation was saved, but the email didn't go out. You can resend it below.",
      });
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "We couldn't send that invitation. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-label="Invite a keeper">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="keeper-name">Name</Label>
        <Input id="keeper-name" name="name" required maxLength={100} autoComplete="off" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="keeper-email">Email</Label>
        <Input id="keeper-email" name="email" type="email" required maxLength={254} autoComplete="off" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="keeper-relationship">Relationship (optional)</Label>
        <Input
          id="keeper-relationship"
          name="relationship"
          maxLength={100}
          placeholder="Sister, close friend…"
          autoComplete="off"
        />
      </div>
      <Button type="submit" disabled={busy} className="self-start">
        {busy ? "Sending…" : "Send invitation"}
      </Button>
      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={
            message.kind === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"
          }
        >
          {message.text}
        </p>
      )}
      {devLink && (
        <p className="break-all rounded-md border border-dashed border-primary/40 p-3 text-xs text-muted-foreground">
          No email provider is configured, so here is the invitation link to share by hand:
          <br />
          <span className="text-foreground">{devLink}</span>
        </p>
      )}
    </form>
  );
}
