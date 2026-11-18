/**
 * Pure validation helpers for the onboarding wizard.
 *
 * All functions are free of side effects and DOM dependencies so they can be
 * tested in a plain Node.js environment.
 */

// ---------------------------------------------------------------------------
// Step (a) — display name + timezone
// ---------------------------------------------------------------------------

export interface DisplayNameResult {
  valid: boolean;
  error?: string;
}

export function validateDisplayName(name: string): DisplayNameResult {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: "Display name is required." };
  }
  if (trimmed.length > 80) {
    return { valid: false, error: "Display name must be 80 characters or fewer." };
  }
  return { valid: true };
}

// A minimal IANA timezone list covering common zones. Full validation is
// handled at the DB level; this guards against obviously invalid inputs.
// The browser Intl API is authoritative in production (it supports all IANA zones).
export function validateTimezone(tz: string): { valid: boolean; error?: string } {
  if (!tz || tz.trim().length === 0) {
    return { valid: false, error: "Timezone is required." };
  }
  // Try to construct an Intl.DateTimeFormat to verify the timezone is valid.
  // We only run this check in environments that support Intl (Node 15+, all browsers).
  if (typeof Intl !== "undefined" && typeof Intl.DateTimeFormat !== "undefined") {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
    } catch {
      return { valid: false, error: `"${tz}" is not a recognised timezone.` };
    }
  }
  return { valid: true };
}

export interface StepAFields {
  displayName: string;
  timezone: string;
}

export interface StepAErrors {
  displayName?: string;
  timezone?: string;
}

export function validateStepA(fields: StepAFields): {
  valid: boolean;
  errors: StepAErrors;
} {
  const errors: StepAErrors = {};
  const nameResult = validateDisplayName(fields.displayName);
  if (!nameResult.valid) errors.displayName = nameResult.error;
  const tzResult = validateTimezone(fields.timezone);
  if (!tzResult.valid) errors.timezone = tzResult.error;
  return { valid: Object.keys(errors).length === 0, errors };
}

// ---------------------------------------------------------------------------
// Step (b) — vault passphrase (UI / strength validation only)
// NOTE: crypto operations are handled by the encrypted-vault spec (Spec 2).
// This module only validates the passphrase before the crypto module is called.
// ---------------------------------------------------------------------------

export interface PassphraseStrength {
  /** 0–4 score (0 = very weak, 4 = very strong). */
  score: number;
  /** Human-readable label for the strength meter. */
  label: string;
  /** Tailwind CSS colour class for the meter bar. */
  colorClass: string;
}

/**
 * Heuristic strength scorer — no external library.
 * Replaced by a full zxcvbn implementation when that becomes available.
 */
export function scorePassphrase(passphrase: string): PassphraseStrength {
  let score = 0;
  if (passphrase.length >= 12) score++;
  if (passphrase.length >= 20) score++;
  if (/[A-Z]/.test(passphrase)) score++;
  if (/[0-9]/.test(passphrase)) score++;
  if (/[^A-Za-z0-9]/.test(passphrase)) score++;
  // Cap at 4.
  score = Math.min(score, 4);

  const labels = ["Very weak", "Weak", "Fair", "Strong", "Very strong"];
  const colors = [
    "bg-destructive",
    "bg-orange-500",
    "bg-yellow-500",
    "bg-lime-500",
    "bg-emerald-500",
  ];
  return { score, label: labels[score], colorClass: colors[score] };
}

export interface PassphraseResult {
  valid: boolean;
  error?: string;
  strength?: PassphraseStrength;
}

export function validatePassphrase(passphrase: string): PassphraseResult {
  if (passphrase.length === 0) {
    return { valid: false, error: "Passphrase is required." };
  }
  if (passphrase.length < 12) {
    return {
      valid: false,
      error: "Passphrase must be at least 12 characters.",
      strength: scorePassphrase(passphrase),
    };
  }
  return { valid: true, strength: scorePassphrase(passphrase) };
}

export function validatePassphraseConfirm(
  passphrase: string,
  confirm: string
): { valid: boolean; error?: string } {
  if (confirm.length === 0) {
    return { valid: false, error: "Please confirm your passphrase." };
  }
  if (passphrase !== confirm) {
    return { valid: false, error: "Passphrases don't match." };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Step (c) — heartbeat cadence + grace period
// ---------------------------------------------------------------------------

export type CadenceDays = 7 | 14 | 30;
export type GraceDays = 7 | 14 | 30;

export const VALID_CADENCE_DAYS: CadenceDays[] = [7, 14, 30];
export const VALID_GRACE_DAYS: GraceDays[] = [7, 14, 30];

export interface StepCFields {
  cadenceDays: number;
  graceDays: number;
}

export interface StepCErrors {
  cadenceDays?: string;
  graceDays?: string;
}

export function validateStepC(fields: StepCFields): {
  valid: boolean;
  errors: StepCErrors;
} {
  const errors: StepCErrors = {};
  if (!(VALID_CADENCE_DAYS as number[]).includes(fields.cadenceDays)) {
    errors.cadenceDays = "Cadence must be 7, 14, or 30 days.";
  }
  if (!(VALID_GRACE_DAYS as number[]).includes(fields.graceDays)) {
    errors.graceDays = "Grace period must be 7, 14, or 30 days.";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}
