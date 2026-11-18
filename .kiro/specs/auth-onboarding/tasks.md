# Feature: Auth + Onboarding — Tasks

> **PREP-ONLY DRAFT** for Kiroween 2026. Execute through the authenticated
> Kiro CLI. Check off each task only when its tests pass.

- [ ] 1. Project scaffolding
  - [x] 1.1 Initialise Next.js 15 (App Router, TypeScript strict) + Tailwind + shadcn/ui; verify `pnpm dev` serves the starter page
  - [x] 1.2 Add `.env.example` (Supabase URL, anon key, service key placeholder, Resend key placeholder); verify `.env.local` is gitignored
  - [ ] 1.3 Create Supabase project (free tier) and link it; run `pnpm db:types` to generate TS types
- [x] 2. Database migration: profiles + trigger
  - [x] 2.1 Migration `profiles` table + RLS (owner can read/update own row only)
  - [x] 2.2 Trigger: on `auth.users` insert, create `profiles` row
  - [ ] 2.3 Verify: create a test user in the Supabase dashboard and confirm the profile row appears
- [x] 3. Supabase clients + route protection
  - [x] 3.1 `lib/supabase/client.ts` (browser) and `server.ts` (server + cookies)
  - [x] 3.2 `middleware.ts` protecting `/app/*` and `/keeper/*`; unauthenticated users redirect to `/auth/sign-in`
  - [x] 3.3 `lib/auth/get-user.ts` server helper
- [x] 4. Auth pages
  - [x] 4.1 Sign-up page (email + password, validation, Supabase sign-up call)
  - [x] 4.2 Sign-in page + magic-link request
  - [x] 4.3 Auth callback route handler
  - [x] 4.4 Sign-out (clears session + in-memory keys)
- [x] 5. Onboarding wizard
  - [x] 5.1 Wizard shell with step state persisted server-side (resume on refresh)
  - [x] 5.2 Step (a): display name + timezone
  - [x] 5.3 Step (b): vault passphrase creation with strength meter — fully wired to real crypto vault creation flow (Spec 2): browser derives KEK (PBKDF2-SHA-256, 600k iterations) → generates DEK → wraps DEK (AES-KW) → persists only {salt, wrapped_dek} via `createVaultAction`. Passphrase, DEK, KEK never leave the browser. "We cannot recover this passphrase" notice retained. Not-configured-Supabase state shows a friendly notice and allows skipping — consistent with other auth pages.
  - [x] 5.4 Step (c): heartbeat cadence + grace period (creates `heartbeat_settings` row); migration 20261118160000_heartbeat_settings.sql added
  - [x] 5.5 Step (d): invite 2 keepers (skippable explainer; full flow is Spec 4)
  - [x] 5.6 Step (e): write first letter (skippable explainer; editor is Spec 5)
  - [x] 5.7 Completion: set `onboarding_completed_at`, redirect to dashboard
- [x] 6. Dashboard setup checklist (unfinished onboarding items)
- [x] 7. Tests
  - [x] 7.1 Unit tests: wizard validation (tests/unit/onboarding-validation.test.ts — 37 tests); `get-user` already done
  - [ ] 7.2 E2E: sign-up → onboarding → dashboard; wrong-password error; magic-link callback — BLOCKED (no live Supabase project); specs written in tests/e2e/auth-onboarding.spec.ts with test.describe.skip + explanation comment. Test 1 assumptions checked statically (18 Nov 2026): "Your name" label exists in StepA; email-confirmation-OFF still unverified until a live project exists.
  - [x] 7.3 Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — all green
