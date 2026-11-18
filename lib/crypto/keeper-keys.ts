/**
 * Keeper key provisioning (design-doc §5.3).
 *
 * When a keeper accepts an invite:
 *   1. Their browser generates an ECDH P-256 key pair.
 *   2. The public key is uploaded to keepers.public_key (Base64).
 *   3. The private key is stored in IndexedDB (non-extractable) — handled
 *      by the keeper invite flow in Spec 4.
 *
 * When the owner has an unlocked vault and the keeper has a public key:
 *   1. The owner's browser performs ECDH key agreement (owner ephemeral
 *      private key × keeper public key → shared secret).
 *   2. HKDF-SHA-256 derives a 256-bit AES-KW wrapping key from the shared secret.
 *   3. The DEK is wrapped with that wrapping key.
 *   4. The ephemeral public key + wrapped DEK are stored in
 *      vaults.wrapped_dek_for_keepers as a JSON entry.
 *   5. The keeper can only retrieve this after a confirmed release (RLS, Spec 4).
 *
 * Note: the keeper's private key management (IndexedDB persistence) is part
 * of the keeper invite UI in Spec 4. Only the owner-side wrapping is here.
 */

"use client";

import { bufToBase64, base64ToBuf, strToBytes } from "./utils";

const SUBTLE = globalThis.crypto.subtle;

// HKDF info string — identifies the purpose of the derived key.
const HKDF_INFO = strToBytes("will-o-wisp-vault-dek-wrap-v1");

// ---------------------------------------------------------------------------
// Keeper key pair generation (called in the keeper's browser)
// ---------------------------------------------------------------------------

export interface KeeperKeyPair {
  /** Base64 public key to upload to keepers.public_key */
  publicKeyB64: string;
  /** CryptoKey — store in IndexedDB (non-extractable). Never send to server. */
  privateKey: CryptoKey;
}

/**
 * Generates an ECDH P-256 key pair for a keeper.
 * The private key is non-extractable so raw bytes cannot be read from JS.
 */
export async function generateKeeperKeyPair(): Promise<KeeperKeyPair> {
  const { publicKey, privateKey } = await SUBTLE.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    // Public key is extractable (must be uploaded); private is not.
    false,
    ["deriveKey", "deriveBits"]
  );

  // Export the public key as SPKI (standard format for interchange).
  const publicKeySpki = await SUBTLE.exportKey("spki", publicKey);
  return {
    publicKeyB64: bufToBase64(publicKeySpki),
    privateKey,
  };
}

// ---------------------------------------------------------------------------
// Owner: wrap the DEK for a keeper
// ---------------------------------------------------------------------------

export interface WrappedDekForKeeper {
  /** keeper_id UUID (from keepers table) */
  keeper_id: string;
  /** Base64 AES-KW wrapped DEK (encrypted for this keeper) */
  wrapped_dek: string;
  /** Base64 ephemeral ECDH public key (owner side) — keeper needs this to unwrap */
  ephemeral_public_key: string;
  /** Base64 32-byte HKDF salt */
  kdf_salt: string;
}

/**
 * Wraps the vault DEK for a specific keeper using ECDH + HKDF.
 *
 * @param dek              - The in-memory vault DEK (must be unlocked)
 * @param keeperId         - The keeper's UUID
 * @param keeperPublicKeyB64 - The keeper's ECDH P-256 public key (Base64 SPKI)
 */
export async function wrapDekForKeeper(
  dek: CryptoKey,
  keeperId: string,
  keeperPublicKeyB64: string
): Promise<WrappedDekForKeeper> {
  // Import the keeper's public key.
  const keeperPubKey = await SUBTLE.importKey(
    "spki",
    base64ToBuf(keeperPublicKeyB64),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // Generate a fresh ephemeral ECDH key pair (owner side, one-time use).
  const ephemeral = await SUBTLE.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true, // exportable so we can upload the public key
    ["deriveKey", "deriveBits"]
  );

  // Export the ephemeral public key (keeper needs this to derive the same secret).
  const ephemeralPubSpki = await SUBTLE.exportKey("spki", ephemeral.publicKey);

  // HKDF salt — fresh random 32 bytes.
  const hkdfSaltBuf = new ArrayBuffer(32);
  const hkdfSalt = new Uint8Array(hkdfSaltBuf);
  globalThis.crypto.getRandomValues(hkdfSalt);

  // Derive the ECDH shared secret bits (256 bits = 32 bytes).
  const sharedBits = await SUBTLE.deriveBits(
    { name: "ECDH", public: keeperPubKey },
    ephemeral.privateKey,
    256
  );

  // Import shared bits as HKDF key material.
  const hkdfKeyMaterial = await SUBTLE.importKey(
    "raw",
    sharedBits,
    "HKDF",
    false,
    ["deriveKey"]
  );

  // Derive an AES-KW key from the shared secret via HKDF-SHA-256.
  const wrappingKey = await SUBTLE.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: hkdfSalt,
      info: HKDF_INFO,
    },
    hkdfKeyMaterial,
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey"]
  );

  // Wrap the DEK with the derived wrapping key.
  const wrappedDek = await SUBTLE.wrapKey("raw", dek, wrappingKey, { name: "AES-KW" });

  return {
    keeper_id: keeperId,
    wrapped_dek: bufToBase64(wrappedDek),
    ephemeral_public_key: bufToBase64(ephemeralPubSpki),
    kdf_salt: bufToBase64(hkdfSalt),
  };
}

// ---------------------------------------------------------------------------
// Keeper: unwrap the DEK after release (called in the keeper's browser, Spec 4)
// ---------------------------------------------------------------------------

/**
 * Unwraps the vault DEK using the keeper's private ECDH key.
 * Called in the keeper's browser after a confirmed release.
 *
 * @param wrappedEntry      - The entry from vaults.wrapped_dek_for_keepers
 * @param keeperPrivateKey  - The keeper's non-extractable ECDH private key (from IndexedDB)
 */
export async function unwrapDekForKeeper(
  wrappedEntry: WrappedDekForKeeper,
  keeperPrivateKey: CryptoKey
): Promise<CryptoKey> {
  // Import the owner's ephemeral public key.
  const ownerEphemeralPub = await SUBTLE.importKey(
    "spki",
    base64ToBuf(wrappedEntry.ephemeral_public_key),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // Derive the same shared secret.
  const sharedBits = await SUBTLE.deriveBits(
    { name: "ECDH", public: ownerEphemeralPub },
    keeperPrivateKey,
    256
  );

  const hkdfKeyMaterial = await SUBTLE.importKey(
    "raw",
    sharedBits,
    "HKDF",
    false,
    ["deriveKey"]
  );

  const wrappingKey = await SUBTLE.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: base64ToBuf(wrappedEntry.kdf_salt),
      info: HKDF_INFO,
    },
    hkdfKeyMaterial,
    { name: "AES-KW", length: 256 },
    false,
    ["unwrapKey"]
  );

  return SUBTLE.unwrapKey(
    "raw",
    base64ToBuf(wrappedEntry.wrapped_dek),
    wrappingKey,
    { name: "AES-KW" },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}
