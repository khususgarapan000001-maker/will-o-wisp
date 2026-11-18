# Feature: Keeper Confirmation — Requirements

> **PREP-ONLY DRAFT** for Kiroween 2026. No code exists yet; this spec is to
> be executed through the authenticated Kiro CLI during the real build.

## Introduction

Keepers are the human safety net: two of them must confirm before anything is
released. This spec covers keeper invites, the confirmation flow, false-alarm
handling, and post-release keeper access.

## Requirements

### 1. Keeper invites
1. WHEN the owner invites a keeper (name + email + relationship) THEN an
   invite email is sent with a single-use token link (expires in 7 days) and
   a `keepers` row is created with status `invited`.
2. WHEN a keeper opens the invite link THEN they see who invited them, what
   being a keeper means (plain language), and Accept / Decline buttons.
3. WHEN a keeper accepts THEN status becomes `accepted`, their browser
   generates an ECDH key pair (see `encrypted-vault`), and the owner is
   notified.
4. WHEN a keeper declines THEN status becomes `declined` and the owner is
   notified (gently, with a prompt to invite someone else).
5. WHEN the owner revokes a keeper THEN status becomes `revoked`, their
   wrapped DEK is removed, and they lose all access immediately.

### 2. Release confirmation
6. WHEN a release process enters `AWAITING_KEEPERS` THEN each accepted keeper
   receives an email + in-app notification: "We haven't heard from
   [owner] — can you confirm they're unreachable?"
7. WHEN a keeper opens the release page THEN they see: the owner's name, how
   long since the last check-in, what confirming means, and two buttons:
   "Confirm — I can't reach them" / "False alarm — they're fine".
8. WHEN a keeper confirms THEN a `keeper_confirmations` row is recorded
   (decision `confirm`) and the owner is shown the live confirmation count.
9. WHEN the second distinct keeper confirms THEN the release process becomes
   `released`, `heartbeat_settings.state` becomes `RELEASED`, letters are
   delivered, and keepers gain vault access.
10. WHEN a keeper has already decided THEN they cannot decide twice (unique
    constraint on `release_id + keeper_id`).

### 3. False alarm
11. WHEN any keeper chooses "False alarm" THEN the release is cancelled
    immediately (`cancelled_false_alarm`), the owner returns to `ALIVE` with
    a fresh due date, and all keepers + the owner are notified.
12. WHEN a keeper chooses "False alarm" THEN they may add a short note (e.g.
    "Spoke to her yesterday, she's travelling").

### 4. Post-release keeper access
13. WHEN the release is confirmed THEN each keeper can read the vault items
    addressed to them (or to all keepers) and the letters addressed to them.
14. WHEN a keeper reads a released letter THEN the letter shows an
    "AI-assisted draft" badge if `ai_assisted` is true.
15. WHEN the release is confirmed THEN keepers see the digital will checklist
    (service names + wishes; encrypted notes decrypted in their browser).

### 5. Keeper minimum
16. WHEN the owner has fewer than 2 accepted keepers THEN the dashboard shows
    a clear warning: "You need 2 keepers for the release to work."
17. WHEN a release is pending but fewer than 2 keepers are accepted THEN the
    release waits (it cannot complete with 1 confirmation).

## Out of scope
- Keeper-to-keeper messaging.
- Legal/next-of-kin verification (keepers are trusted by the owner's choice).
