"use client";

/**
 * Step (b) — Vault passphrase creation.
 *
 * UI and validation only. The actual crypto operations (PBKDF2 key derivation,
 * DEK generation, AES-KW wrapping) are implemented in the encrypted-vault spec
 * (Spec 2, lib/crypto/). This step records itself as "shown" so the dashboard
 * checklist can flag it as incomplete until Spec 2 is integrated.
 *
 * TODO(spec-2): When lib/crypto/{keys,encrypt,decrypt}.ts exist, replace the
 * placeholder `onComplete()` call below with the real vault-creation flow:
 *   1. deriveKek(passphrase, salt)
 *   2. generateDek()
 *   3. wrapDek(dek, kek)
 *   4. POST to /api/vault (or server action) to persist { salt, wrapped_dek }
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  validatePassphrase,
  validatePassphraseConfirm,
  scorePassphrase,
} from "@/lib/onboarding/validation";

interface StepBProps {
  onComplete: () => void;
  onSkip: () => void;
}

export function StepB({ onComplete, onSkip }: StepBProps) {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const strength = passphrase.length > 0 ? scorePassphrase(passphrase) : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pResult = validatePassphrase(passphrase);
    const cResult = validatePassphraseConfirm(passphrase, confirm);

    setPassphraseError(pResult.error ?? null);
    setConfirmError(cResult.error ?? null);

    if (!pResult.valid || !cResult.valid) return;

    // TODO(spec-2): run the real crypto vault creation here before calling onComplete.
    // For now, record step as pending-vault and advance so the user can finish onboarding.
    onComplete();
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
        />
        {confirmError && (
          <p id="confirm-error" className="text-sm text-destructive">
            {confirmError}
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" type="button" onClick={onSkip}>
          Skip for now
        </Button>
        <Button type="submit" className="flex-1">
          Set passphrase
        </Button>
      </div>
    </form>
  );
}
