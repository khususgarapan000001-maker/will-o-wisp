/**
 * tests/unit/crypto.test.ts
 *
 * Unit tests (tasks 6.1) and property-based tests (task 6.2) for lib/crypto/.
 *
 * Node 24 provides globalThis.crypto (WebCrypto) natively, so no polyfill
 * is needed and all tests run in the default "node" Vitest environment.
 *
 * PBT uses fast-check with numRuns: 100 (design-doc §9.1 minimum locally).
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ---- crypto module imports ----
import {
  generateDek,
  generateSalt,
  generateIv,
  deriveKek,
  wrapDek,
  unwrapDek,
  PBKDF2_ITERATIONS,
  SALT_BYTES,
  IV_BYTES,
} from "@/lib/crypto/keys";
import { encryptItem } from "@/lib/crypto/encrypt";
import { decryptItem, DecryptError } from "@/lib/crypto/decrypt";
import { bufToBase64, base64ToBuf, strToBytes, concatBytes } from "@/lib/crypto/utils";
import {
  createVault,
  unlockVault,
  lockVault,
  getDek,
  isVaultUnlocked,
  WrongPassphraseError,
} from "@/lib/crypto/session";

// ============================================================
// Helpers
// ============================================================

/** Deterministic owner/item IDs for tests that need stable AAD. */
const OWNER_ID = "00000000-0000-0000-0000-aaaaaaaaaaaa";
const ITEM_ID  = "00000000-0000-0000-0000-bbbbbbbbbbbb";

/** Make a fresh DEK + KEK from a passphrase for round-trip tests. */
async function makeKeypair(passphrase = "test-passphrase-long-enough") {
  const salt = generateSalt();
  const dek  = await generateDek();
  const kek  = await deriveKek(passphrase, salt);
  return { dek, kek, salt };
}

// ============================================================
// 1. Base64 utils
// ============================================================

describe("bufToBase64 / base64ToBuf", () => {
  it("round-trips a known byte sequence", () => {
    const bytes = new Uint8Array(new ArrayBuffer(4));
    bytes.set([0x00, 0xff, 0x10, 0xab]);
    const b64  = bufToBase64(bytes);
    const back = base64ToBuf(b64);
    expect(back).toEqual(bytes);
  });

  it("produces a string with no null bytes or newlines", () => {
    const bytes = new Uint8Array(new ArrayBuffer(32));
    globalThis.crypto.getRandomValues(bytes);
    const b64 = bufToBase64(bytes);
    expect(b64).not.toContain("\n");
    expect(b64).not.toContain("\0");
  });
});

// ============================================================
// 2. Key generation
// ============================================================

describe("generateDek", () => {
  it("produces an AES-GCM CryptoKey", async () => {
    const dek = await generateDek();
    expect(dek.type).toBe("secret");
    expect(dek.algorithm).toMatchObject({ name: "AES-GCM" });
    expect((dek.algorithm as AesKeyAlgorithm).length).toBe(256);
  });

  it("produces a different key each time (not deterministic)", async () => {
    const a = await generateDek();
    const b = await generateDek();
    // Export both and compare (extractable=true is required for this test).
    const aRaw = await globalThis.crypto.subtle.exportKey("raw", a);
    const bRaw = await globalThis.crypto.subtle.exportKey("raw", b);
    expect(bufToBase64(aRaw)).not.toBe(bufToBase64(bRaw));
  });
});

describe("generateSalt", () => {
  it(`produces ${SALT_BYTES} bytes`, () => {
    const salt = generateSalt();
    expect(salt.byteLength).toBe(SALT_BYTES);
  });

  it("produces different values each call", () => {
    const a = bufToBase64(generateSalt());
    const b = bufToBase64(generateSalt());
    expect(a).not.toBe(b);
  });
});

describe("generateIv", () => {
  it(`produces ${IV_BYTES} bytes`, () => {
    const iv = generateIv();
    expect(iv.byteLength).toBe(IV_BYTES);
  });

  it("IV uniqueness: 100 generated IVs are all distinct", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const iv = bufToBase64(generateIv());
      expect(seen.has(iv)).toBe(false);
      seen.add(iv);
    }
  });
});

// ============================================================
// 3. PBKDF2 key derivation — determinism
// ============================================================

