"use client";

/**
 * Step (b) — Vault passphrase creation.
 *
 * Full implementation wired to the real crypto vault creation flow (Spec 2):
 *   1. Browser derives a KEK from the passphrase (PBKDF2-SHA-256, 600k iterations)
 *   2. Generates a random DEK (AES-GCM 256)
 *   3. Wraps the DEK with the KEK (AES-KW)
 *   4. Sends only { salt, wrapped_dek } to the server via createVaultAction
 *
 * The passphrase, DEK, and KEK never leave the browser.
 *
 * If Supabase is not configured (missing env vars), shows a friendly notice
 * and lets the user skip — consistent with other auth pages.
 */

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  validatePassphrase,
  validatePassphraseConfirm,
  scorePassphrase,
} from "@/lib/onboarding/validation";
import { createVault } from "@/lib/crypto/session";
import { createVaultAction } from "@/lib/vault/actions";

const isConfigured =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith("https://");

interface StepBProps {
  onComplete: () => void;
  onSkip: () => void;
}

export function StepB({ onComplete, onSkip }: StepBProps) {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const strength = passphrase.length > 0 ? scorePassphrase(passphrase) : null;

  if (!isConfigured) {
    return (
      <div className="flex flex-col gap-5">
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <p className="text-sm text-amber-200">
            <strong>Supabase is not configured yet.</strong>{" "}
            Add <code className="text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your{" "}
            <code className="text-xs">.env.local</code> to enable vault creation.
          </p>
        </div>
        <Button variant="outline" type="button" onClick={onSkip}>
          Skip for now
        </Button>
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);

    const pResult = validatePassphrase(passphrase);
    const cResult = validatePassphraseConfirm(passphrase, confirm);
    setPassphraseError(pResult.error ?? null);
    setConfirmError(cResult.error ?? null);
    if (!pResult.valid || !cResult.valid) return;

    startTransition(async () => {
      try {
        // All crypto runs in the browser — passphrase never sent to server.
        const { saltB64, wrappedDekB64 } = await createVault(passphrase);
        // Send only the ciphertext and salt to the server.
        const result = await createVaultAction({ saltB64, wrappedDekB64 });
        if (result.error) {
          setServerError(result.error);
          return;
        }
        onComplete();
      } catch (err) {
        console.error("[StepB] vault creation error:", err);
        setServerError("Could not create your vault. Please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {/* Privacy notice — required by requirements §2 rule 7 */}
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3">
        <p className="text-sm text-amber-200">
          <strong>We cannot recover this passphrase.</strong> Write it down somewhere safe.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          This passphrase encrypts your vault in your browser. It never leaves your device
          and is never stored on our servers.
        </p>
      </div>

      {serverError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="vault-passphrase">Vault passphrase</Label>
        <Input
          id="vault-passphrase"
          type="password"
          autoComplete="new-password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          aria-invalid={!!passphraseError}
          aria-describedby={passphraseError ? "passphrase-error" : undefined}
          disabled={isPending}
        />
        {passphraseError && (
          <p id="passphrase-error" className="text-sm text-destructive">
            {passphraseError}
          </p>
        )}
        <p className="text-xs text-muted-foreground">Minimum 12 characters.</p>

        {/* Strength meter */}
        {strength && (
          <div aria-label={`Passphrase strength: ${strength.label}`}>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${strength.colorClass}`}
                style={{ width: `${(strength.score / 4) * 100}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{strength.label}</p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="vault-passphrase-confirm">Confirm passphrase</Label>
        <Input
          id="vault-passphrase-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={!!confirmError}
          aria-describedby={confirmError ? "confirm-error" : undefined}
          disabled={isPending}
        />
        {confirmError && (
          <p id="confirm-error" className="text-sm text-destructive">
            {confirmError}
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" type="button" onClick={onSkip} disabled={isPending}>
          Skip for now
        </Button>
        <Button type="submit" className="flex-1" disabled={isPending}>
          {isPending ? "Creating vault…" : "Set passphrase"}
        </Button>
      </div>
    </form>
  );
}
