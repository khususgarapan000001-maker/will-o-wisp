# WILL-O'-WISP — Digital Legacy Keeper

> *A lantern for your digital afterlife — your words, your wishes, released
> only when you're truly gone, and only to the people you chose.*

**Kiroween 2026 · Costume Contest** — built with
[Kiro](https://kiro.dev) (spec-driven development: see [`.kiro/`](.kiro/)).

## What it is

WILL-O'-WISP is a Digital Legacy Keeper. You check in periodically (a
"heartbeat"), keep an end-to-end encrypted vault of messages and instructions
for chosen "keepers", write last letters, and record a digital will. If your
heartbeat stops past a grace period, **two keepers must confirm** before
anything is released — so a lost phone or a long holiday can never trigger a
false release.

- **End-to-end encrypted vault** — WebCrypto AES-GCM in the browser; the
  server never sees plaintext. Your vault passphrase never leaves your device.
- **Heartbeat + grace period** — a formally-tested state machine
  (ALIVE → OVERDUE → AWAITING_KEEPERS → RELEASED), with check-in rescue and
  false-alarm cancellation at any point before release.
- **Keeper consensus** — 2-of-2 confirmations required; any keeper can flag a
  false alarm.
- **Last letters & digital will** — per-account wishes (delete / memorialize /
  transfer / archive / ignore) for the people you trust.

The theme is the product: legacy and loss *are* the haunting. A lantern in
the dark, with tasteful Indonesian ghost accents.

## Stack (all free tier)

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript (strict) |
| Styling | Tailwind CSS + shadcn/ui |
| Backend / DB | Supabase (Postgres + Auth + Edge Functions), RLS on |
| Email | Resend free tier (fallback: Supabase SMTP) |
| Crypto | WebCrypto only (AES-GCM, PBKDF2-SHA-256, AES-KW, ECDH P-256) |
| Tests | Vitest + fast-check (property-based) + Playwright (e2e) |
| Hosting | Vercel Hobby + Supabase Free |
| Package manager | pnpm |

## Development

```bash
pnpm install
cp .env.example .env.local   # fill in your Supabase project values
pnpm dev                     # http://localhost:3000
```

| Command | What it does |
|---|---|
| `pnpm dev` | Run the app locally |
| `pnpm build` | Production build (must pass before commit) |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest (unit + property-based) |
| `pnpm test:e2e` | Playwright |
| `pnpm db:types` | Regenerate Supabase TS types (needs a linked Supabase project) |

## Project status

Built feature by feature from the specs in [`.kiro/specs/`](.kiro/specs/).
Build order: auth-onboarding → encrypted-vault → heartbeat-grace-period →
keeper-confirmation → last-letters → digital-will-checklist →
echo-ai-drafting. Current state:

- [x] Day 1: repo, specs, scaffolding (Next.js 15 + Tailwind v4 + shadcn/ui + Vitest + Playwright)
- [x] Spec 1: auth + onboarding — done except items blocked on a live Supabase project (task 2.3 dashboard verification, 7.2 live E2E run) and on Spec 2 (5.3 vault crypto wiring)
- [ ] Spec 2: encrypted vault
- [x] Spec 3: heartbeat + grace period — code + tests done; pending human steps: apply 3 migrations, deploy `heartbeat-tick` + pg_cron, Resend key, live E2E (see `supabase/functions/heartbeat-tick/README.md`)
- [x] Spec 4: keeper confirmation — code + tests done; pending human steps: apply 4 migrations (`20261121090000`–`090300`), live E2E (see `.kiro/specs/keeper-confirmation/tasks.md`)
- [x] Spec 5: last letters — code + tests done; pending human steps: apply 2 migrations (`20261121100000`, `20261121100100`), re-run `pnpm seed-demo`, live E2E (see `.kiro/specs/last-letters/tasks.md`)
- [ ] Spec 6: digital will checklist
- [ ] Spec 7: Echo (AI-assisted drafting)

## Privacy promise

Your vault passphrase is **never** sent to the server, never logged, never
stored. If you forget it, the vault is unrecoverable — we say so plainly in
the UI. The vault stores *pointers* and instructions, never live passwords.

## License

MIT — see [LICENSE](LICENSE).
