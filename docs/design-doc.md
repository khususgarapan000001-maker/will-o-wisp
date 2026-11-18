# WILL-O'-WISP — Digital Legacy Keeper
## Design Document (Kiroween 2026 — Costume Contest)

> **Design document — living reference for the build.** Written as preparation
> for Kiroween 2026; the build is now underway through the authenticated Kiro
> CLI, following the specs in `.kiro/specs/`. Where this doc and a spec
> disagree, the spec takes precedence.
>
> **Entrant:** Ahmad Rizki (Indonesia) · **Budget:** $0 · **Deadline:** 4 Dec 2026
> 14:00 PT = **5 Dec 2026 05:00 WIB** · **Category:** Costume Contest

---

## 1. Problem & Vision

Billions of people live large parts of their lives online — photos, messages,
accounts, subscriptions, crypto wallets, creative work. When someone dies or
becomes incapacitated, their family usually cannot access any of it:
passwords are unknown, two-factor codes are unreachable, and a paper will
rarely covers digital life. Existing tools (Google Inactive Account Manager,
Apple Legacy Contact) cover one vendor's ecosystem at best and offer no
encrypted messaging, no multi-party release control, and no per-account
wishes.

**WILL-O'-WISP** is a *Digital Legacy Keeper*: a lantern that stays lit while
you are alive and, only when you are truly gone, gently lights the way for the
people you trust. The user:

1. Checks in periodically (a "heartbeat").
2. Keeps an end-to-end encrypted vault of messages, credential pointers, and
   instructions for chosen "keepers".
3. Writes last letters and a digital will (what should happen to each account).
4. If the heartbeat stops past a grace period, two keepers must confirm before
   anything is released — preventing false triggers from a lost phone or a
   long holiday.

The theme is not decoration: legacy and loss *are* the haunting. The visual
language is a lantern in the dark, with tasteful Indonesian ghost accents
(kuntilanak / pocong as subtle motifs, never caricature) that distinguish it
from the hundreds of Western Halloween apps in the competition.

**One-line pitch:** *"A lantern for your digital afterlife — your words, your
wishes, released only when you're truly gone, and only to the people you
chose."*

---

## 2. Users & Core Flows

| Persona | Needs |
|---|---|
| **The Keeper-of-the-Flame (owner)** | Set up heartbeat, vault, letters, will, keepers; check in easily; know the system works without thinking about it. |
| **Keeper (trusted person)** | Receive a clear, calm notification when a release is pending; confirm or raise a false-alarm; after release, read the letters/instructions meant for them. |
| **Judge / demo viewer** | Understand the product in < 60 seconds; see a full end-to-end release in the demo video without waiting days. |

### Core flows
1. **Onboarding (5 min):** sign up → create vault passphrase (never sent to
   server) → set heartbeat cadence + grace period → invite 2 keepers → write
   first letter → done.
2. **Heartbeat:** weekly email/app nudge → one-tap "I'm here" (or auto-check-in
   when the owner logs in and confirms). Missed check-in → reminders →
   grace period → keeper confirmation → release.
3. **Release:** 2-of-2 keeper confirmations → vault contents decryptable by
   keepers (see §5) → letters delivered by email + in-app → will checklist
   shown to keepers with per-account wishes.
4. **False-alarm recovery:** owner checks in at any point before release →
   everything resets to `alive`; keepers are notified "false alarm, all is
   well".

---

## 3. System Architecture

```
┌─────────────────────────────┐      ┌──────────────────────────────┐
│  Next.js App Router (Vercel │      │  Supabase (Free tier)        │
│  Hobby, TypeScript)         │      │  • Postgres (RLS on)         │
│  • Server Components + RSC  │◄────►│  • Auth (email + OAuth)      │
│  • Tailwind + shadcn/ui     │      │  • Edge Functions (cron)     │
│  • WebCrypto in browser     │      │  • Storage (avatars only)    │
│  • Vitest + fast-check      │      └──────────────────────────────┘
│  • Playwright e2e           │                 │
└─────────────────────────────┘                 │ email
                                        ┌───────▼───────┐
                                        │ Resend free   │
                                        │ tier (or      │
                                        │ Supabase SMTP)│
                                        └───────────────┘
```

