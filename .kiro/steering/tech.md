# Steering — Tech

> **PREP-ONLY DRAFT.** This steering doc is preparation for the Kiroween 2026
> build of WILL-O'-WISP. The real build must be executed through the
> authenticated Kiro CLI. Nothing here represents work already done with Kiro.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript (strict) |
| Styling | Tailwind CSS + shadcn/ui |
| Backend / DB | Supabase (Postgres + Auth + Edge Functions), RLS on everywhere |
| Email | Resend free tier (fallback: Supabase SMTP) |
| Crypto | WebCrypto only (AES-GCM, PBKDF2-SHA-256, AES-KW, ECDH P-256) — no third-party crypto libraries |
| Unit + PBT | Vitest + fast-check |
| E2E | Playwright |
| Hosting | Vercel Hobby (web) + Supabase Free |
| Package manager | pnpm |

## Commands

```bash
pnpm dev          # run the app locally
pnpm build        # production build (must pass before any PR/commit)
pnpm lint         # ESLint
pnpm typecheck    # tsc --noEmit
pnpm test         # Vitest (unit + PBT)
pnpm test:e2e     # Playwright
pnpm db:types     # regenerate Supabase TS types after a migration
```

## Conventions

- **TypeScript strict** everywhere. No `any` in new code; prefer `unknown`
  + narrowing. No `// @ts-ignore` without a comment explaining why.
- **Server Components by default**; `"use client"` only where interactivity
  or WebCrypto is needed (crypto runs in the browser, always).
- **All DB access through Supabase client + RLS.** Never bypass RLS with the
  service-role key in app code — the service key is used only by Edge
  Functions (cron) and seed scripts.
- **Secrets:** only via environment variables (`.env.local`, never committed).
  Never log a passphrase, key, token, or ciphertext.
- **Dates:** store UTC `timestamptz`; display in the owner's timezone
  (`Intl.DateTimeFormat`, profile timezone, default `Asia/Jakarta`).
- **IDs:** `uuid` v4 from the DB (`gen_random_uuid()`), never client-generated
  sequential ids.
- **Errors:** user-facing errors are gentle plain language; technical detail
  goes to the server log only.

## Crypto rules (non-negotiable)

1. The passphrase **never** leaves the browser and is **never** stored.
2. Keys live in memory only (non-extractable `CryptoKey` where possible);
   cleared on logout / tab close.
3. Fresh 96-bit random IV per encrypted item; AAD = `owner_id || item_id`.
4. PBKDF2-SHA-256 with 600,000 iterations; per-vault random 32-byte salt.
5. The DEK is wrapped (AES-KW) at rest — never stored in the clear.
6. Any change to `lib/crypto/*` requires a review by the `security-review`
   custom agent (see `.kiro/agents/` once created) before merging.

## Testing rules

- **PBT is mandatory** for the heartbeat/grace state machine and the crypto
  round-trip (see design-doc §9.1 for the properties).
- PBT: ≥100 iterations locally, ≥1,000 in CI.
- Every feature spec ends with tests; a task is not done until its tests pass.
- E2E covers: onboarding, full release (demo clock), false-alarm path,
  check-in rescue, wrong-passphrase unlock failure.
- Agent hooks (to be configured in Kiro): run `pnpm lint` + `pnpm typecheck`
  + affected Vitest files on save; run the full suite before commit.

## Accessibility & performance

- Semantic HTML; keyboard-navigable; focus states visible; colour contrast
  ≥ WCAG AA on the dark theme.
- Respect `prefers-reduced-motion` (flame animation + wisp particles off).
- No layout shift on the dashboard; the lantern renders immediately (CSS/SVG,
  no JS dependency for the first paint).
