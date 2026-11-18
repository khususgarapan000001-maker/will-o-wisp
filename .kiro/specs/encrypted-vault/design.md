# Feature: Encrypted Vault — Design

> **PREP-ONLY DRAFT** for Kiroween 2026. No code exists yet; this spec is to
> be executed through the authenticated Kiro CLI during the real build.

## Overview

All crypto lives in `lib/crypto/` and runs in the browser via WebCrypto.
The server stores only ciphertext, wrapped keys, salts, and IVs. The key
hierarchy (passphrase → KEK → DEK → items) is defined in design-doc §5.2;
keeper access via ECDH is defined in §5.3.

## Modules

| Module | Responsibility |
|---|---|
| `lib/crypto/keys.ts` | DEK generation, PBKDF2 KEK derivation, AES-KW wrap/unwrap, ECDH key-pair generation, HKDF wrapping-key derivation |
| `lib/crypto/encrypt.ts` | `encryptItem(dek, ownerId, itemId, plaintext)` → `{ciphertext, iv}` (AES-GCM, AAD binding) |
| `lib/crypto/decrypt.ts` | `decryptItem(...)` — throws `DecryptError` on auth failure |
| `lib/crypto/session.ts` | In-memory key store (module-level, cleared on logout/tab close); `unlockVault(passphrase)`, `lockVault()`, `getDek()` |
| `lib/crypto/keeper-keys.ts` | Keeper ECDH provisioning + per-keeper DEK wrapping |

## Components

| Component | Responsibility |
|---|---|
| `components/vault/VaultUnlock.tsx` | Passphrase entry, strength-independent; gentle wrong-passphrase state |
| `components/vault/VaultItemCard.tsx` | Displays one decrypted item (kind icon, title, body, recipient) |
| `components/vault/VaultEditor.tsx` | Create/edit form (kind picker, title, body, recipient keeper) |
| `app/app/vault/page.tsx` | Vault list page; shows unlock screen when locked |

## Data model (see design-doc §4.2, §4.8)

- `vaults`: `salt`, `wrapped_dek`, `wrapped_dek_for_keepers`, `recovery_hint`.
- `vault_items`: `kind`, `title_ciphertext`, `body_ciphertext`, `iv`,
  `recipient_keeper_id`, `sort_order`.
- RLS: owner full access to own vault/items; keepers read `vault_items` only
  after release (policy joins `release_processes` in state `released`).

## Key decisions

- **WebCrypto only** — no third-party crypto libraries; smaller audit surface.
- **AAD binding** (`owner_id || item_id`) prevents ciphertext from being
  transplanted between items or owners.
- **Non-extractable keys** where WebCrypto allows, so a compromised script
  cannot easily exfiltrate raw key bytes (defense in depth, not a guarantee).
- **Per-item IVs** — never reuse an IV with the same DEK.
- **Demo seeding** (`scripts/seed-demo.ts`) creates a demo vault whose DEK is
  wrapped for the demo keeper in the same session, so judges can complete a
  release in one browser.

## Error handling

- `DecryptError` → item card shows "This item couldn't be decrypted" and the
  rest of the vault still renders.
- Wrong passphrase → `VaultUnlock` shows a gentle error; 5 failed attempts in
  a row trigger a 60-second client-side cooldown (anti-brute-force UX, not a
  security boundary — the real protection is PBKDF2 cost).

## Testing

- Unit: round-trip, wrong-key failure, IV uniqueness, AAD binding, PBKDF2
  determinism, wrap/unwrap.
- PBT (fast-check): `decrypt(encrypt(m)) == m` for arbitrary strings;
  tampering with any byte of ciphertext/IV fails authentication.
- E2E: unlock with correct/wrong passphrase; create/edit/delete item;
  ciphertext visible in DB is not plaintext (assert via Supabase query in
  the test).
- **Security review:** the `security-review` custom agent audits this module
  against design-doc §5 before submission.
