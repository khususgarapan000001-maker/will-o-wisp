/**
 * Letter limits and input validation (requirements 11, 12). Pure functions,
 * shared by the editor (plaintext) and /api/letters (ciphertext).
 *
 * The server only ever sees ciphertext, so it cannot count characters. It
 * bounds the ciphertext size instead (see maxCiphertextLength), which is the
 * most a 10,000-character body + 200-character subject could possibly encrypt
 * to. The exact character limit is enforced in the editor, where plaintext is.
 */

import type { LetterStatus } from "@/lib/supabase/types";

export const MAX_BODY_CHARS = 10_000;
export const MAX_SUBJECT_CHARS = 200;
export const MAX_LETTERS_PER_OWNER = 50;

export const BODY_TOO_LONG_MESSAGE =
  "This letter is longer than 10,000 characters. Please shorten it a little, or split it into two letters.";
export const LETTER_CAP_MESSAGE =
  "You've reached 50 letters, which is the most we can keep for you. Please remove one you no longer need before writing another.";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export interface LetterDraft {
  subject: string;
  body: string;
}

export type DraftCheck = { ok: true } | { ok: false; error: string };

export function checkLetterDraft(draft: LetterDraft): DraftCheck {
  if (draft.subject.trim().length === 0) {
    return { ok: false, error: "Please give the letter a subject." };
  }
  if (draft.subject.length > MAX_SUBJECT_CHARS) {
    return { ok: false, error: "The subject is a little long. Please keep it under 200 characters." };
  }
  if (draft.body.trim().length === 0) {
    return { ok: false, error: "Please write something in the letter." };
  }
  // Count by UTF-16 code points the way a person counts characters.
  if ([...draft.body].length > MAX_BODY_CHARS) {
    return { ok: false, error: BODY_TOO_LONG_MESSAGE };
  }
  return { ok: true };
}

export function checkLetterCap(existingCount: number): DraftCheck {
  return existingCount >= MAX_LETTERS_PER_OWNER
    ? { ok: false, error: LETTER_CAP_MESSAGE }
    : { ok: true };
}

/**
 * Upper bound (Base64 characters) of the ciphertext of the largest legal
 * payload. A character is at most 4 UTF-8 bytes; the JSON wrapper, escaping
 * (a control character becomes 6 bytes) and the 16-byte GCM tag are covered by
 * the worst-case factors below.
 */
export function maxCiphertextLength(): number {
  const worstBytesPerChar = 6; // JSON-escaped control char: \u00XX
  const payloadBytes = (MAX_BODY_CHARS + MAX_SUBJECT_CHARS) * worstBytesPerChar + 64;
  return Math.ceil((payloadBytes + 16) / 3) * 4;
}

export interface LetterWriteInput {
  id: string;
  recipientKeeperId: string;
  payloadCiphertext: string;
  iv: string;
  status: LetterStatus;
}

export type WriteParse =
  | { ok: true; value: LetterWriteInput }
  | { ok: false; error: string };

const BAD_REQUEST = "That request didn't look right.";

/** Validates the JSON an owner's browser sends to /api/letters. */
export function parseLetterWrite(body: unknown, idFromPath?: string): WriteParse {
  if (!body || typeof body !== "object") return { ok: false, error: BAD_REQUEST };
  const b = body as Record<string, unknown>;
  const id = idFromPath ?? b.id;
  if (!isUuid(id)) return { ok: false, error: BAD_REQUEST };
  if (!isUuid(b.recipientKeeperId)) {
    return { ok: false, error: "Please choose who this letter is for." };
  }
  if (b.status !== "draft" && b.status !== "final") return { ok: false, error: BAD_REQUEST };
  const ct = b.payloadCiphertext;
  const iv = b.iv;
  if (typeof ct !== "string" || !BASE64_RE.test(ct) || ct.length > maxCiphertextLength()) {
    return { ok: false, error: BODY_TOO_LONG_MESSAGE };
  }
  // 12 random bytes => exactly 16 Base64 characters, no padding.
  if (typeof iv !== "string" || !/^[A-Za-z0-9+/]{16}$/.test(iv)) {
    return { ok: false, error: BAD_REQUEST };
  }
  return {
    ok: true,
    value: { id, recipientKeeperId: b.recipientKeeperId, payloadCiphertext: ct, iv, status: b.status },
  };
}
