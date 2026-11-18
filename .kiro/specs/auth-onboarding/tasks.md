# Feature: Auth + Onboarding — Tasks

> **PREP-ONLY DRAFT** for Kiroween 2026. Execute through the authenticated
> Kiro CLI. Check off each task only when its tests pass.

- [ ] 1. Project scaffolding
  - [ ] 1.1 Initialise Next.js 15 (App Router, TypeScript strict) + Tailwind + shadcn/ui; verify `pnpm dev` serves the starter page
  - [ ] 1.2 Add `.env.example` (Supabase URL, anon key, service key placeholder, Resend key placeholder); verify `.env.local` is gitignored
  - [ ] 1.3 Create Supabase project (free tier) and link it; run `pnpm db:types` to generate TS types
- [ ] 2. Database migration: profiles + trigger
  - [ ] 2.1 Migration `profiles` table + RLS (owner can read/update own row only)
  - [ ] 2.2 Trigger: on `auth.users` insert, create `profiles` row
  - [ ] 2.3 Verify: create a test user in the Supabase dashboard and confirm the profile row appears
- [ ] 3. Supabase clients + route protection
  - [ ] 3.1 `lib/supabase/client.ts` (browser) and `server.ts` (server + cookies)
  - [ ] 3.2 `middleware.ts` protecting `/app/*` and `/keeper/*`; unauthenticated users redirect to `/auth/sign-in`
  - [ ] 3.3 `lib/auth/get-user.ts` server helper
- [ ] 4. Auth pages
  - [ ] 4.1 Sign-up page (email + password, validation, Supabase sign-up call)
  - [ ] 4.2 Sign-in page + magic-link request
  - [ ] 4.3 Auth callback route handler
  - [ ] 4.4 Sign-out (clears session + in-memory keys)
- [ ] 5. Onboarding wizard
  - [ ] 5.1 Wizard shell with step state persisted server-side (resume on refresh)
  - [ ] 5.2 Step (a): display name + timezone
  - [ ] 5.3 Step (b): vault passphrase creation with strength meter (uses `encrypted-vault` crypto module — coordinate with that spec)
  - [ ] 5.4 Step (c): heartbeat cadence + grace period (creates `heartbeat_settings` row)
  - [ ] 5.5 Step (d): invite 2 keepers (skippable; uses `keeper-confirmation` invite flow)
  - [ ] 5.6 Step (e): write first letter (skippable; uses `last-letters` editor)
  - [ ] 5.7 Completion: set `onboarding_completed_at`, redirect to dashboard
- [ ] 6. Dashboard setup checklist (unfinished onboarding items)
- [ ] 7. Tests
  - [ ] 7.1 Unit tests: wizard validation, `get-user` helper
  - [ ] 7.2 E2E: sign-up → onboarding → dashboard; wrong-password error; magic-link callback
  - [ ] 7.3 Run `pnpm lint && pnpm typecheck && pnpm test` — all green
