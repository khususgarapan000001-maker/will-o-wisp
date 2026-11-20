/**
 * Will limits and input validation (requirements 1–5). Pure functions, shared
 * by the editor (plaintext notes) and /api/will (ciphertext notes).
 *
 * The server only ever sees the note as ciphertext, so it cannot count
 * characters, and neither can the database. The API bounds the ciphertext size
 * instead (maxNoteCiphertextLength); the exact 2,000-character limit is
 * enforced in the editor, where the plaintext is.
 */

import type { WillCategory, WillWish } from "@/lib/supabase/types";
import { isCategory, isWish } from "./model";

export const MAX_NOTE_CHARS = 2_000;
export const MAX_SERVICE_NAME_CHARS = 100;
export const MAX_WILL_ITEMS = 200;

export const NOTE_TOO_LONG_MESSAGE =
  "This note is longer than 2,000 characters. Please shorten it a little.";
export const WILL_CAP_MESSAGE =
  "You've reached 200 accounts, which is the most we can keep for you. Please remove one before adding another.";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export interface WillDraft {
  serviceName: string;
  category: WillCategory;
  /** null = no wish yet. */
  wish: WillWish | null;
  transferKeeperId: string | null;
  /** Plaintext note ("" = none). Editor only; never sent as plaintext. */
  notes: string;
}

export type DraftCheck = { ok: true } | { ok: false; error: string };

export function checkWillDraft(draft: WillDraft): DraftCheck {
  const name = draft.serviceName.trim();
  if (name.length === 0) {
    return { ok: false, error: "Please enter the name of the account or service." };
  }
  if ([...name].length > MAX_SERVICE_NAME_CHARS) {
    return { ok: false, error: "That name is a little long. Please keep it under 100 characters." };
  }
  if (!isCategory(draft.category)) {
    return { ok: false, error: "Please choose a category." };
  }
  if (draft.wish !== null && !isWish(draft.wish)) {
    return { ok: false, error: "Please choose one of the wishes listed." };
  }
  // The same rule as the database CHECK: transfer needs a keeper, and only transfer has one.
  if (draft.wish === "transfer" && !draft.transferKeeperId) {
    return { ok: false, error: "Please choose which keeper this account should go to." };
  }
  if (draft.wish !== "transfer" && draft.transferKeeperId) {
    return { ok: false, error: "A keeper can only be chosen when the wish is Transfer." };
  }
  if ([...draft.notes].length > MAX_NOTE_CHARS) {
    return { ok: false, error: NOTE_TOO_LONG_MESSAGE };
  }
  return { ok: true };
}

export function checkWillCap(existingCount: number): DraftCheck {
  return existingCount >= MAX_WILL_ITEMS ? { ok: false, error: WILL_CAP_MESSAGE } : { ok: true };
}

/** Upper bound (Base64 characters) of the ciphertext of a maximum-length note (4 UTF-8 bytes per char + 16-byte tag). */
export function maxNoteCiphertextLength(): number {
  return Math.ceil((MAX_NOTE_CHARS * 4 + 16) / 3) * 4;
}

/** How a write treats the encrypted note. `keep` (PUT only) leaves the stored note untouched. */
export type NotesWrite = { ciphertext: string; iv: string } | null | "keep";

export interface WillWriteInput {
  id: string;
  serviceName: string;
  category: WillCategory;
  wish: WillWish | null;
  transferToKeeperId: string | null;
  notes: NotesWrite;
}

export type WriteParse = { ok: true; value: WillWriteInput } | { ok: false; error: string };

const BAD_REQUEST = "That request didn't look right.";

/** Validates the JSON an owner's browser sends to /api/will. */
export function parseWillWrite(body: unknown, opts: { idFromPath?: string; allowKeep: boolean }): WriteParse {
  if (!body || typeof body !== "object") return { ok: false, error: BAD_REQUEST };
  const b = body as Record<string, unknown>;
  const id = opts.idFromPath ?? b.id;
  if (!isUuid(id)) return { ok: false, error: BAD_REQUEST };

  if (typeof b.serviceName !== "string") return { ok: false, error: BAD_REQUEST };
  const serviceName = b.serviceName.trim();
  const wish = b.wish === undefined ? null : b.wish;
  const transferToKeeperId = b.transferToKeeperId === undefined ? null : b.transferToKeeperId;
  if (wish !== null && !isWish(wish)) return { ok: false, error: BAD_REQUEST };
  if (transferToKeeperId !== null && !isUuid(transferToKeeperId)) return { ok: false, error: BAD_REQUEST };
  if (!isCategory(b.category)) return { ok: false, error: "Please choose a category." };

  const base = checkWillDraft({
    serviceName,
    category: b.category,
    wish,
    transferKeeperId: transferToKeeperId,
    notes: "",
  });
  if (!base.ok) return { ok: false, error: base.error };

  let notes: NotesWrite;
  const n = b.notes;
  if (n === null || n === undefined) {
    notes = null;
  } else if (n === "keep") {
    if (!opts.allowKeep) return { ok: false, error: BAD_REQUEST };
    notes = "keep";
  } else if (typeof n === "object") {
    const { ciphertext, iv } = n as Record<string, unknown>;
    if (
      typeof ciphertext !== "string" ||
      !BASE64_RE.test(ciphertext) ||
      ciphertext.length > maxNoteCiphertextLength()
    ) {
      return { ok: false, error: NOTE_TOO_LONG_MESSAGE };
    }
    // 12 random bytes => exactly 16 Base64 characters, no padding.
    if (typeof iv !== "string" || !/^[A-Za-z0-9+/]{16}$/.test(iv)) {
      return { ok: false, error: BAD_REQUEST };
    }
    notes = { ciphertext, iv };
  } else {
    return { ok: false, error: BAD_REQUEST };
  }

  return {
    ok: true,
    value: { id, serviceName, category: b.category, wish, transferToKeeperId, notes },
  };
}

/** Validates the body of POST /api/will/reorder: a duplicate-free list of ids. */
export function parseReorder(body: unknown): { ok: true; ids: string[] } | { ok: false; error: string } {
  const ids = body && typeof body === "object" ? (body as { ids?: unknown }).ids : null;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_WILL_ITEMS || !ids.every(isUuid)) {
    return { ok: false, error: BAD_REQUEST };
  }
  if (new Set(ids.map((i) => i.toLowerCase())).size !== ids.length) return { ok: false, error: BAD_REQUEST };
  return { ok: true, ids };
}
