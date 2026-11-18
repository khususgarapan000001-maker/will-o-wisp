/**
 * In-memory vault key store (design-doc §5.2, design §Crypto session.ts).
 *
 * The DEK lives here — in module-level memory — and is never persisted to
 * localStorage, sessionStorage, IndexedDB, or any storage that survives a
 * tab close. Closing the tab or calling lockVault() clears the key.
 *
 * Security rules:
 *   • The DEK is NEVER serialised, logged, or sent anywhere.
 *   • lockVault() must be called on sign-out (wired in lib/auth/actions.ts).
 *   • Tab close clears the module naturally — no additional cleanup needed.
 *
 * This module is "use client" — it only runs in the browser. The session
 * store is per-tab; different tabs do NOT share key state.
 */

"use client";

import { deriveKek, generateDek, generateSalt, wrapDek, unwrapDek } from "./keys";
import { bufToBase64, base64ToBuf } from "./utils";

// ---------------------------------------------------------------------------
// In-memory store (module level — one per tab, never persisted)
// ---------------------------------------------------------------------------

let _dek: CryptoKey | null = null;

/** True when the vault is unlocked (DEK is in memory). */
export function isVaultUnlocked(): boolean {
  return _dek !== null;
}

/** Returns the in-memory DEK, or null if the vault is locked. */
export function getDek(): CryptoKey | null {
  return _dek;
}

/**
 * Clears the in-memory DEK.
 * Call on sign-out and whenever the vault should be locked.
 * Also called by the SignOutButton via the sign-out server action flow.
 */
export function lockVault(): void {
  _dek = null;
}

// ---------------------------------------------------------------------------
// Vault creation (onboarding step b)
// ---------------------------------------------------------------------------

export interface CreateVaultResult {
  /** Base64 salt to store in vaults.salt */
  saltB64: string;
  /** Base64 wrapped DEK to store in vaults.wrapped_dek */
  wrappedDekB64: string;
}

/**
 * Creates a new vault:
 *   1. Generates a fresh random DEK (AES-GCM 256).
 *   2. Generates a fresh random salt (32 bytes).
 *   3. Derives the KEK from the passphrase (PBKDF2, 600k iterations).
 *   4. Wraps the DEK with the KEK (AES-KW).
 *   5. Stores the DEK in memory so the vault is immediately unlocked.
 *
 * Returns only the values that should be persisted to the server.
 * The passphrase, DEK, and KEK are NEVER returned or stored.
 */
export async function createVault(passphrase: string): Promise<CreateVaultResult> {
  const salt = generateSalt();
  const dek = await generateDek();
  const kek = await deriveKek(passphrase, salt);
  const wrappedDekB64 = await wrapDek(dek, kek);

  // Keep the DEK in memory for immediate use.
  _dek = dek;

  return {
    saltB64: bufToBase64(salt),
    wrappedDekB64,
  };
}

// ---------------------------------------------------------------------------
// Vault unlock (returning user)
// ---------------------------------------------------------------------------

export class WrongPassphraseError extends Error {
  constructor() {
    super("The passphrase did not match. Please try again.");
    this.name = "WrongPassphraseError";
  }
}

/**
 * Unlocks the vault by unwrapping the stored DEK with a passphrase-derived KEK.
 *
 * @param passphrase   - The owner's vault passphrase (never stored)
 * @param saltB64      - vaults.salt (Base64 32-byte salt)
 * @param wrappedDekB64 - vaults.wrapped_dek (Base64 AES-KW wrapped DEK)
 * @throws WrongPassphraseError if the passphrase is incorrect
 */
export async function unlockVault(
  passphrase: string,
  saltB64: string,
  wrappedDekB64: string
): Promise<void> {
  const salt = base64ToBuf(saltB64);

  try {
    const kek = await deriveKek(passphrase, salt);
    const dek = await unwrapDek(wrappedDekB64, kek);
    _dek = dek;
  } catch {
    // Any failure (OperationError from wrong passphrase, bad data, etc.)
    // is surfaced as WrongPassphraseError. Never reveal why it failed.
    _dek = null;
    throw new WrongPassphraseError();
  }
}
