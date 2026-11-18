/**
 * AES-GCM encryption for vault items (design-doc §5.2).
 *
 * Each item gets a fresh 96-bit IV; never reuse an IV with the same key.
 * AAD = UTF-8(owner_id) ‖ UTF-8(item_id) — binds the ciphertext to this
 * specific item and owner, preventing ciphertext transplantation.
 */

import { generateIv } from "./keys";
import { bufToBase64, strToBytes, concatBytes } from "./utils";

const SUBTLE = globalThis.crypto.subtle;

export interface EncryptedItem {
  /** Base64-encoded AES-GCM ciphertext (includes the 16-byte auth tag). */
  ciphertext: string;
  /** Base64-encoded 12-byte IV. */
  iv: string;
}

/**
 * Encrypts a plaintext string for a specific vault item.
 *
 * @param dek      - The in-memory data-encryption key (AES-GCM 256)
 * @param ownerId  - The vault owner's UUID (from auth.users)
 * @param itemId   - The vault item's UUID (generated client-side before insert)
 * @param plaintext - The raw string to encrypt (title or body)
 */
export async function encryptItem(
  dek: CryptoKey,
  ownerId: string,
  itemId: string,
  plaintext: string
): Promise<EncryptedItem> {
  const iv = generateIv();
  const aad = concatBytes(strToBytes(ownerId), strToBytes(itemId));

  const ciphertextBuf = await SUBTLE.encrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    dek,
    strToBytes(plaintext)
  );

  return {
    ciphertext: bufToBase64(ciphertextBuf),
    iv: bufToBase64(iv),
  };
}
