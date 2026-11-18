# Feature: Encrypted Vault — Tasks

> **PREP-ONLY DRAFT** for Kiroween 2026. Execute through the authenticated
> Kiro CLI. Check off each task only when its tests pass.

- [ ] 1. Database migration: vaults + vault_items
  - [ ] 1.1 Migration for `vaults` (salt, wrapped_dek, wrapped_dek_for_keepers, recovery_hint) + RLS
  - [ ] 1.2 Migration for `vault_items` + RLS (owner full access; keeper read only after release)
  - [ ] 1.3 Regenerate Supabase types
- [ ] 2. Crypto module (`lib/crypto/`)
  - [ ] 2.1 `keys.ts`: DEK generation, PBKDF2 KEK derivation, AES-KW wrap/unwrap
  - [ ] 2.2 `encrypt.ts` / `decrypt.ts`: AES-GCM with fresh IV + AAD binding
  - [ ] 2.3 `session.ts`: in-memory key store, unlock/lock, clear-on-logout
  - [ ] 2.4 `keeper-keys.ts`: ECDH P-256 key-pair generation, HKDF wrapping, per-keeper DEK wrap
- [ ] 3. Vault UI
  - [ ] 3.1 `VaultUnlock` component (passphrase entry, gentle errors, cooldown after 5 failures)
  - [ ] 3.2 Vault list page: locked state → unlock screen; unlocked → item list
  - [ ] 3.3 `VaultItemCard` (kind icon, decrypted title/body, recipient badge)
  - [ ] 3.4 `VaultEditor` (create/edit, kind picker, recipient keeper picker, credential-pointer warning)
  - [ ] 3.5 Delete with confirmation
- [ ] 4. Keeper key provisioning flow
  - [ ] 4.1 Keeper accepts invite → ECDH key pair generated in keeper browser, public key uploaded
  - [ ] 4.2 Owner (vault unlocked) wraps DEK for each keeper with a public key; stored in `wrapped_dek_for_keepers`
  - [ ] 4.3 Verify RLS: keeper cannot read `wrapped_dek_for_keepers` before release
- [ ] 5. Demo seed
  - [ ] 5.1 `scripts/seed-demo.ts`: demo owner + vault + items + demo keeper with pre-wrapped DEK
- [ ] 6. Tests
  - [ ] 6.1 Unit tests: round-trip, wrong key, IV uniqueness, AAD binding, PBKDF2 determinism
  - [ ] 6.2 PBT: encrypt/decrypt round-trip + tamper detection (fast-check, ≥100 iterations)
  - [ ] 6.3 E2E: unlock correct/wrong passphrase; CRUD item; DB holds ciphertext only
  - [ ] 6.4 Security-review agent audit of `lib/crypto/` — address all findings
  - [ ] 6.5 Run `pnpm lint && pnpm typecheck && pnpm test` — all green
