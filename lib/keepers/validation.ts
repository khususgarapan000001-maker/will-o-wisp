/** Input validation for keeper invites and keeper account creation. */

export interface InviteInput {
  name: string;
  email: string;
  relationship: string | null;
}

export type InviteValidation =
  | { ok: true; value: InviteInput }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateInvite(raw: {
  name?: unknown;
  email?: unknown;
  relationship?: unknown;
}): InviteValidation {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  const relationshipRaw =
    typeof raw.relationship === "string" ? raw.relationship.trim() : "";

  if (name.length < 1 || name.length > 100) {
    return { ok: false, error: "Please add their name (up to 100 characters)." };
  }
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return { ok: false, error: "That email address doesn't look quite right." };
  }
  if (relationshipRaw.length > 100) {
    return { ok: false, error: "Keep the relationship short (up to 100 characters)." };
  }
  return {
    ok: true,
    value: { name, email, relationship: relationshipRaw === "" ? null : relationshipRaw },
  };
}

export function validateKeeperPassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length < 8) {
    return "Please choose a password of at least 8 characters.";
  }
  if (password.length > 200) return "That password is a little too long.";
  return null;
}

export const DECISION_NOTE_MAX = 500;

export function normalizeNote(note: unknown): string | null {
  if (typeof note !== "string") return null;
  const trimmed = note.trim().slice(0, DECISION_NOTE_MAX);
  return trimmed === "" ? null : trimmed;
}