### Key architectural decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15 App Router + TypeScript | One deployable, RSC + server actions, Vercel free hosting |
| Database | Supabase Postgres + RLS | Free tier is enough; RLS enforces per-user isolation at the DB layer |
| Auth | Supabase Auth (email magic link + password) | No custom auth; keepers get scoped invite links |
| Encryption | WebCrypto AES-GCM in the browser | Server never sees plaintext (see §5); the strongest honest privacy claim |
| Scheduling | Supabase Edge Function + pg_cron (or Vercel Cron) | Heartbeat deadline checks run server-side, idempotent |
| Email | Resend free tier (100/day) | Enough for heartbeat nudges + keeper notifications |
| Testing | Vitest + fast-check (PBT) + Playwright | PBT proves the heartbeat/grace state machine; Playwright proves the release flow end-to-end |
| Styling | Tailwind CSS + shadcn/ui | Fast, accessible, polished; custom "lantern" theme tokens on top |

### Deployment topology (all free tier)
- **Vercel Hobby** — web app, preview deploys per PR.
- **Supabase Free** — 500 MB DB, 50k MAU, 2 GB bandwidth; plenty for a
  hackathon + judging period.
- **Resend Free** — 100 emails/day, 3,000/month.
- **GitHub (public repo)** — required by Kiroween; `/.kiro` committed at root.

### Non-goals (explicitly out of scope for the hackathon)
- Native mobile app (responsive web only).
- Real credential storage (the vault stores *pointers* and instructions, e.g.
  "password manager master hint is in the safe", not live passwords — storing
  live credentials would be a security liability and a judging risk).
- Legal will validity (the checklist is a wishes document, clearly labelled
  "not a legal will").
- Payment / premium tiers.

---

## 4. Database Schema (Supabase Postgres)

All tables have Row Level Security enabled. `owner_id` is the Supabase Auth
user id of the vault owner. Timestamps are `timestamptz`, UTC.

### 4.1 `profiles`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | = `auth.users.id` |
| `display_name` | text | |
| `avatar_url` | text nullable | Supabase Storage path |
| `timezone` | text | IANA, default `Asia/Jakarta` |
| `created_at` / `updated_at` | timestamptz | |

### 4.2 `vaults` (one per owner)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `owner_id` | uuid FK → profiles, unique | |
| `salt` | text | Base64; PBKDF2 salt for the vault key (see §5) |
| `wrapped_dek` | text | Base64; data-encryption key wrapped by the passphrase-derived KEK |
| `wrapped_dek_for_keepers` | jsonb | Per-keeper wrapped DEK (see §5.3); `[{keeper_id, wrapped_dek, kdf_salt}]` |
| `recovery_hint` | text nullable | Owner-written hint, **never** the passphrase |
| `created_at` / `updated_at` | timestamptz | |

