# Feature: Digital Will Checklist — Tasks

> Executed through the authenticated Kiro CLI. Each task is checked off only
> when its tests pass.

- [x] 1. Database migration: will_items
  - [x] 1.1 Migration for `will_items` + check constraints (transfer requires keeper; wish nullable = "not set yet"; IV iff note) + RLS + `will_items_guard` (`20261121110000_will_items.sql`); delivery trigger, link-only email functions and keeper label function (`20261121110100_will_delivery.sql`). Verified in PGlite (69 checks).
  - [x] 1.2 Types: `lib/supabase/types.ts` updated by hand (`pnpm db:types` needs a linked project + DB password)
- [x] 2. Owner checklist UI
  - [x] 2.1 Checklist page grouped by category, with wish filter (`app/app/will/page.tsx`, `WillChecklist`)
  - [x] 2.2 `WillItemRow` + `WillItemForm`: service name (with suggestions), category, wish selector (incl. "No wish yet"), transfer-keeper picker, encrypted notes
  - [x] 2.3 Add / edit / delete + button reorder (up/down; drag-and-drop not built)
  - [x] 2.4 "Not a legal will" notice + pocong empty state
  - [x] 2.5 Dashboard prompt when accounts lack a wish
- [x] 3. Keeper checklist view
  - [x] 3.1 Read-only keeper view at `app/keeper/release/[id]/will/page.tsx` (replaces the spec's `app/keeper/will`); transfer items assigned to the viewing keeper highlighted; notes decrypted in the keeper's browser
  - [x] 3.2 "Keeper no longer available" flag for revoked transfer targets (via `will_transfer_keepers()`)
- [x] 4. Demo seed
  - [x] 4.1 Seed 6 will items across categories in the demo account (2 transfers, 1 with no wish, 2 encrypted notes)
- [x] 5. Tests
  - [x] 5.1 Unit + property tests: wish validation, transfer constraint, grouping, sealing, delivery wiring (`tests/unit/will.test.ts`, `tests/property/will-grouping.test.ts`)
  - [x] 5.2 E2E written in the skipped pattern (`tests/e2e/will.spec.ts`); needs a live Supabase project, so it has not been run
  - [x] 5.3 Run `pnpm lint && pnpm typecheck && pnpm test` — all green
