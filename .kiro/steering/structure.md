# Steering — Structure

> **PREP-ONLY DRAFT.** This steering doc is preparation for the Kiroween 2026
> build of WILL-O'-WISP. The real build must be executed through the
> authenticated Kiro CLI. Nothing here represents work already done with Kiro.

## Repository layout

```
will-o-wisp/
├── .kiro/
│   ├── steering/            # product.md, tech.md, structure.md (this file)
│   ├── specs/               # one folder per feature
│   │   ├── auth-onboarding/
│   │   ├── encrypted-vault/
│   │   ├── heartbeat-grace-period/
│   │   ├── keeper-confirmation/
│   │   ├── last-letters/
│   │   ├── digital-will-checklist/
│   │   └── echo-ai-drafting/
│   ├── agents/              # custom agents (e.g. security-review)
│   └── hooks/               # agent hooks (test-on-save, lint, docs)
├── app/                     # Next.js App Router
│   ├── (marketing)/         # landing, FAQ, privacy
│   │   └── page.tsx
│   ├── auth/                # sign-in / sign-up / callback
│   ├── app/                 # authenticated owner area
│   │   ├── page.tsx         # dashboard (the lantern)
│   │   ├── vault/
│   │   ├── letters/
│   │   ├── will/
│   │   ├── keepers/
│   │   └── heartbeat/
│   ├── keeper/              # keeper-facing pages
│   │   ├── invite/[token]/
│   │   └── release/[id]/
│   ├── demo/                # guided demo walkthrough
│   └── api/                 # route handlers (thin; logic lives in lib/)
├── components/
│   ├── ui/                  # shadcn/ui primitives (do not hand-edit)
│   ├── lantern/             # LanternFlame, CheckInButton, ReleaseTimeline
│   ├── vault/               # VaultUnlock, VaultItemCard, VaultEditor
│   ├── letters/             # LetterCard, LetterEditor
│   └── will/                # WillChecklist, WillItemRow
├── lib/
│   ├── crypto/              # keys.ts, encrypt.ts, decrypt.ts (WebCrypto only)
│   ├── heartbeat/           # state-machine.ts (pure functions, PBT-tested)
│   ├── supabase/            # client.ts, server.ts, types.ts (generated)
│   ├── email/               # templates + send.ts (Resend)
│   └── utils.ts
├── supabase/
│   ├── migrations/          # numbered SQL migrations (one per feature)
│   └── functions/           # Edge Functions (heartbeat-tick cron)
├── tests/
│   ├── unit/                # Vitest unit tests (mirror lib/)
│   ├── property/            # fast-check PBT (state machine + crypto)
│   └── e2e/                 # Playwright specs
├── public/
│   └── illustrations/       # original SVG: lantern, pocong empty-state,
│                            # kuntilanak hero silhouette, batik borders
├── scripts/
│   └── seed-demo.ts         # seeds the demo account + demo clock data
├── .env.example             # all required env vars, no real values
├── README.md                # setup, demo credentials pointer, Kiro write-up link
├── KIRO-USAGE.md            # the Kiroween-required Kiro usage write-up
└── LICENSE                  # MIT (required: detectable license file)
```

## File naming

- Components: `PascalCase.tsx`, one component per file, colocated test as
  `ComponentName.test.tsx` only when the component has logic worth testing.
- Library modules: `kebab-case.ts`; pure functions preferred; side effects
  isolated in `*-service.ts` files.
- Migrations: `YYYYMMDDHHMMSS_<feature>_<change>.sql`, one feature per file.
- Tests: `*.test.ts(x)` for Vitest; `*.spec.ts` for Playwright.

## Where things live (quick rules)

- **Business rules** (state machine, cadence math) → `lib/heartbeat/` as pure
  functions. No DB calls, no `Date.now()` inside — the clock is a parameter
  (this is what makes PBT and the demo clock possible).
- **Crypto** → `lib/crypto/` only. No other file imports `crypto.subtle`.
- **DB queries** → Supabase client in server components / route handlers /
  server actions. No raw SQL in app code (migrations only).
- **Email content** → `lib/email/templates/`; every template has a plain-text
  version.
- **Demo-only code** → gated behind `DEMO_MODE` env flag + the demo account's
  `demo_time_offset`; never reachable for real accounts.

## The `.kiro/` directory

- `.kiro/` is committed to git and **must never be added to `.gitignore`**
  (Kiroween disqualification rule).
- Specs are the source of truth for what was built and why; update
  `tasks.md` checkboxes as work completes.
- Custom agents live in `.kiro/agents/`; hooks in `.kiro/hooks/`.
