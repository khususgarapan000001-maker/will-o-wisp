import { CADENCE_OPTIONS, GRACE_OPTIONS } from "./cadence.ts";

export function validateCadenceGrace(
  cadenceDays: unknown,
  graceDays: unknown
): { ok: true } | { ok: false; error: string } {
  if (!(CADENCE_OPTIONS as readonly unknown[]).includes(cadenceDays)) {
    return { ok: false, error: "Please choose a check-in rhythm of 7, 14 or 30 days." };
  }
  if (!(GRACE_OPTIONS as readonly unknown[]).includes(graceDays)) {
    return { ok: false, error: "Please choose a grace period of 7, 14 or 30 days." };
  }
  return { ok: true };
}