describe("deriveKek — PBKDF2 determinism", () => {
  it("derives the same KEK from the same passphrase + salt", async () => {
    const passphrase = "my-vault-passphrase-lantern";
    const salt = generateSalt();

    const kek1 = await deriveKek(passphrase, salt);
    const kek2 = await deriveKek(passphrase, salt);

    // We can't export non-extractable KEKs directly, but we can verify
    // determinism by wrapping the same DEK with both and unwrapping.
    const dek = await generateDek();
    const wrapped1 = await wrapDek(dek, kek1);
    const wrapped2 = await wrapDek(dek, kek2);
    // AES-KW is deterministic for the same input — both wrapped forms must match.
    expect(wrapped1).toBe(wrapped2);
  });

  it(`uses ${PBKDF2_ITERATIONS} iterations (constant check)`, () => {
    expect(PBKDF2_ITERATIONS).toBe(600_000);
  });

  it("different salts produce different KEKs", async () => {
    const passphrase = "same-passphrase";
    const salt1 = generateSalt();
    const salt2 = generateSalt();

    const kek1 = await deriveKek(passphrase, salt1);
    const kek2 = await deriveKek(passphrase, salt2);

    const dek = await generateDek();
    const wrapped1 = await wrapDek(dek, kek1);
    const wrapped2 = await wrapDek(dek, kek2);
    // Different salts → different KEKs → different wrapped forms.
    expect(wrapped1).not.toBe(wrapped2);
  });

  it("different passphrases produce different KEKs", async () => {
    const salt = generateSalt();
    const kek1 = await deriveKek("passphrase-one-lantern", salt);
    const kek2 = await deriveKek("passphrase-two-lantern", salt);

    const dek = await generateDek();
    const w1 = await wrapDek(dek, kek1);
    const w2 = await wrapDek(dek, kek2);
    expect(w1).not.toBe(w2);
  });
});

// ============================================================
// 4. AES-KW wrap / unwrap
// ============================================================

describe("wrapDek / unwrapDek", () => {
  it("wrap → unwrap round-trip yields a usable DEK", async () => {
    const { dek, kek } = await makeKeypair();
    const wrapped = await wrapDek(dek, kek);
    const unwrapped = await unwrapDek(wrapped, kek);

    // Verify the unwrapped key encrypts/decrypts correctly.
    const plaintext = "round-trip test";
    const { ciphertext, iv } = await encryptItem(unwrapped, OWNER_ID, ITEM_ID, plaintext);
    const result = await decryptItem(unwrapped, OWNER_ID, ITEM_ID, ciphertext, iv);
    expect(result).toBe(plaintext);
  });

  it("unwrapping with wrong KEK throws", async () => {
    const { dek, kek } = await makeKeypair("correct-passphrase-long");
    const { kek: wrongKek } = await makeKeypair("wrong-passphrase-long!");
    const wrapped = await wrapDek(dek, kek);

    await expect(unwrapDek(wrapped, wrongKek)).rejects.toThrow();
  });
});

// ============================================================
// 5. AES-GCM encrypt / decrypt
// ============================================================

