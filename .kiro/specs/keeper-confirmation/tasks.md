# Feature: Keeper Confirmation — Tasks

> **PREP-ONLY DRAFT** for Kiroween 2026. Execute through the authenticated
> Kiro CLI. Check off each task only when its tests pass.

- [ ] 1. Database migration: keepers + release_processes + keeper_confirmations
  - [ ] 1.1 Migration for `keepers` (invite token hash/expiry, public key, status) + RLS
  - [ ] 1.2 Migration for `release_processes` + RLS
  - [ ] 1.3 Migration for `keeper_confirmations` + unique (release_id, keeper_id) + RLS
  - [ ] 1.4 Regenerate Supabase types
- [ ] 2. Invite flow
  - [ ] 2.1 Owner keepers page: invite form (name, email, relationship) + keeper list + revoke
  - [ ] 2.2 Invite API: generate token, store hash, send `keeper-invite` email
  - [ ] 2.3 Public invite page: explainer + Accept / Decline
  - [ ] 2.4 Accept: create keeper auth account, generate ECDH key pair, set status `accepted`, notify owner
  - [ ] 2.5 Decline + revoke flows; resend-invite on email failure
- [ ] 3. Release decision flow
  - [ ] 3.1 `release-pending` email + in-app notification when a release enters AWAITING_KEEPERS
  - [ ] 3.2 Keeper release page: context (owner, last check-in) + Confirm / False alarm buttons
  - [ ] 3.3 Decision API (transactional): insert decision → count → release or cancel
  - [ ] 3.4 `ReleaseTimeline` component (owner dashboard + keeper page)
  - [ ] 3.5 `released` / `false-alarm` emails to all parties
- [ ] 4. Post-release keeper access
  - [ ] 4.1 Keeper vault view: decrypt items addressed to them (uses `encrypted-vault` module)
  - [ ] 4.2 Keeper letters view (with AI-assisted badge)
  - [ ] 4.3 Keeper will-checklist view
- [ ] 5. Keeper-minimum warnings
  - [ ] 5.1 Dashboard warning when < 2 accepted keepers
  - [ ] 5.2 Release waits (cannot complete) when < 2 accepted keepers
- [ ] 6. Tests
  - [ ] 6.1 Unit: decision counting, token hash/expiry
  - [ ] 6.2 PBT: keeper decisions in the event-sequence generator (no release without 2 confirms; false alarm cancels)
  - [ ] 6.3 E2E: full invite → accept → release → read letter; false-alarm path; double-decision blocked
  - [ ] 6.4 Run `pnpm lint && pnpm typecheck && pnpm test` — all green
