"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { revokeKeeperAction } from "@/lib/keepers/actions";

interface Props {
  keeperId: string;
  keeperName: string;
  status: "invited" | "accepted" | "declined" | "revoked";
  inviteEmailFailed: boolean;
}

export function KeeperRowActions({ keeperId, keeperName, status, inviteEmailFailed }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);

  async function resend() {
    setMessage(null);
    setDevLink(null);
    const res = await fetch("/api/keepers/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resend: keeperId }),
    });
    const body = (await res.json()) as { error?: string; emailSent?: boolean; devInviteLink?: string };
    if (!res.ok) {
      setMessage(body.error ?? "We couldn't send that invitation again.");
      return;
    }
    setDevLink(body.devInviteLink ?? null);
    setMessage(body.emailSent ? "Sent a fresh invitation." : "The email still didn't go out. Please try again later.");
    router.refresh();
  }

  function revoke() {
    startTransition(async () => {
      const result = await revokeKeeperAction(keeperId);
      if (result.error) setMessage(result.error);
      setConfirming(false);
      router.refresh();
    });
  }

  if (status === "declined" || status === "revoked") return null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      {confirming ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm text-foreground">
            {status === "accepted"
              ? `Remove ${keeperName}? They'll lose all access straight away.`
              : `Withdraw the invitation to ${keeperName}?`}
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
              Keep them
            </Button>
            <Button variant="destructive" size="sm" onClick={revoke} disabled={pending}>
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {status === "invited" && (
            <Button
              variant={inviteEmailFailed ? "default" : "outline"}
              size="sm"
              onClick={resend}
              disabled={pending}
            >
              {inviteEmailFailed ? "Resend (email didn't go out)" : "Resend invitation"}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            {status === "accepted" ? "Remove keeper" : "Withdraw invitation"}
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
      {devLink && <p className="break-all text-xs text-foreground">{devLink}</p>}
    </div>
  );
}