### 4.3 `heartbeat_settings`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `owner_id` | uuid FK → profiles, unique | |
| `cadence_days` | int | 7 / 14 / 30 (default 14) |
| `grace_days` | int | 7 / 14 / 30 (default 14) |
| `reminder_days_before` | int[] | default `{3, 1}` |
| `next_checkin_due` | timestamptz | computed on each check-in |
| `state` | text | state machine state (see §6) |
| `state_changed_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | |

### 4.4 `checkins`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `owner_id` | uuid FK → profiles | |
| `checked_in_at` | timestamptz | |
| `method` | text | `manual` / `magic_link` / `login` |
| `ip_hash` | text nullable | SHA-256 of IP, for audit only |

### 4.5 `keepers`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `owner_id` | uuid FK → profiles | |
| `name` | text | |
| `email` | citext | |
| `relationship` | text nullable | e.g. "spouse", "sibling" |
| `status` | text | `invited` / `accepted` / `declined` / `revoked` |
| `invite_token_hash` | text nullable | SHA-256 of the invite token |
| `invite_expires_at` | timestamptz nullable | |
| `public_key` | text nullable | Base64; keeper's vault-access public key (see §5.3) |
| `created_at` / `updated_at` | timestamptz | |

### 4.6 `release_processes`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `owner_id` | uuid FK → profiles | |
| `triggered_at` | timestamptz | when grace period expired |
| `state` | text | `awaiting_keepers` / `released` / `cancelled_false_alarm` / `expired` |
| `required_confirmations` | int | default 2 |
| `released_at` | timestamptz nullable | |
| `cancelled_at` | timestamptz nullable | |
| `cancel_reason` | text nullable | |
| `created_at` / `updated_at` | timestamptz | |

### 4.7 `keeper_confirmations`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `release_id` | uuid FK → release_processes | |
| `keeper_id` | uuid FK → keepers | |
| `decision` | text | `confirm` / `false_alarm` |
| `confirmed_at` | timestamptz | |
| `note` | text nullable | |
| Unique (`release_id`, `keeper_id`) | | one decision per keeper per release |

### 4.8 `vault_items` (encrypted blobs)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `vault_id` | uuid FK → vaults | |
| `kind` | text | `message` / `credential_pointer` / `instruction` / `letter` |
| `title_ciphertext` | text | Base64 AES-GCM (see §5) |
| `body_ciphertext` | text | Base64 AES-GCM |
| `iv` | text | Base64, 12-byte random per item |
| `recipient_keeper_id` | uuid FK → keepers, nullable | null = all keepers |
| `sort_order` | int | |
| `created_at` / `updated_at` | timestamptz | |

### 4.9 `letters`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `vault_id` | uuid FK → vaults | |
| `recipient_keeper_id` | uuid FK → keepers | |
| `subject_ciphertext` | text | Base64 AES-GCM |
| `body_ciphertext` | text | Base64 AES-GCM |
| `iv` | text | Base64 |
| `ai_assisted` | boolean | true if drafted with Echo (§8.6) — shown to recipient |
| `delivered_at` | timestamptz nullable | set when released |
| `created_at` / `updated_at` | timestamptz | |

### 4.10 `will_items` (digital will checklist)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `owner_id` | uuid FK → profiles | |
| `service_name` | text | **not** encrypted (needed for the checklist UI) |
| `category` | text | `social` / `finance` / `email` / `photos` / `work` / `other` |
| `wish` | text | `delete` / `memorialize` / `transfer` / `archive` / `ignore` |
| `transfer_to_keeper_id` | uuid FK → keepers, nullable | only when `wish = transfer` |
| `notes_ciphertext` | text nullable | Base64 AES-GCM (sensitive notes only) |
| `iv` | text nullable | |
| `sort_order` | int | |
| `created_at` / `updated_at` | timestamptz | |

### 4.11 `notifications` (audit + in-app inbox)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `owner_id` | uuid FK → profiles, nullable | |
| `keeper_id` | uuid FK → keepers, nullable | |
| `kind` | text | `checkin_reminder` / `grace_started` / `keeper_invite` / `release_pending` / `released` / `false_alarm` |
| `channel` | text | `email` / `in_app` |
| `sent_at` | timestamptz nullable | |
| `read_at` | timestamptz nullable | |
| `payload` | jsonb | non-sensitive metadata only |
| `created_at` | timestamptz | |

### Relations (summary)
```
profiles 1──1 vaults 1──* vault_items
profiles 1──1 heartbeat_settings
profiles 1──* checkins
profiles 1──* keepers
profiles 1──* release_processes 1──* keeper_confirmations *──1 keepers
vaults   1──* letters *──1 keepers (recipient)
profiles 1──* will_items
```

---

## 5. Encryption Design (WebCrypto AES-GCM)

### 5.1 Threat model
- **The server is honest-but-curious:** it stores data and runs the app, but
  must never be able to read vault contents. A database breach must not
  expose letters or instructions.
- **The owner's device is trusted during a session** (standard web-app
  assumption). We do not defend against a compromised owner device.
- **Keepers are trusted only after release** — before release they hold
  encrypted key material they cannot use alone (see §5.3).

### 5.2 Key hierarchy
```
Owner passphrase (never leaves the browser, never stored)
        │  PBKDF2-SHA256, 600k iterations, per-vault salt
        ▼
KEK (key-encryption key, AES-KW 256) — derived per session, held in memory only
        │  wraps
        ▼
DEK (data-encryption key, AES-GCM 256) — random, generated once per vault
        │  encrypts
        ▼
