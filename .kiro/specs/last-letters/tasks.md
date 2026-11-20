# Feature: Last Letters — Tasks

> **PREP-ONLY DRAFT** for Kiroween 2026. Execute through the authenticated
> Kiro CLI. Check off each task only when its tests pass.

- [x] 1. Database migration: letters
  - [x] 1.1 Migration for `letters` (recipient, ciphertexts, iv, ai_assisted, status, delivered_at) + RLS
  - [x] 1.2 Regenerate Supabase types (hand-updated: `pnpm db:types` needs a linked project)
- [x] 2. Owner letters UI
  - [x] 2.1 Letters list page (draft/final badges, recipient, delivered state)
  - [x] 2.2 `LetterEditor`: subject + body, recipient picker, draft/final toggle, 10,000-char limit, 50-letter cap
  - [x] 2.3 `LetterCard`: paper rendering (serif, batik border, AI badge) — owner preview
  - [x] 2.4 Edit (re-encrypt, fresh IV) + delete (hard delete)
- [x] 3. Delivery
  - [x] 3.1 `lib/letters/deliver.ts`: on release, deliver final letters to still-accepted keepers; set `delivered_at`
  - [x] 3.2 `letter-delivered` email template (link only, no content)
  - [x] 3.3 Keeper letter view page (RLS: recipient only, after release)
- [x] 4. Demo seed
  - [x] 4.1 Seed 2 final letters + 1 draft letter in the demo account
- [x] 5. Tests
  - [x] 5.1 Unit: delivery eligibility, character/letter limits
  - [x] 5.2 E2E: write → final → release → keeper reads; draft not delivered; revoked keeper not delivered
  - [x] 5.3 Run `pnpm lint && pnpm typecheck && pnpm test` — all green

## Implementation notes (Spec 5)

- 1.1: two migrations, **not applied** (human step, SQL Editor, in order):
  `20261121100000_letters.sql`, `20261121100100_letters_delivery.sql`. They were
  executed together with Specs 1–4 migrations against an in-memory Postgres
  (PGlite, auth stubs) to check RLS, the guard trigger and delivery: drafts and
  revoked keepers get nothing, only the addressed keeper can read, delivery is
  atomic with the release, and clients cannot write `delivered_at`.
- IV correction: one `payload_ciphertext` + one fresh IV per letter (design-doc
  §4.9's two-ciphertext sketch reuses an IV). See design.md.
- 3.1: delivery marking is a trigger on `release_processes`; the decide flow
  calls `sendLetterDeliveryEmails` only for the `released` outcome.
- 3.3: the keeper page is `app/keeper/release/[id]/letters/page.tsx`
  (one recipient per letter; Spec 4's "or all keepers" guess is corrected).
- 5.2: `tests/e2e/letters.spec.ts` written (1 live scenario skipped, 2
  no-credential checks); `keepers.spec.ts` updated for the real letters page.
- Not built on purpose: Echo "help me draft" (disabled placeholder,
  TODO(spec-7)); `ai_assisted` is never set by the editor.
