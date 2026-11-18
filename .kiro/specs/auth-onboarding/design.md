# Feature: Auth + Onboarding — Design

> **PREP-ONLY DRAFT** for Kiroween 2026. No code exists yet; this spec is to
> be executed through the authenticated Kiro CLI during the real build.

## Overview

Supabase Auth (email + password, magic link) with a `profiles` row created by
a DB trigger on `auth.users` insert. Onboarding is a multi-step client wizard
that writes `heartbeat_settings` and creates the vault (via the crypto module
from the `encrypted-vault` spec). The vault passphrase is a browser-only
secret; the account password is a Supabase Auth secret. They are independent
by design.

## Components

| Component / module | Responsibility |
|---|---|
| `app/auth/sign-up/page.tsx` | Sign-up form (email + password), validation, error display |
| `app/auth/sign-in/page.tsx` | Sign-in form + magic-link request |
| `app/auth/callback/route.ts` | Supabase auth callback (magic link / email confirm) |
| `app/app/onboarding/page.tsx` | Multi-step wizard (client component) |
| `components/onboarding/Step*.tsx` | One component per wizard step |
| `lib/supabase/client.ts`, `server.ts` | Browser + server Supabase clients |
| `lib/auth/get-user.ts` | Server helper: current user or redirect to sign-in |
| `middleware.ts` | Protects `/app/*` and `/keeper/*` routes |

## Data model (see design-doc §4)

- `profiles` — created by trigger on signup; `onboarding_completed_at`
  nullable.
- `heartbeat_settings` — created during onboarding step (c) with defaults
  (cadence 14d, grace 14d, reminders {3, 1}).
- `vaults` — created during onboarding step (b) via the crypto module.

## Key decisions

- **DB trigger for profiles**, not application code — guarantees a profile
  exists for every auth user even if the client crashes mid-signup.
- **Onboarding state is server-side** (`profiles.onboarding_completed_at` +
  presence of `vaults`/`heartbeat_settings` rows), so a refresh mid-wizard
  resumes correctly.
- **Magic link as the recovery path** for a forgotten account password; the
  vault passphrase has no recovery path by design (stated in the UI).
- **No social login in v1** — keeps the auth surface small and auditable.

## Error handling

- Supabase auth errors are mapped to plain-language messages; the raw error
  is logged server-side only.
- If vault creation fails mid-onboarding, the wizard shows a retry step and
  does not advance (no half-created vault state).

## Testing

- Unit: wizard step validation, `get-user` helper (mocked Supabase).
- E2E (Playwright): full sign-up → onboarding → dashboard flow; sign-in with
  wrong password shows a gentle error; magic-link callback completes sign-in
  (stubbed email in test env).
