# Feature: Encrypted Vault — Requirements

> **PREP-ONLY DRAFT** for Kiroween 2026. No code exists yet; this spec is to
> be executed through the authenticated Kiro CLI during the real build.

## Introduction

The vault is the heart of WILL-O'-WISP: end-to-end encrypted storage for
messages, credential pointers, and instructions. The server never sees
plaintext. Encryption is WebCrypto AES-GCM in the browser; keys live in
memory only.

## Requirements

### 1. Vault creation (see design-doc §5.2)
1. WHEN the owner creates a vault passphrase THEN the browser generates a
   random 256-bit DEK, derives a KEK via PBKDF2-SHA-256 (600k iterations,
   random 32-byte salt), wraps the DEK with AES-KW, and stores only
   `wrapped_dek` + `salt` in `vaults`.
2. WHEN the vault is created THEN no key material, passphrase, or plaintext
   is sent to the server (verifiable in the network tab).

### 2. Unlock / lock
3. WHEN the owner enters the correct passphrase THEN the browser unwraps the
   DEK and the vault unlocks for the session.
4. WHEN the owner enters a wrong passphrase THEN unlock fails with a gentle
   error and no partial decryption is shown.
5. WHEN the owner logs out or closes the tab THEN all key material is cleared
   from memory.
6. WHEN the vault is locked THEN vault pages show only the unlock screen —
   no ciphertext, titles, or metadata leak into the UI.

### 3. Items (CRUD)
7. WHEN the owner saves an item THEN the browser encrypts title + body with
   AES-GCM (fresh 96-bit IV per item, AAD = `owner_id || item_id`) and only
   ciphertext + IV are sent to the server.
8. WHEN the owner opens the vault THEN items are decrypted in the browser
   and displayed; decryption failure of one item does not break the others.
9. WHEN the owner edits an item THEN it is re-encrypted with a fresh IV.
10. WHEN the owner deletes an item THEN its row is hard-deleted from the DB.
11. WHEN the owner assigns an item to a specific keeper THEN only that keeper
    sees it after release (`recipient_keeper_id`).

### 4. Item kinds
12. WHEN creating an item THEN the owner picks a kind: `message`,
    `credential_pointer`, or `instruction` — each with tailored placeholder
    text and an icon.
13. WHEN creating a `credential_pointer` THEN the UI reminds the owner: "Store
    a pointer or hint, not the live password itself."

### 5. Keeper key provisioning (see design-doc §5.3)
14. WHEN a keeper accepts an invite THEN their browser generates an ECDH P-256
    key pair; the public key is uploaded, the private key stays in their
    browser (IndexedDB, non-extractable).
15. WHEN the owner has an unlocked vault and a keeper has a public key THEN
    the owner's browser wraps the DEK for that keeper (ECDH + HKDF) and
    stores it in `vaults.wrapped_dek_for_keepers`.
16. WHEN a release is NOT confirmed THEN a keeper cannot read
    `wrapped_dek_for_keepers` (enforced by RLS).

## Out of scope
- File attachments in the vault (text only for the hackathon).
- Passphrase change / DEK rotation — out of scope; note as a known limitation
  in the README.