Vault items, letters, sensitive will notes (AES-GCM, 96-bit random IV per item)
```

- **DEK generation:** `crypto.getRandomValues` (256-bit), once at vault
  creation.
- **KEK derivation:** PBKDF2-SHA-256, 600,000 iterations, 32-byte random salt
  stored in `vaults.salt`. (OWASP 2023 guidance for PBKDF2-HMAC-SHA256.)
- **Wrapping:** AES-KW (RFC 3394) via WebCrypto `wrapKey`; the wrapped DEK is
  stored in `vaults.wrapped_dek`.
- **Item encryption:** AES-GCM 256, fresh 96-bit IV per item, stored alongside
  the ciphertext. AAD binds the ciphertext to the item id + owner id
  (`aad = owner_id || item_id`) to prevent ciphertext swapping between items.
- **Passphrase rules:** minimum 12 characters; strength meter (zxcvbn-style,
  client-side); the passphrase is **never** sent to the server, never logged,
  never stored. If the owner forgets it, the vault is unrecoverable — this is
  stated plainly in the UI ("We cannot recover your passphrase. Write it down
  somewhere safe.").
- **Session handling:** derived KEK/DEK live in memory only (a `CryptoKey`
  marked non-extractable where possible); they are cleared on logout and on
  tab close. No `localStorage` persistence of keys.

### 5.3 Keeper access (release-time decryption)
Keepers must be able to read the vault *after* a confirmed release, without
being able to read it *before*. Design:

1. When a keeper accepts an invite, their browser generates an **ECDH P-256
   key pair** (WebCrypto). The public key is uploaded to `keepers.public_key`;
   the private key stays in the keeper's browser (IndexedDB, non-extractable).
2. The owner (in their browser, while the vault is unlocked) derives a shared
   secret with each keeper's public key, derives a wrapping key via HKDF, and
   wraps the DEK for that keeper → stored in `vaults.wrapped_dek_for_keepers`.
3. **Crucially, the wrapped DEK is only *served* to a keeper after the release
   is confirmed** (RLS policy: `wrapped_dek_for_keepers` readable by a keeper
   only when a `release_processes` row for that owner is in state `released`).
   Before release, keepers hold nothing usable.
4. After release, the keeper's browser unwraps the DEK with their private key
   and decrypts the items addressed to them.

**Fallback for the demo / judging:** because the full ECDH flow needs two
browsers, the demo mode seeds a keeper account whose keys are generated in the
same session, so judges can watch the entire release in one browser. The
production flow is identical; only the key provisioning is pre-seeded.

### 5.4 What is encrypted vs. not

| Data | Encrypted? | Why |
|---|---|---|
| Vault item titles & bodies | ✅ AES-GCM | Core private content |
| Letter subjects & bodies | ✅ AES-GCM | Core private content |
| Will-item sensitive notes | ✅ AES-GCM | May contain hints |
| DEK (at rest) | ✅ AES-KW wrapped | Never stored in the clear |
| Service names in will checklist | ❌ plaintext | Needed for checklist UI + keeper sorting; low sensitivity |
| Keeper names / emails | ❌ plaintext | Needed for notifications |
| Heartbeat state / timestamps | ❌ plaintext | Needed for the cron job; no content |
| Check-in IP hash | ❌ SHA-256 hash | Audit only, not reversible |

### 5.5 Security review plan
- A dedicated **Kiro custom agent (`security-review`)** audits the crypto
  module against this design before submission (see `kiro-specs/` steering).
- Vitest unit tests cover: round-trip encrypt/decrypt, wrong-key failure,
  IV uniqueness, AAD binding, PBKDF2 determinism.
- No dependency on any crypto library beyond WebCrypto + audited helpers.

---

## 6. Heartbeat / Grace Period / Keeper State Machine

### 6.1 States (`heartbeat_settings.state`)

```
        ┌──────────────────────────────────────────────────┐
        │                                                  │
        ▼                                                  │
     ALIVE ──(check-in missed, due date passes)──► OVERDUE │
        ▲                                                  │
        │  (check-in at any time before RELEASED)          │ (grace period expires)
        │                                                  ▼
        │                                          AWAITING_KEEPERS
        │                                                  │
        │   (keeper confirms false alarm,                   │ (2 keeper confirmations)
        │    OR owner checks in)                           ▼
        └──────────────────────────────────────────  RELEASED
                                                          (terminal)
