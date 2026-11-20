/**
 * Seal / open a letter with the vault's crypto module (lib/crypto). A letter is
 * ONE JSON payload {subject, body} under ONE fresh IV: encryptItem() draws a new
 * IV on every call, so an edit (which seals again) never reuses an IV.
 * Runs in the browser only; the server never sees the plaintext.
 */

import { encryptItem, type EncryptedItem } from "@/lib/crypto/encrypt";
import { decryptItem } from "@/lib/crypto/decrypt";
import type { LetterDraft } from "./validation";

export function sealLetter(
  dek: CryptoKey,
  ownerId: string,
  letterId: string,
  draft: LetterDraft
): Promise<EncryptedItem> {
  const payload = JSON.stringify({ subject: draft.subject.trim(), body: draft.body });
  return encryptItem(dek, ownerId, letterId, payload);
}

/** Throws DecryptError when the key, IDs or ciphertext do not match. */
export async function openLetter(
  dek: CryptoKey,
  ownerId: string,
  letterId: string,
  payloadCiphertext: string,
  iv: string
): Promise<LetterDraft> {
  const plain = await decryptItem(dek, ownerId, letterId, payloadCiphertext, iv);
  const parsed: unknown = JSON.parse(plain);
  const p = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  return {
    subject: typeof p.subject === "string" ? p.subject : "Untitled",
    body: typeof p.body === "string" ? p.body : "",
  };
}
