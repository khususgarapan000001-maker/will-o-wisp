# Feature: Last Letters — Tasks

> **PREP-ONLY DRAFT** for Kiroween 2026. Execute through the authenticated
> Kiro CLI. Check off each task only when its tests pass.

- [ ] 1. Database migration: letters
  - [ ] 1.1 Migration for `letters` (recipient, ciphertexts, iv, ai_assisted, status, delivered_at) + RLS
  - [ ] 1.2 Regenerate Supabase types
- [ ] 2. Owner letters UI
  - [ ] 2.1 Letters list page (draft/final badges, recipient, delivered state)
  - [ ] 2.2 `LetterEditor`: subject + body, recipient picker, draft/final toggle, 10,000-char limit, 50-letter cap
  - [ ] 2.3 `LetterCard`: paper rendering (serif, batik border, AI badge) — owner preview
  - [ ] 2.4 Edit (re-encrypt, fresh IV) + delete (hard delete)
- [ ] 3. Delivery
  - [ ] 3.1 `lib/letters/deliver.ts`: on release, deliver final letters to still-accepted keepers; set `delivered_at`
  - [ ] 3.2 `letter-delivered` email template (link only, no content)
  - [ ] 3.3 Keeper letter view page (RLS: recipient only, after release)
- [ ] 4. Demo seed
  - [ ] 4.1 Seed 2 final letters + 1 draft letter in the demo account
- [ ] 5. Tests
  - [ ] 5.1 Unit: delivery eligibility, character/letter limits
  - [ ] 5.2 E2E: write → final → release → keeper reads; draft not delivered; revoked keeper not delivered
  - [ ] 5.3 Run `pnpm lint && pnpm typecheck && pnpm test` — all green
