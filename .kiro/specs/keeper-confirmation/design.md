# Feature: Keeper Confirmation — Design

> **PREP-ONLY DRAFT** for Kiroween 2026. No code exists yet; this spec is to
> be executed through the authenticated Kiro CLI during the real build.

## Overview

Keepers are invited by email with a token link; accepting creates a lightweight
keeper account (Supabase Auth, email-based) and provisions their ECDH key
pair. The release process is a small state machine in `lib/heartbeat/` (shared
with the heartbeat spec); confirmation counting is done in a single DB
transaction to avoid race conditions between two keepers confirming at once.

## Components

| Component / module | Responsibility |
|---|---|
| `app/app/keepers/page.tsx` | Owner's keeper management (invite form, list, revoke) |
| `app/keeper/invite/[token]/page.tsx` | Public invite landing: explainer + Accept/Decline |
| `app/api/keepers/invite/route.ts` | Create invite (token hash stored, raw token emailed) |
| `app/api/keepers/accept/route.ts` | Accept invite (creates keeper auth account if needed) |
| `app/keeper/release/[id]/page.tsx` | Keeper release decision page |
| `app/api/releases/[id]/decide/route.ts` | Record a keeper decision (transactional) |
| `components/lantern/ReleaseTimeline.tsx` | Live release progress (confirmations received / required) |
| `lib/email/templates/` | `keeper-invite`, `release-pending`, `released`, `false-alarm` |

## Data model (see design-doc §4.5–4.7)

- `keepers`: invite token hash + expiry, ECDH public key, status.
- `release_processes`: state, required confirmations, timestamps.
- `keeper_confirmations`: one row per keeper per release (unique constraint).

## Key decisions

- **Invite tokens are hashed** (SHA-256) in the DB; the raw token exists only
  in the email link. Single-use: accepting or declining invalidates it.
- **Keepers get real Supabase Auth accounts** (email + password they set on
  accept), so RLS can scope their access precisely — no magic-link-only
  sessions that can't be revoked.
- **Decision endpoint is transactional:** insert confirmation → count distinct
  confirms → if count ≥ required, flip the release to `released` and the
  heartbeat to `RELEASED` — all in one transaction with a row lock on the
  release, so two simultaneous confirms can't double-release.
- **False alarm short-circuits everything:** one `false_alarm` decision
  cancels the release immediately, even if the other keeper already confirmed.
- **Release emails are calm and specific:** they name the owner, the last
  check-in date, and exactly what happens if the keeper confirms. No
  sensational language.

## Error handling

- Expired/invalid invite token → page explains the link expired and offers
  "ask the owner to send a new invite".
- Keeper tries to decide on a cancelled/completed release → page shows the
  current release state instead of the decision buttons.
- Email send failure on invite → the invite row is created but flagged
  `invite_email_failed`; the owner can resend from the keepers page.

## Testing

- Unit: decision counting logic, token hashing/expiry.
- PBT: extend the heartbeat event-sequence generator with keeper decisions;
  assert "no release without 2 distinct confirms" and "false alarm always
  cancels".
- E2E: invite → accept → (demo clock) release pending → keeper 1 confirms →
  keeper 2 confirms → released, keeper reads letter; false-alarm path;
  double-decision blocked.
