# Feature: Heartbeat + Grace Period — Tasks

> **PREP-ONLY DRAFT** for Kiroween 2026. Execute through the authenticated
> Kiro CLI. Check off each task only when its tests pass.

- [ ] 1. Database migration: heartbeat_settings + checkins + notifications
  - [x] 1.1 Migration for `heartbeat_settings` + RLS
  - [ ] 1.2 Migration for `checkins` + RLS (owner read own; insert via API only)
  - [ ] 1.3 Migration for `notifications` + uniqueness constraint for idempotency
  - [ ] 1.4 Regenerate Supabase types
- [ ] 2. Pure state machine (`lib/heartbeat/`)
  - [x] 2.1 `state-machine.ts`: states, events, `nextState()` — pure, clock injected
  - [x] 2.2 `cadence.ts`: due-date + grace-end + reminder-schedule math
  - [x] 2.3 `demo-clock.ts`: `effectiveNow(profile)` with demo offset
- [ ] 3. Check-in API + UI
  - [x] 3.1 `app/api/checkin/route.ts`: records check-in, recomputes due date, cancels open release if any
  - [ ] 3.2 `CheckInButton` on the dashboard (optimistic UI, calm confirmation copy)
  - [ ] 3.3 Magic-link check-in: email link → callback → check-in recorded
  - [ ] 3.4 Login check-in prompt: after sign-in, if a check-in is due soon, offer one-tap check-in
- [ ] 4. Cron Edge Function `heartbeat-tick`
  - [ ] 4.1 Tick: ALIVE → OVERDUE, OVERDUE → AWAITING_KEEPERS (+ create release process)
  - [ ] 4.2 Reminder sending (idempotent via `notifications` rows)
  - [ ] 4.3 Per-owner transactions with row locks; per-owner error isolation
  - [ ] 4.4 Schedule via pg_cron every 15 minutes; verify in Supabase dashboard
- [ ] 5. Heartbeat settings page
  - [ ] 5.1 Cadence + grace pickers (7/14/30), recompute due date on change
  - [ ] 5.2 Check-in history list
  - [ ] 5.3 "What happens next" explainer (plain language, per current state)
- [ ] 6. Lantern flame component keyed to state
  - [ ] 6.1 `LanternFlame` states: bright (ALIVE), flickering (OVERDUE), guttering (AWAITING_KEEPERS), shared flames (RELEASED)
  - [ ] 6.2 `prefers-reduced-motion` support
- [ ] 7. Demo clock
  - [x] 7.1 `demo_time_offset` on profile (demo account only, gated by `DEMO_MODE`)
  - [ ] 7.2 Demo page control: "advance time" buttons (+1 day, +7 days, +14 days)
  - [x] 7.3 Verify: full lifecycle completes in minutes on the demo account
- [ ] 8. Tests
  - [x] 8.1 PBT: all 6 state-machine properties (fast-check, ≥100 iterations local)
  - [x] 8.2 Unit: cadence math, DST boundaries, reminder schedule
  - [ ] 8.3 E2E: lifecycle via demo clock; check-in rescue in OVERDUE and AWAITING_KEEPERS
  - [x] 8.4 Run `pnpm lint && pnpm typecheck && pnpm test` — all green

## Status notes (build of 20 Nov 2026)

Checked = covered by passing tests (`pnpm test`: unit + fast-check PBT).
Left unchecked on purpose:

- 1.2 / 1.3: migration files written (`supabase/migrations/20261120100000_…`, `…100100_…`, `…100200_release_processes.sql`) but **not yet applied** to the live project (SQL Editor, human step).
- 1.4: `lib/supabase/types.ts` extended by hand; `pnpm db:types` needs a linked project.
- 3.2, 3.3, 3.4, 5.1–5.3, 6.1, 6.2, 7.2: built and compile/build clean, but no automated UI test exists and the E2E specs are skipped (need live DB + seeded demo account + `DEMO_MODE=true`).
- 4.1–4.4: `supabase/functions/heartbeat-tick/` written and type-checked against shims, never deployed or run (no Supabase CLI / Deno here). Deploy + pg_cron: see its README.
- 8.3: `tests/e2e/heartbeat.spec.ts` written; live-dependent tests are skipped with an explanatory header.
- 8.4: lint, typecheck, test (154 passing) and build all green.
- 3.1 / 7.1 / 7.3 are verified at service level against an in-memory Supabase fake (`tests/unit/heartbeat-lifecycle.test.ts`), not against the live database.