describe("encryptItem / decryptItem — round-trip", () => {
  it("decrypts to the original plaintext", async () => {
    const dek = await generateDek();
    const plaintext = "Hello from the vault 🕯";
    const { ciphertext, iv } = await encryptItem(dek, OWNER_ID, ITEM_ID, plaintext);
    const result = await decryptItem(dek, OWNER_ID, ITEM_ID, ciphertext, iv);
    expect(result).toBe(plaintext);
  });

  it("empty string round-trips correctly", async () => {
    const dek = await generateDek();
    const { ciphertext, iv } = await encryptItem(dek, OWNER_ID, ITEM_ID, "");
    const result = await decryptItem(dek, OWNER_ID, ITEM_ID, ciphertext, iv);
    expect(result).toBe("");
  });

  it("produces different ciphertexts for the same plaintext (IV uniqueness)", async () => {
    const dek = await generateDek();
    const a = await encryptItem(dek, OWNER_ID, ITEM_ID, "same text");
    const b = await encryptItem(dek, OWNER_ID, ITEM_ID, "same text");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("ciphertext is Base64 (no plaintext leakage)", async () => {
    const dek = await generateDek();
    const plaintext = "super secret message";
    const { ciphertext } = await encryptItem(dek, OWNER_ID, ITEM_ID, plaintext);
    // The ciphertext must not contain the plaintext literally.
    expect(ciphertext).not.toContain(plaintext);
    // Must be valid Base64.
    expect(() => base64ToBuf(ciphertext)).not.toThrow();
  });
});

describe("encryptItem / decryptItem — wrong-key failure", () => {
  it("decryption with wrong DEK throws DecryptError", async () => {
    const dek = await generateDek();
    const wrongDek = await generateDek();
    const { ciphertext, iv } = await encryptItem(dek, OWNER_ID, ITEM_ID, "secret");
    await expect(decryptItem(wrongDek, OWNER_ID, ITEM_ID, ciphertext, iv))
      .rejects.toThrow(DecryptError);
  });
});

describe("encryptItem / decryptItem — AAD binding", () => {
  it("decryption fails with wrong owner_id", async () => {
    const dek = await generateDek();
    const { ciphertext, iv } = await encryptItem(dek, OWNER_ID, ITEM_ID, "secret");
    await expect(
      decryptItem(dek, "wrong-owner-id", ITEM_ID, ciphertext, iv)
    ).rejects.toThrow(DecryptError);
  });

  it("decryption fails with wrong item_id", async () => {
    const dek = await generateDek();
    const { ciphertext, iv } = await encryptItem(dek, OWNER_ID, ITEM_ID, "secret");
    await expect(
      decryptItem(dek, OWNER_ID, "wrong-item-id", ciphertext, iv)
    ).rejects.toThrow(DecryptError);
  });

  it("decryption fails if ciphertext is transplanted to a different item", async () => {
    const dek = await generateDek();
    const ITEM_A = "00000000-0000-0000-0000-000000000001";
    const ITEM_B = "00000000-0000-0000-0000-000000000002";
    const { ciphertext, iv } = await encryptItem(dek, OWNER_ID, ITEM_A, "secret");
    // Trying to decrypt item A's ciphertext as if it were item B must fail.
    await expect(
      decryptItem(dek, OWNER_ID, ITEM_B, ciphertext, iv)
    ).rejects.toThrow(DecryptError);
  });
});

describe("encryptItem / decryptItem — tamper detection", () => {
  it("decryption fails when any ciphertext byte is flipped", async () => {
    const dek = await generateDek();
    const { ciphertext, iv } = await encryptItem(dek, OWNER_ID, ITEM_ID, "tamper test");
    // Flip the first byte of the ciphertext.
    const bytes = base64ToBuf(ciphertext);
    bytes[0] ^= 0xff;
    const tampered = bufToBase64(bytes);
    await expect(
      decryptItem(dek, OWNER_ID, ITEM_ID, tampered, iv)
    ).rejects.toThrow(DecryptError);
  });

  it("decryption fails when the IV is changed", async () => {
    const dek = await generateDek();
    const { ciphertext } = await encryptItem(dek, OWNER_ID, ITEM_ID, "iv tamper test");
    const wrongIv = bufToBase64(generateIv()); // fresh random IV
    await expect(
      decryptItem(dek, OWNER_ID, ITEM_ID, ciphertext, wrongIv)
    ).rejects.toThrow(DecryptError);
  });
});

// ============================================================
// 6. Session store
// ============================================================

describe("session: createVault / unlockVault / lockVault", () => {
  it("createVault unlocks the vault and returns storable values", async () => {
    lockVault(); // ensure clean state
    const { saltB64, wrappedDekB64 } = await createVault("correct-passphrase-long");
    expect(isVaultUnlocked()).toBe(true);
    expect(getDek()).not.toBeNull();
    expect(saltB64).toBeTruthy();
    expect(wrappedDekB64).toBeTruthy();
    lockVault();
  });

  it("unlockVault with correct passphrase succeeds", async () => {
    lockVault();
    const { saltB64, wrappedDekB64 } = await createVault("my-lantern-passphrase");
    lockVault();
    expect(isVaultUnlocked()).toBe(false);

    await unlockVault("my-lantern-passphrase", saltB64, wrappedDekB64);
    expect(isVaultUnlocked()).toBe(true);
    lockVault();
  });

  it("unlockVault with wrong passphrase throws WrongPassphraseError", async () => {
    lockVault();
    const { saltB64, wrappedDekB64 } = await createVault("correct-passphrase-xx");
    lockVault();

    await expect(
      unlockVault("wrong-passphrase-xxxx", saltB64, wrappedDekB64)
    ).rejects.toThrow(WrongPassphraseError);
    expect(isVaultUnlocked()).toBe(false);
  });

  it("lockVault clears the DEK", async () => {
    await createVault("temp-passphrase-long!");
    expect(isVaultUnlocked()).toBe(true);
    lockVault();
    expect(isVaultUnlocked()).toBe(false);
    expect(getDek()).toBeNull();
  });

  it("DEK from createVault encrypts/decrypts correctly end-to-end", async () => {
    lockVault();
    await createVault("end-to-end-passphrase");
    const dek = getDek()!;
    const plaintext = JSON.stringify({ title: "My title", body: "My body" });
    const { ciphertext, iv } = await encryptItem(dek, OWNER_ID, ITEM_ID, plaintext);
    const decrypted = await decryptItem(dek, OWNER_ID, ITEM_ID, ciphertext, iv);
    expect(decrypted).toBe(plaintext);
    lockVault();
  });
});

// ============================================================
// 7. concatBytes AAD construction
// ============================================================

describe("concatBytes", () => {
  it("produces owner_id‖item_id correctly", () => {
    const owner = strToBytes("owner");
    const item  = strToBytes("item");
    const combined = concatBytes(owner, item);
    expect(combined.byteLength).toBe(owner.byteLength + item.byteLength);
    // First n bytes must equal owner.
    expect(combined.slice(0, owner.byteLength)).toEqual(owner);
    // Remaining bytes must equal item.
    expect(combined.slice(owner.byteLength)).toEqual(item);
  });
});

// ============================================================
// 8. Property-based tests (fast-check, ≥100 iterations)
// ============================================================

describe("PBT: encrypt/decrypt round-trip for arbitrary strings", () => {
  it("decrypt(encrypt(m)) === m for any string", async () => {
    const dek = await generateDek();

    await fc.assert(
      fc.asyncProperty(fc.string(), async (message) => {
        const { ciphertext, iv } = await encryptItem(dek, OWNER_ID, ITEM_ID, message);
        const result = await decryptItem(dek, OWNER_ID, ITEM_ID, ciphertext, iv);
        return result === message;
      }),
      { numRuns: 100 }
    );
  });

  it("decrypt(encrypt(m)) === m for arbitrary Unicode strings", async () => {
    const dek = await generateDek();

    await fc.assert(
      fc.asyncProperty(fc.string({ unit: "grapheme" }), async (message) => {
        const { ciphertext, iv } = await encryptItem(dek, OWNER_ID, ITEM_ID, message);
        const result = await decryptItem(dek, OWNER_ID, ITEM_ID, ciphertext, iv);
        return result === message;
      }),
      { numRuns: 100 }
    );
  });
});

describe("PBT: tamper detection — any single byte flip breaks authentication", () => {
  it("flipping any byte of ciphertext fails decryption", async () => {
    const dek = await generateDek();

    await fc.assert(
      fc.asyncProperty(
        // Non-empty strings only (empty string ciphertext is very short).
        fc.string({ minLength: 1, maxLength: 200 }),
        async (message) => {
          const { ciphertext, iv } = await encryptItem(dek, OWNER_ID, ITEM_ID, message);
          const bytes = base64ToBuf(ciphertext);
          if (bytes.byteLength === 0) return true; // skip pathological case
          // Pick a random byte to flip.
          const idx = Math.floor(Math.random() * bytes.byteLength);
          bytes[idx] ^= 0x01;
          const tampered = bufToBase64(bytes);
          try {
            await decryptItem(dek, OWNER_ID, ITEM_ID, tampered, iv);
            return false; // should NOT succeed
          } catch (err) {
            return err instanceof DecryptError;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("replacing the IV breaks decryption", async () => {
    const dek = await generateDek();

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        async (message) => {
          const { ciphertext } = await encryptItem(dek, OWNER_ID, ITEM_ID, message);
          const wrongIv = bufToBase64(generateIv()); // random different IV
          try {
            await decryptItem(dek, OWNER_ID, ITEM_ID, ciphertext, wrongIv);
            return false;
          } catch (err) {
            return err instanceof DecryptError;
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("PBT: AAD binding — wrong IDs always fail", () => {
  it("wrong owner_id always causes DecryptError", async () => {
    const dek = await generateDek();

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),  // wrong owner — different string
        async (message, wrongOwner) => {
          if (wrongOwner === OWNER_ID) return true; // skip coincidental matches
          const { ciphertext, iv } = await encryptItem(dek, OWNER_ID, ITEM_ID, message);
          try {
            await decryptItem(dek, wrongOwner, ITEM_ID, ciphertext, iv);
            return false;
          } catch (err) {
            return err instanceof DecryptError;
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
