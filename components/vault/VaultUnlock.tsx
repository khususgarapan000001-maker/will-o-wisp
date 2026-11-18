"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { unlockVault, WrongPassphraseError } from "@/lib/crypto/session";

// After 5 consecutive wrong-passphrase attempts, lock out for 60 seconds.
const MAX_ATTEMPTS = 5;
const COOLDOWN_SECONDS = 60;

interface VaultUnlockProps {
  saltB64: string;
  wrappedDekB64: string;
  onUnlocked: () => void;
}

export function VaultUnlock({ saltB64, wrappedDekB64, onUnlocked }: VaultUnlockProps) {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Consecutive-failure tracking for the cooldown.
  const failCount = useRef(0);
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  const [now, setNow] = useState<number>(() => Date.now());

  // Tick once a second while cooling down, so the countdown updates and the
  // form re-enables when the cooldown expires (without this, nothing
  // re-renders the component and the form would stay disabled).
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const cooldownRemaining = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const isCoolingDown = cooldownRemaining > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isCoolingDown) return;
    if (!passphrase) {
      setError("Please enter your vault passphrase.");
      return;
    }

    startTransition(async () => {
      try {
        await unlockVault(passphrase, saltB64, wrappedDekB64);
        // Success — reset failure count and notify parent.
        failCount.current = 0;
        setPassphrase("");
        onUnlocked();
      } catch (err) {
        if (err instanceof WrongPassphraseError) {
          failCount.current += 1;
          if (failCount.current >= MAX_ATTEMPTS) {
            failCount.current = 0;
            setCooldownUntil(Date.now() + COOLDOWN_SECONDS * 1000);
            setError(
              `That passphrase didn't match. Too many attempts — please wait ${COOLDOWN_SECONDS} seconds before trying again.`
            );
          } else {
            setError(
              "That passphrase didn't match. Please try again."
            );
          }
        } else {
          console.error("[VaultUnlock] unexpected error:", err);
          setError("Something went wrong. Please try again.");
        }
        setPassphrase("");
      }
    });
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-serif text-xl">Unlock your vault</CardTitle>
          <CardDescription>
            Enter your vault passphrase to decrypt your items. It never leaves your device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            {error && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            {isCoolingDown && (
              <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                Please wait {cooldownRemaining} second{cooldownRemaining !== 1 ? "s" : ""} before trying again.
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vault-passphrase">Vault passphrase</Label>
              <Input
                id="vault-passphrase"
                type="password"
                autoComplete="current-password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                disabled={isPending || isCoolingDown}
                aria-invalid={!!error}
              />
            </div>

            <Button
              type="submit"
              disabled={isPending || isCoolingDown}
              className="w-full"
            >
              {isPending ? "Unlocking…" : "Unlock vault"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
