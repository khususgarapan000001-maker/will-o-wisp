# Feature: Heartbeat + Grace Period — Requirements

> **PREP-ONLY DRAFT** for Kiroween 2026. No code exists yet; this spec is to
> be executed through the authenticated Kiro CLI during the real build.

## Introduction

The heartbeat is the dead-man's switch: the owner checks in every N days; if
they miss the due date, a grace period starts; if the grace period expires,
the keeper-confirmation flow begins. The state machine is defined in
design-doc §6 and is the primary target of property-based testing.

## Requirements

### 1. Check-in
1. WHEN the owner taps "I'm here" on the dashboard THEN a `checkins` row is
   recorded and `next_checkin_due` becomes `now + cadence_days`.
2. WHEN the owner signs in and confirms the check-in prompt THEN it counts as
   a check-in (method `login`).
3. WHEN the owner clicks the check-in link in a reminder email THEN it counts
   as a check-in (method `magic_link`).
4. WHEN the owner checks in while in `OVERDUE` or `AWAITING_KEEPERS` THEN the
   state returns to `ALIVE`, any open release process is cancelled as
   `cancelled_false_alarm`, and keepers are notified "all is well".

### 2. State transitions (see design-doc §6.1–6.2)
5. WHEN `now > next_checkin_due` and no check-in has been recorded since the
   due date THEN the state becomes `OVERDUE`.
6. WHEN `now > next_checkin_due + grace_days` while `OVERDUE` THEN the state
   becomes `AWAITING_KEEPERS` and a `release_processes` row is created.
7. WHEN the state is `RELEASED` THEN no further transition is possible
   (terminal).
8. WHEN `next_checkin_due` is recomputed THEN it never moves backwards.

### 3. Reminders
9. WHEN the owner is `reminder_days_before` (default 3 and 1) away from the
   due date THEN a reminder email is sent (and an in-app notification).
10. WHEN the owner is `OVERDUE` THEN a daily reminder email is sent until
    they check in or the grace period expires.
11. WHEN the cron tick runs twice THEN each reminder is sent at most once
    (idempotent, recorded in `notifications`).

### 4. Settings
12. WHEN the owner changes cadence (7/14/30 days) or grace period (7/14/30
    days) THEN `next_checkin_due` is recomputed from the last check-in.
13. WHEN the owner views the heartbeat page THEN they see: current state,
    next due date, check-in history, and what happens next (plain language).

### 5. Scheduler
14. WHEN the `heartbeat-tick` cron runs (every 15 minutes) THEN it processes
    all due transitions in per-owner transactions with row locks, so two
    concurrent ticks cannot double-process an owner.
15. WHEN the cron encounters an error for one owner THEN other owners are
    still processed and the error is logged.

### 6. Demo clock
16. WHEN the demo account has a `demo_time_offset` THEN all heartbeat
    evaluations use `now + offset` for that account only, so a judge can
    watch the full lifecycle in minutes.
17. WHEN `DEMO_MODE` is off THEN no account can set a time offset.

## Out of scope
- SMS / push notifications (email + in-app only).
- Automatic check-in via wearable / device activity.
