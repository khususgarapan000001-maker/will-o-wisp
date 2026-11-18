# Feature: Encrypted Vault — Tasks

> **PREP-ONLY DRAFT** for Kiroween 2026. Execute through the authenticated
> Kiro CLI. Check off each task only when its tests pass.

- [x] 1. Database migration: vaults + vault_items
  - [x] 1.1 Migration for `vaults` (salt, wrapped_dek, wrapped_dek_for_keepers, recovery_hint) + RLS
  - [x] 1.2 Migration for `vault_items` + RLS (owner full access; keeper read-after-release policy written as commented SQL block with TODO(spec-4) — keepers + release_processes tables do not exist yet)
  - [ ] 1.3 Regenerate Supabase types — BLOCKED: no live Supabase project. `lib/supabase/types.ts` extended manually with vaults + vault_items placeholder types matching the migration exactly.
- [x] 2. Crypto module (`lib/crypto/`)
  - [x] 2.1 `keys.ts`: DEK generation, PBKDF2 KEK derivation (600k iterations), AES-KW wrap/unwrap, salt/IV generation
  - [x] 2.2 `encrypt.ts` / `decrypt.ts`: AES-GCM 256 with fresh 96-bit IV + AAD (owner_id‖item_id) binding; `DecryptError` on auth failure
  - [x] 2.3 `session.ts`: in-memory key store (`_dek` module variable, never persisted); `createVault`, `unlockVault`, `lockVault`, `getDek`; `WrongPassphraseError`
  - [x] 2.4 `keeper-keys.ts`: ECDH P-256 key-pair generation, HKDF-SHA-256 wrapping-key derivation, `wrapDekForKeeper` / `unwrapDekForKeeper`
- [x] 3. Vault UI
  - [x] 3.1 `VaultUnlock` component: passphrase entry, gentle wrong-passphrase error, 60s client-side cooldown after 5 consecutive failures
  - [x] 3.2 Vault page (`app/app/vault/page.tsx` + `VaultClient.tsx`): locked → unlock screen (no ciphertext/metadata in DOM); unlocked → item list
  - [x] 3.3 `VaultItemCard`: combined JSON payload decryption, kind icon, decrypted title/body, recipient badge; DecryptError per-item shows "This item couldn't be decrypted" without breaking the list
  - [x] 3.4 `VaultEditor`: create/edit with kind picker (message/credential_pointer/instruction), tailored placeholders; credential_pointer warning "Store a pointer or hint, not the live password itself."; keeper picker handles no-keepers state; combined JSON payload encrypted under one IV
  - [x] 3.5 Delete with confirmation dialog in `VaultClient`
- [x] 4. Keeper key provisioning flow
  - [x] 4.1 `keeper-keys.ts`: `generateKeeperKeyPair()` (ECDH P-256, private key non-extractable). Keeper-side IndexedDB persistence is part of Spec 4 (keeper invite flow).
  - [x] 4.2 `wrapDekForKeeper()`: owner wraps DEK per keeper using ECDH+HKDF; `updateWrappedDeksAction` persists to `vaults.wrapped_dek_for_keepers`
  - [ ] 4.3 Verify RLS: keeper cannot read `wrapped_dek_for_keepers` before release — BLOCKED: no live Supabase project. Policy logic is correct in migration; TODO(spec-4) comment marks where the keeper read policy will be uncommented.
- [x] 5. Demo seed
  - [x] 5.1 `scripts/seed-demo.ts`: demo owner + vault + 3 items + demo keeper with pre-wrapped DEK. `seed-demo` added to package.json scripts. NOT run (no live project).
- [x] 6. Tests
  - [x] 6.1 Unit tests (`tests/unit/crypto.test.ts`): round-trip, wrong-key failure, IV uniqueness, AAD binding (owner_id, item_id, transplant prevention), PBKDF2 determinism, wrap/unwrap, session lock/unlock — 35 tests, all passing.
  - [x] 6.2 PBT (`tests/unit/crypto.test.ts`): `decrypt(encrypt(m)) == m` for arbitrary strings + grapheme strings (100 runs each); tamper detection for ciphertext byte flip and IV swap (100 runs each); AAD binding wrong-owner (100 runs) — all passing.
  - [ ] 6.3 E2E: unlock correct/wrong passphrase; CRUD item; DB holds ciphertext only — BLOCKED: no live Supabase project. Specs written in `tests/e2e/vault.spec.ts` with `test.describe.skip` and explanation comment. 9 test cases defined, covering unlock, wrong passphrase, CRUD, lock, and 5-failure cooldown.
  - [x] 6.4 Security self-review (no `security-review` custom agent in this workspace): manual audit against design-doc §5 completed. All requirements confirmed: 600k PBKDF2 iterations, 32-byte random salt, 96-bit random IV per item, AAD binding, AES-KW wrapping, non-extractable KEK, DEK extractable only for keeper wrapping (required by design), no localStorage, no key material logged. One issue fixed: removed dynamic import of `base64ToBuf` in `session.ts` (replaced with static import). No other findings.
  - [x] 6.5 `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — all green. 78 unit tests passing (35 crypto + 37 onboarding-validation + 5 get-user + 1 smoke). Build produces 8 routes, all correct.
