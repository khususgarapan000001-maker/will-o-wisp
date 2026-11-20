"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateKeeperKeyPair } from "@/lib/crypto/keeper-keys";
import { saveKeeperPrivateKey } from "@/lib/crypto/keeper-store";

interface Props {
  token: string;
  keeperId: string;
  keeperEmail: string;
  ownerName: string;
  /** True when the visitor is already signed in as the invited address. */
  signedInAsInvitee: boolean;
}

type Step = "choose" | "account" | "confirm_email" | "declined" | "done";

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, json };
}

export function InviteResponse({ token, keeperId, keeperEmail, ownerName, signedInAsInvitee }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("choose");
  const [mode, setMode] = useState<"sign_up" | "sign_in">("sign_up");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Keys are made here, in the keeper's browser; only the public half is uploaded. */
  async function provisionKeysAndAccept() {
    const pair = await generateKeeperKeyPair();
    await saveKeeperPrivateKey(keeperId, pair.privateKey);
    const done = await post("/api/keepers/accept", {
      action: "finalize",
      token,
      publicKeyB64: pair.publicKeyB64,
    });
    if (!done.ok) {
      throw new Error(typeof done.json.error === "string" ? done.json.error : "We couldn't finish accepting.");
    }
  }

  async function accept(password?: string) {
    setBusy(true);
    setError(null);
    try {
      if (!signedInAsInvitee) {
        const auth = await post("/api/keepers/accept", { action: "auth", token, password, mode });
        if (!auth.ok) {
          if (auth.json.reason === "exists") setMode("sign_in");
          setError(typeof auth.json.error === "string" ? auth.json.error : "Something went wrong.");
          return;
        }
        if (auth.json.needsConfirmation) {
          setStep("confirm_email");
          return;
        }
      }
      await provisionKeysAndAccept();
      setStep("done");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    setBusy(true);
    setError(null);
    const res = await post("/api/keepers/decline", { token });
    setBusy(false);
    if (!res.ok) {
      setError(typeof res.json.error === "string" ? res.json.error : "Something went wrong.");
      return;
    }
    setStep("declined");
  }

  if (step === "declined") {
    return (
      <p role="status" className="text-foreground">
        Thank you for letting {ownerName} know. They&apos;ll be told gently, and nothing more is
        needed from you.
      </p>
    );
  }
  if (step === "confirm_email") {
    return (
      <div role="status" className="text-foreground">
        <p>Please check your inbox and confirm your email address.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Then open this invitation link again to finish accepting.
        </p>
      </div>
    );
  }
  if (step === "done") {
    return (
      <div role="status" className="text-foreground">
        <p>You&apos;re now a keeper for {ownerName}. Thank you.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Your key stays on this device. Please use the same browser if you&apos;re asked to
          confirm something later.
        </p>
        <Button className="mt-4" onClick={() => router.push("/keeper")}>
          Continue
        </Button>
      </div>
    );
  }

  if (step === "account" && !signedInAsInvitee) {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void accept(String(new FormData(e.currentTarget).get("password") ?? ""));
        }}
      >
        <p className="text-sm text-muted-foreground">
          {mode === "sign_up"
            ? `Choose a password for ${keeperEmail}.`
            : `Sign in as ${keeperEmail} to accept.`}
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="keeper-password">Password</Label>
          <Input
            id="keeper-password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "sign_up" ? "new-password" : "current-password"}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? "One moment…" : mode === "sign_up" ? "Create account and accept" : "Sign in and accept"}
          </Button>
          <button
            type="button"
            className="text-sm text-primary underline-offset-4 hover:underline"
            onClick={() => setMode(mode === "sign_up" ? "sign_in" : "sign_up")}
          >
            {mode === "sign_up" ? "I already have an account" : "I need a new account"}
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={busy}
          onClick={() => (signedInAsInvitee ? void accept() : setStep("account"))}
        >
          Accept
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => void decline()}>
          Decline
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
