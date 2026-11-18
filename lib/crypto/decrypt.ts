/**
 * AES-GCM decryption for vault items (design-doc §5.2).
 *
 * Throws DecryptError on authentication failure (wrong key, tampered
 * ciphertext, wrong AAD). The vault UI catches this per-item and shows
 * "This item couldn't be decrypted" without breaking the rest of the list.
 */

import { base64ToBuf, bytesToStr, strToBytes, concatBytes } from "./utils";

const SUBTLE = globalThis.crypto.subtle;

/** Thrown when AES-GCM authentication fails (wrong key, tampered data, wrong AAD). */
export class DecryptError extends Error {
  constructor(message = "Decryption failed") {
    super(message);
    this.name = "DecryptError";
  }
}

/**
 * Decrypts a vault item's ciphertext.
 *
 * @param dek           - The in-memory DEK
 * @param ownerId       - The vault owner's UUID (must match the value used at encrypt time)
 * @param itemId        - The vault item's UUID (must match the value used at encrypt time)
 * @param ciphertextB64 - Base64-encoded ciphertext
 * @param ivB64         - Base64-encoded 12-byte IV
 * @throws DecryptError if authentication fails (wrong key, tamper, wrong IDs)
 */
export async function decryptItem(
  dek: CryptoKey,
  ownerId: string,
  itemId: string,
  ciphertextB64: string,
  ivB64: string
): Promise<string> {
  const aad = concatBytes(strToBytes(ownerId), strToBytes(itemId));
  const iv = base64ToBuf(ivB64);
  const ciphertext = base64ToBuf(ciphertextB64);

  try {
    const plaintextBuf = await SUBTLE.decrypt(
      { name: "AES-GCM", iv, additionalData: aad },
      dek,
      ciphertext
    );
    return bytesToStr(new Uint8Array(plaintextBuf));
  } catch {
    // WebCrypto throws a DOMException (OperationError) on auth failure.
    // We re-throw as a DecryptError so callers don't need to know the
    // WebCrypto error type.
    throw new DecryptError();
  }
}
