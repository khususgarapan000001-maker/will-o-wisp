/**
 * Seal / open a will note with the vault's crypto module (lib/crypto); there is
 * no second crypto module. A note is ONE plaintext string under ONE fresh IV:
 * encryptItem() draws a new IV on every call, so an edit (which seals again)
 * never reuses an IV. AAD = owner_id || will_item_id. Browser only; the server
 * never sees the plaintext.
 */

import { encryptItem, type EncryptedItem } from "@/lib/crypto/encrypt";
import { decryptItem } from "@/lib/crypto/decrypt";

export function sealWillNote(
  dek: CryptoKey,
  ownerId: string,
  itemId: string,
  note: string
): Promise<EncryptedItem> {
  return encryptItem(dek, ownerId, itemId, note);
}

/** Throws DecryptError when the key, IDs or ciphertext do not match. */
export function openWillNote(
  dek: CryptoKey,
  ownerId: string,
  itemId: string,
  notesCiphertext: string,
  iv: string
): Promise<string> {
  return decryptItem(dek, ownerId, itemId, notesCiphertext, iv);
}