```

| State | Meaning | System behaviour |
|---|---|---|
| `ALIVE` | Owner checked in within cadence | Reminder emails at `reminder_days_before` |
| `OVERDUE` | Due date passed, inside grace period | Daily reminders to owner; banner in app; keepers NOT yet notified |
| `AWAITING_KEEPERS` | Grace period expired | Keepers emailed; release process created; owner check-in still cancels |
| `RELEASED` | 2 keepers confirmed | Vault decryptable by keepers; letters delivered; terminal |
| (release `cancelled_false_alarm`) | Owner checked in / keeper flagged false alarm | State returns to `ALIVE`; all parties notified |

### 6.2 Transition rules (the invariants PBT must prove)
1. `ALIVE → OVERDUE` only when `now > next_checkin_due` and no check-in
   recorded since the due date.
2. `OVERDUE → AWAITING_KEEPERS` only when `now > next_checkin_due + grace_days`.
3. `AWAITING_KEEPERS → RELEASED` only when distinct keeper confirmations ≥
   `required_confirmations` (2) and no `false_alarm` decision exists.
4. A `false_alarm` decision by **any** keeper immediately cancels the release
   and returns the owner to `ALIVE` (with a fresh `next_checkin_due`).
5. A check-in in **any** non-terminal state returns the owner to `ALIVE` and
   cancels any open release process.
6. `RELEASED` is terminal — no transition out.
7. `next_checkin_due` is always `last_checkin + cadence_days`; it never moves
   backwards.
8. Reminder emails are idempotent: the cron records which reminders were sent
   per due-date so a retry never double-sends.

### 6.3 Cron / scheduler
- A Supabase Edge Function `heartbeat-tick` runs every 15 minutes (pg_cron):
  1. Find owners in `ALIVE` with `now > next_checkin_due` → `OVERDUE`.
  2. Find owners in `OVERDUE` with `now > next_checkin_due + grace_days` →
      create `release_processes` row, set `AWAITING_KEEPERS`, email keepers.
  3. Send due reminders (idempotent via `notifications` rows).
- All transitions are performed in a single Postgres transaction per owner
  with `SELECT ... FOR UPDATE` to prevent double-processing.

### 6.4 Demo mode (for judges & the video)
Real cadences are days/weeks — unusable for a demo. A **demo account** (seeded,
credentials given to judges in the Devpost private field) runs with
`cadence_days = 0` and a "simulate time" control that advances the owner's
clock in the UI (stored as `demo_time_offset` on the profile, applied only to
that account). This lets a judge watch ALIVE → OVERDUE → AWAITING_KEEPERS →
RELEASED in ~3 minutes. The state machine code is identical; only the clock
input is offset.

---

## 7. UI — The Lantern Theme ("Costume Contest" is won here)

### 7.1 Design language
- **Metaphor:** a single lantern glowing in the dark. The lantern's flame is
  the heartbeat — bright and steady when the owner is alive, flickering when
  overdue, guttering when keepers are being asked, and finally *shared* —
  splitting into small flames, one per keeper — after release.
- **Palette (dark-first):**
  - Background: deep ink `#0B0E14` → `#111827` gradient, with a subtle
    vignette.
  - Lantern glow: warm amber `#F59E0B` / `#FBBF24`, with a soft radial halo.
  - Flame accent: ember orange `#EA580C` for urgent states.
  - Ghostly secondary: pale spectral teal `#5EEAD4` (used sparingly — the
    "wisp" trail).
  - Text: warm off-white `#F5F0E6` (paper-lantern white); muted `#9CA3AF`.
  - Danger / false-alarm: muted red `#DC2626` only for destructive actions.
- **Typography:** a serif display face for headings (e.g. Fraunces or
  Playfair Display — "letters from the past") + Inter for UI text. Letters
  render in a serif, paper-textured card.
- **Motion:** the lantern flame is a gentle CSS/SVG animation (flicker via
  `transform` + opacity keyframes, `prefers-reduced-motion` respected).
  Page transitions are slow fades, never jarring. A faint "wisp" particle
  trail follows the cursor on the landing page only.
