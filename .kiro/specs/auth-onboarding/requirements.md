# Feature: Auth + Onboarding — Requirements

> **PREP-ONLY DRAFT** for Kiroween 2026. No code exists yet; this spec is to
> be executed through the authenticated Kiro CLI during the real build.

## Introduction

The owner signs up, creates a vault passphrase, and completes a 5-minute
guided onboarding (heartbeat cadence, grace period, keeper invites, first
letter). Auth is Supabase Auth; the vault passphrase is separate from the
account password and never leaves the browser.

## Requirements

### 1. Sign-up and sign-in
1. WHEN a visitor submits a valid email + password (≥8 chars) on `/auth/sign-up`
   THEN a Supabase Auth account is created and a `profiles` row is created for
   them.
2. WHEN a user signs in with correct credentials THEN they are redirected to
   the dashboard (`/app`) if onboarding is complete, otherwise to onboarding.
3. WHEN a user requests a magic link THEN Supabase sends it and the callback
   completes sign-in without a password.
4. WHEN a user signs out THEN the session ends AND any in-memory vault keys
   are cleared.

### 2. Vault passphrase creation
5. WHEN onboarding reaches the passphrase step THEN the user creates a vault
   passphrase (minimum 12 characters) with a live strength meter.
6. WHEN the passphrase is submitted THEN the browser derives the KEK
   (PBKDF2-SHA-256, 600k iterations), generates a random DEK, wraps it, and
   stores only the wrapped DEK + salt in `vaults` (see design-doc §5.2).
7. WHEN the passphrase is created THEN the UI plainly states: "We cannot
   recover this passphrase. Write it down somewhere safe."
8. WHEN the user enters a passphrase that does not match on unlock THEN the
   error is gentle and does not reveal whether the account exists.

### 3. Guided onboarding
9. WHEN a new user completes sign-up THEN they are guided through: (a) display
   name + timezone, (b) vault passphrase, (c) heartbeat cadence + grace
   period, (d) invite 2 keepers (skippable, reminder later), (e) write the
   first letter (skippable).
10. WHEN onboarding is skipped at any step THEN the dashboard shows a
    checklist of unfinished setup items.
11. WHEN onboarding completes THEN `profiles.onboarding_completed_at` is set
    and the user lands on the dashboard with the lantern lit.

### 4. Session and security basics
12. WHEN a session expires THEN the user is returned to sign-in without
    losing any saved (server-side) data.
13. WHEN a user changes their account password THEN the vault passphrase is
    unaffected (they are independent secrets).
14. WHEN any auth page is rendered THEN no vault ciphertext or key material
    is included in the HTML.

## Out of scope
- Social login (Google/GitHub) — nice to have, only if time remains.
- 2FA for the owner account — out of scope for the hackathon.
