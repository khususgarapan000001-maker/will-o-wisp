# Feature: Digital Will Checklist — Tasks

> **PREP-ONLY DRAFT** for Kiroween 2026. Execute through the authenticated
> Kiro CLI. Check off each task only when its tests pass.

- [ ] 1. Database migration: will_items
  - [ ] 1.1 Migration for `will_items` + check constraint (transfer requires keeper) + RLS
  - [ ] 1.2 Regenerate Supabase types
- [ ] 2. Owner checklist UI
  - [ ] 2.1 Checklist page grouped by category, with wish filter
  - [ ] 2.2 `WillItemRow`: service name (with suggestions), category, wish selector, transfer-keeper picker, encrypted notes
  - [ ] 2.3 Add / edit / delete + drag-or-button reorder
  - [ ] 2.4 "Not a legal will" notice + pocong empty state
  - [ ] 2.5 Dashboard prompt when accounts lack a wish
- [ ] 3. Keeper checklist view
  - [ ] 3.1 Read-only keeper view; transfer items assigned to the viewing keeper highlighted
  - [ ] 3.2 "Keeper no longer available" flag for revoked transfer targets
- [ ] 4. Demo seed
  - [ ] 4.1 Seed 6 will items across categories in the demo account
- [ ] 5. Tests
  - [ ] 5.1 Unit: wish validation, transfer constraint, grouping
  - [ ] 5.2 E2E: CRUD + transfer wish + keeper view after release
  - [ ] 5.3 Run `pnpm lint && pnpm typecheck && pnpm test` — all green