- **Indonesian accents (tasteful):** a kuntilanak silhouette in the far
  background of the landing hero (barely visible, atmospheric); a pocong
  figure as the "empty state" illustration for an empty vault ("Nothing here
  yet — the lantern is waiting"); batik-inspired geometric border on letter
  cards. All drawn as original SVG, never stock horror imagery.

### 7.2 Pages
| Route | Purpose |
|---|---|
| `/` | Landing — hero lantern, the problem in one sentence, "Light your lantern" CTA, how-it-works (3 steps), privacy promise, FAQ |
| `/auth/*` | Sign up / sign in / magic link; passphrase creation with strength meter |
| `/app` (dashboard) | The lantern (flame state = heartbeat state), next check-in countdown, big "I'm here" check-in button, vault/letters/will summary cards |
| `/app/vault` | Encrypted items list + editor; unlock with passphrase per session |
| `/app/letters` | Last letters — write, edit, assign recipient keeper, AI-assist badge |
| `/app/will` | Digital will checklist — add accounts, set wishes, assign transfer keepers |
| `/app/keepers` | Invite/manage keepers; see confirmation status during a release |
| `/app/heartbeat` | Cadence + grace settings, check-in history, reminder preview |
| `/keeper/*` | Keeper-facing pages: accept invite, view pending release, confirm / flag false alarm, read released letters |
| `/demo` | Guided demo walkthrough (demo account, simulated clock) |

### 7.3 Key components
- `<LanternFlame state={...} />` — the animated flame; the single most
  important visual asset.
- `<CheckInButton />` — one-tap heartbeat; optimistic UI + confetti-free
  calm confirmation ("The flame burns bright. See you in 14 days.").
- `<VaultUnlock />` — passphrase entry; wrong-passphrase state is gentle,
  never alarming.
- `<LetterCard />` — paper-textured, batik border, serif body, AI-assisted
  badge when applicable.
- `<ReleaseTimeline />` — shows the release process steps and keeper
  confirmations in real time.
- `<WillChecklist />` — per-account wish selector (delete / memorialize /
  transfer / archive / ignore) with keeper assignment.

---

## 8. Features (summary — full specs in `kiro-specs/`)

| # | Feature | Spec folder | Priority |
|---|---|---|---|
| 1 | Auth + onboarding | `auth-onboarding` | P0 — foundation |
| 2 | Encrypted vault | `encrypted-vault` | P0 — core |
| 3 | Heartbeat + grace period | `heartbeat-grace-period` | P0 — core |
| 4 | Keeper confirmation | `keeper-confirmation` | P0 — core |
| 5 | Last letters | `last-letters` | P0 — core |
| 6 | Digital will checklist | `digital-will-checklist` | P1 |
| 7 | Echo (AI-assisted drafting) | `echo-ai-drafting` | P1 — differentiator |

**Build order:** 1 → 2 → 3 → 4 → 5 → 6 → 7. Each feature ships behind its
own spec with requirements → design → tasks, executed through Kiro CLI.

---

## 9. Testing Plan

### 9.1 Property-based testing (Vitest + fast-check) — the Kiroween differentiator
The heartbeat/grace state machine is the heart of the product and the most
testable surface. PBT properties (each must hold for *all* generated inputs):
1. **No premature release:** for any sequence of events, `RELEASED` is
   unreachable unless grace expired AND ≥2 distinct keeper confirmations.
2. **Check-in always rescues:** for any non-terminal state, a check-in event
   leads to `ALIVE`.
3. **False alarm always cancels:** a single `false_alarm` decision cancels
   any open release.
4. **Monotonic due date:** `next_checkin_due` never decreases.
5. **Idempotent reminders:** running the tick twice sends each reminder once.
6. **No duplicate confirmations:** the same keeper cannot confirm twice.
7. **Crypto round-trip:** decrypt(encrypt(m)) = m for arbitrary messages;
   tampering with ciphertext or IV fails authentication.

### 9.2 Unit tests (Vitest)
- Crypto module (key derivation, wrap/unwrap, encrypt/decrypt, failure modes).
- Date/cadence helpers (due-date computation across timezones/DST).
- Email templates render with correct data.
- RLS policy behaviour (via Supabase local test helpers where feasible).

### 9.3 E2E (Playwright)
1. Full onboarding → vault unlock → write letter → invite keeper.
2. Demo-clock release: ALIVE → OVERDUE → AWAITING_KEEPERS → keeper confirms
   → RELEASED → keeper reads letter.
3. False-alarm path: keeper flags false alarm → owner back to ALIVE.
4. Owner check-in during `AWAITING_KEEPERS` cancels the release.
5. Wrong passphrase cannot unlock the vault.

### 9.4 Quality gates (enforced via Kiro agent hooks)
- `pnpm test` + `pnpm lint` + `pnpm typecheck` pass before any commit.
- PBT runs with ≥1,000 iterations per property in CI; ≥100 locally.
- Playwright runs against a seeded Supabase local instance.

---

## 10. Mapping to the 5 Kiroween Judging Criteria (20% each)

| Criterion | How WILL-O'-WISP scores |
|---|---|
| **1. Potential Impact** | Solves a real, universal problem (digital death) for a real audience (everyone with online accounts). The pitch is instantly understandable; the demo shows a family actually receiving a letter. |
| **2. Technological Implementation** | Deep, genuine Kiro use: spec-driven development (7 specs), steering docs, custom agents (security-review), agent hooks (auto-test/lint), MCP (Supabase + Playwright), PBT. Plus real engineering: E2E encryption, a formally-tested state machine, RLS. |
| **3. Design** | A complete, coherent, polished product: one metaphor (the lantern) carried through every screen; dark, calm, emotional design; Indonesian ghost accents that no Western Halloween app has. |
| **4. Innovation / Idea** | Dead-man's-switch + E2E vault + 2-keeper consensus + AI-drafted farewell letters is a combination no existing tool offers; the "Echo" AI feature and the demo-time simulation are novel touches. |
| **5. Presentation** | The demo video tells a story (a grandmother's letter reaching her family) and shows the full release end-to-end in under 3 minutes using the demo clock. The README + Kiro write-up document everything. |

**Bonus prizes targeted:** Best Demo ($1,000 — strong video), Blog Prize
(2,000 Kiro credits — public blog post about building with Kiro), Social
Blitz (3 months Kiro Pro+ — kak rizki's personalised post with
`#KiroweenHackathon26`).

---

## 11. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| 4,000 Kiro credits denied / late | Medium | Build on the 50-credit Free tier + open-weight models; keep prompts efficient; request credits by 24 Nov |
| Kiro CLI login needs kak rizki's browser | Certain | Step-by-step guide in `kiro-cli-setup.md`; device-flow fallback |
| Crypto bug breaks the vault | Medium | PBT + security-review agent + unit tests; keep crypto module small and isolated |
| Supabase free-tier limits during judging | Low | Tiny data volumes; monitor usage; RLS keeps queries scoped |
| 5,600+ entrants — stiff competition | Certain | Target Category ($5,000) / Best Demo ($1,000) as realistic upside; the blog prize is near-guaranteed effort-based value |
| Demo video quality | Medium | Script early; record with the demo clock; keep it under 3 minutes |

---

## 12. Build Timeline (~16 days to 5 Dec 05:00 WIB)

| Days | Work |
|---|---|
| Day 1 (18–19 Nov) | Concept approved → kak rizki: Kiro + Devpost accounts, request 4,000 credits → Kiro CLI login → init repo → copy specs + steering into `.kiro/` |
| Day 2–4 | Foundation: auth, DB schema, vault encryption, UI shell (lantern theme) |
| Day 5–8 | Heartbeat + grace + keeper flow + will checklist |
| Day 9–10 | Last letters + Echo + email notifications |
| Day 11–12 | PBT + e2e + security review + UI polish |
| Day 13–14 | Demo video + Kiro write-up + blog post + README |
| Day 15 | Submit to Devpost + buffer |
| Day 16 | Buffer / resubmit if needed |

---

*Document version: v1 — 18 Nov 2026 (prep draft, copied into the repo on Day 1).
Known gaps fixed during the build: `profiles.onboarding_completed_at` and
`profiles.demo_time_offset` were missing from §4.1 and added in the
profiles migration.*
