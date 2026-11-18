# Feature: Heartbeat + Grace Period — Design

> **PREP-ONLY DRAFT** for Kiroween 2026. No code exists yet; this spec is to
> be executed through the authenticated Kiro CLI during the real build.

## Overview

The state machine is a **pure function module** (`lib/heartbeat/`) with the
clock passed in as a parameter — no `Date.now()`, no DB calls inside. This
makes it property-testable with fast-check and makes the demo clock trivial
(a different `now` input). The Edge Function `heartbeat-tick` is a thin
orchestrator: load owners, call the pure functions, persist results.

## Modules

| Module | Responsibility |
|---|---|
| `lib/heartbeat/state-machine.ts` | Pure transitions: `nextState(state, event, now, settings)`; event types: `CHECK_IN`, `TICK`, `GRACE_EXPIRED`, `KEEPER_CONFIRMED`, `FALSE_ALARM` |
| `lib/heartbeat/cadence.ts` | `computeNextDue(lastCheckin, cadenceDays)`, `graceEndsAt(due, graceDays)`, reminder schedule computation |
| `lib/heartbeat/demo-clock.ts` | `effectiveNow(profile)` — `now + demo_time_offset` for demo accounts only |
| `supabase/functions/heartbeat-tick/` | Cron Edge Function: loads due owners, applies transitions, sends reminders, creates release processes |
| `app/api/checkin/route.ts` | Check-in endpoint (dashboard button + magic-link callback) |
| `components/lantern/CheckInButton.tsx` | One-tap check-in with optimistic UI |
| `components/lantern/LanternFlame.tsx` | Flame animation keyed to heartbeat state |
| `app/app/heartbeat/page.tsx` | Settings + history + "what happens next" explainer |

## Data model (see design-doc §4.3, §4.4, §4.11)

- `heartbeat_settings`: `cadence_days`, `grace_days`, `reminder_days_before`,
  `next_checkin_due`, `state`, `state_changed_at`.
- `checkins`: audit trail of every check-in (method + timestamp + IP hash).
- `notifications`: idempotency record for reminders (unique on
  `owner_id + kind + due_date`).

## Key decisions

- **Pure state machine, injected clock.** Every transition is a pure function
  of `(state, event, now, settings)`. The DB layer and the cron are adapters.
  This is what makes PBT meaningful and the demo clock safe.
- **Per-owner transactions with `SELECT ... FOR UPDATE`** in the cron, so a
  retry or a concurrent tick cannot double-transition or double-notify.
- **Reminders are idempotent by construction:** the cron inserts a
  `notifications` row with a uniqueness constraint *before* sending; a
  duplicate insert fails and the send is skipped.
- **Check-in is the universal rescue:** one code path handles check-in in any
  non-terminal state, cancelling any open release. (PBT property #2.)
- **Demo clock is data, not a code branch:** `demo_time_offset` lives on the
  profile; `effectiveNow()` is the only place it is applied; real accounts
  always have offset 0 and the API refuses to set it outside demo mode.

## Error handling

- Cron failure for one owner is caught, logged, and does not abort the tick.
- If email sending fails, the notification row stays `sent_at = null` and the
  next tick retries (bounded: max 3 attempts, then flagged for manual review).

## Testing

- **PBT (fast-check) — the centrepiece.** Properties from design-doc §9.1:
  no premature release; check-in always rescues; false alarm always cancels;
  monotonic due date; idempotent reminders; no duplicate confirmations.
  Generate random event sequences (check-ins, ticks, keeper decisions) and
  assert the invariants hold after every event.
- Unit: cadence math across DST/timezone boundaries; reminder schedule.
- E2E (demo clock): full lifecycle ALIVE → OVERDUE → AWAITING_KEEPERS in
  minutes; check-in rescue mid-grace; check-in rescue during
  AWAITING_KEEPERS.
