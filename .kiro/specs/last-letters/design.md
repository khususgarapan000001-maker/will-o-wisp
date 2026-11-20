# Feature: Last Letters — Design

> **PREP-ONLY DRAFT** for Kiroween 2026. No code exists yet; this spec is to
> be executed through the authenticated Kiro CLI during the real build.

## Overview

Letters reuse the vault's crypto module (`lib/crypto/`) with their own table
(`letters`) so delivery can be tracked per letter. Delivery is a two-step
process: the release marks letters deliverable; the keeper reads them in the
app (decrypted in their browser). The delivery email contains **no letter
content** — only a link to the keeper's letter view — so a compromised inbox
does not expose the letter.

## Components

| Component / module | Responsibility |
|---|---|
| `app/app/letters/page.tsx` | Owner's letter list (draft/final, recipient, delivered state) |
| `components/letters/LetterEditor.tsx` | Subject + body editor, recipient picker, draft/final toggle, character count, Echo "help me draft" button |
| `components/letters/LetterCard.tsx` | Paper-letter rendering (serif, batik border, AI badge) — shared by owner preview + keeper view |
| `app/keeper/letters/[id]/page.tsx` | Keeper letter view (RLS: only the recipient, only after release) |
| `lib/letters/deliver.ts` | Delivery logic: on release, mark final letters deliverable + send notification emails |
| `lib/email/templates/letter-delivered.tsx` | Email with a link only — no letter content |

## Data model (see design-doc §4.9)

- `letters`: `owner_id`, `vault_id`, `recipient_keeper_id` (NOT NULL, one
  recipient per letter), a single `payload_ciphertext` + `iv`, `ai_assisted`,
  `delivered_at`, plus a `status` column (`draft` / `final`).
- **Deviation from design-doc §4.9 (IV correction).** The doc sketches
  `subject_ciphertext` + `body_ciphertext` under ONE `iv`. That reuses an
  AES-GCM IV across two ciphertexts. Letters instead encrypt one JSON payload
  `{subject, body}` as ONE ciphertext under ONE fresh 96-bit IV, exactly like
  `vault_items`. An edit re-encrypts the whole payload with a new IV.
  AAD = `owner_id || letter_id`.
- RLS: owner full access (delete only while undelivered); the recipient keeper
  may SELECT only after delivery, while still `accepted`, with a `released`
  release. Clients can never write `delivered_at` (`letters_guard`).
- **Delivery is a database trigger** (`deliver_letters_on_release` on
  `release_processes`, fired on the transition to `released`), not an edit to
  `record_keeper_decision()`. It runs in the same transaction as the release,
  re-checks the keeper is still `accepted`, delivers only `final` letters, and
  is idempotent. It also writes one in-app notification per keeper
  (`letter_delivered_<release id>`).
- `lib/letters/deliver.ts` then sends the link-only email for each pending
  notification and records the attempt; a failed send leaves `sent_at` null so
  the next try picks it up (max 3 attempts).
- The 50-letter cap and the 10,000-character limit are enforced in the editor
  and `/api/letters`; the database does not count.

## Key decisions

- **No letter content in email.** Email is not end-to-end encrypted; the
  letter itself is only ever decrypted in a browser. The email says who the
  letter is from and links to the app.
- **Letters are separate from vault items** (own table) because delivery is
  per-letter and per-recipient, and the UI/UX is distinct (paper, not a
  list).
- **Draft vs final** is a deliberate safety feature: a half-written letter
  must never be delivered. The editor defaults new letters to draft; the
  owner explicitly marks them final.
- **Revoked keeper = no delivery.** The delivery step re-checks keeper status
  at release time.

## Error handling

- Decryption failure on a delivered letter → keeper sees "This letter
  couldn't be opened — please contact support" (and the failure is logged).
- Email delivery failure → `delivered_at` is still set (in-app delivery is
  the source of truth); the email is retried by the next cron tick.

## Testing

- Unit: delivery eligibility (final + keeper still accepted), character
  limits.
- E2E: write letter → mark final → (demo clock) release → keeper reads the
  letter; draft letter is NOT delivered; letter to a revoked keeper is NOT
  delivered.
