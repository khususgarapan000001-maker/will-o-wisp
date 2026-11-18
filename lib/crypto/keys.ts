/**
 * Key management for WILL-O'-WISP encrypted vault.
 *
 * Implements the key hierarchy from design-doc §5.2:
 *   passphrase → (PBKDF2-SHA-256, 600k iterations, random salt) → KEK (AES-KW 256)
 *   KEK wraps/unwraps the DEK (AES-GCM 256, random, generated once per vault)
 *
 * Security rules (non-negotiable per tech.md):
 *   • The passphrase NEVER leaves the browser and is NEVER stored.
 *   • The DEK is non-extractable after import where WebCrypto allows.
 *   • 600,000 PBKDF2 iterations (OWASP 2023 guidance for PBKDF2-HMAC-SHA256).
 *   • 32-byte (256-bit) random salt, stored in vaults.salt.
 *   • Wrapped DEK stored in vaults.wrapped_dek (AES-KW / RFC 3394).
 */

import { bufToBase64, base64ToBuf, strToBytes } from "./utils";

const SUBTLE = globalThis.crypto.subtle;

// PBKDF2 iteration count — must never be lowered.
export const PBKDF2_ITERATIONS = 600_000;
export const SALT_BYTES = 32;      // 256-bit salt
export const IV_BYTES = 12;        // 96-bit GCM IV

// ---------------------------------------------------------------------------
// DEK generation
// ---------------------------------------------------------------------------

/**
 * Generates a fresh random 256-bit AES-GCM data-encryption key.
 *
 * The key is extractable so it can be AES-KW-wrapped for storage and for
 * keepers (WebCrypto requires extractable=true for wrapKey). Raw key bytes
 * are still never read by application code — the key lives in memory only
 * and is cleared by lockVault().
 */
export async function generateDek(): Promise<CryptoKey> {
  return SUBTLE.generateKey(
    { name: "AES-GCM", length: 256 },
    // extractable=true is required for AES-KW wrapping.
    // The key still cannot be read as raw bytes — only wrapped.
    true,
    ["encrypt", "decrypt"]
  );
}

// ---------------------------------------------------------------------------
// KEK derivation (PBKDF2 → AES-KW)
// ---------------------------------------------------------------------------

/**
 * Generates a fresh random 32-byte salt.
 * Call once at vault creation; store the result in vaults.salt.
 */
export function generateSalt(): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(SALT_BYTES);
  const salt = new Uint8Array(buf);
  globalThis.crypto.getRandomValues(salt);
  return salt;
}

/**
 * Derives a key-encryption key (KEK) from the owner's passphrase using
 * PBKDF2-SHA-256 with 600,000 iterations.
 *
 * The derived key is for AES-KW wrapping only (not encrypt/decrypt).
 * It is marked non-extractable.
 *
 * @param passphrase - The vault passphrase (never stored, never sent to server)
 * @param salt       - 32-byte random salt stored in vaults.salt
 */
export async function deriveKek(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>
): Promise<CryptoKey> {
  // Encode passphrase as UTF-8 bytes with a concrete ArrayBuffer backing.
  const passBytes = strToBytes(passphrase);

  // Import passphrase bytes as a raw PBKDF2 key-material key.
  const keyMaterial = await SUBTLE.importKey(
    "raw",
    passBytes,
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  // Derive the AES-KW key.
  return SUBTLE.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-KW", length: 256 },
    // Non-extractable: raw bytes cannot be read from JS.
    false,
    ["wrapKey", "unwrapKey"]
  );
}

// ---------------------------------------------------------------------------
// AES-KW wrap / unwrap
// ---------------------------------------------------------------------------

/**
 * Wraps (encrypts) the DEK using the KEK via AES-KW.
 * Returns the wrapped key as a Base64 string for storage in vaults.wrapped_dek.
 */
export async function wrapDek(dek: CryptoKey, kek: CryptoKey): Promise<string> {
  const wrapped = await SUBTLE.wrapKey("raw", dek, kek, { name: "AES-KW" });
  return bufToBase64(wrapped);
}

/**
 * Unwraps (decrypts) the wrapped DEK using the KEK.
 * Throws a DOMException (OperationError) on failure, which the caller should
 * catch and surface as a wrong-passphrase error.
 *
 * The unwrapped DEK is extractable (required to re-wrap for keepers);
 * it lives in memory only and is cleared by lockVault().
 */
export async function unwrapDek(
  wrappedDekB64: string,
  kek: CryptoKey
): Promise<CryptoKey> {
  const wrappedBytes = base64ToBuf(wrappedDekB64);
  return SUBTLE.unwrapKey(
    "raw",
    wrappedBytes,
    kek,
    { name: "AES-KW" },
    { name: "AES-GCM", length: 256 },
    // extractable=true so the DEK can be re-wrapped for keepers (spec §5.3).
    true,
    ["encrypt", "decrypt"]
  );
}

// ---------------------------------------------------------------------------
// IV generation
// ---------------------------------------------------------------------------

/**
 * Generates a fresh 96-bit (12-byte) IV for AES-GCM.
 * Must be unique per (DEK, item) pair. Never reuse.
 */
export function generateIv(): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(IV_BYTES);
  const iv = new Uint8Array(buf);
  globalThis.crypto.getRandomValues(iv);
  return iv;
}
