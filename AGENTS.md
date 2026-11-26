# AGENTS.md — working notes for this repo (Kiro + future sessions)

## Environment quirks (this VM)

- **`pnpm add` does NOT work inside this repo.** The workspace filesystem
  forbids `chown`, and pnpm writes `package.json`/lockfiles via atomic writes
  that chown — every `pnpm add` here fails with EPERM (after writing the
  lockfiles). NEVER run `pnpm add` in the repo. To add a dependency:
  1. `rm -rf /root/wow-add && mkdir -p /root/wow-add`
  2. Copy `package.json` + `pnpm-lock.yaml` there, run `pnpm add <deps>` there.
  3. Copy both files back, then `rm -rf node_modules && pnpm install --frozen-lockfile`.
  (`/root` is on the overlay fs, where chown works. `/tmp` is a 512M tmpfs —
  do NOT use it for pnpm work; the store alone exceeds it.)
- **Google Fonts is unreachable from this VM** — `next/font/google` breaks
  `pnpm build`. Fonts are self-hosted via `@fontsource-variable/*`; do not
  switch back to `next/font/google`.
- **Kiro CLI** lives at `~/.local/bin/kiro-cli` (not on PATH):
  `export PATH="$HOME/.local/bin:$PATH"`.
- **Credit checks must use the v2 engine**: `kiro-cli chat --v2
  --no-interactive --trust-all-tools --trust-workspace "/usage"`.
  Without `--v2`, the v3 agent treats `/usage` as a prompt, explores the
  workspace, and burns credits without reporting the balance. (v2 returns
  the balance in ~4s and costs 0 credits.)
- **pnpm** lives at `~/.local/bin/pnpm` (v10.34.9, installed with
  `npm install -g --prefix ~/.local pnpm@10`); the store is at
  `~/.local/share/pnpm/store`. `/usr/bin/pnpm` does NOT survive a runtime
  restart (ephemeral) — if `pnpm` is missing, reinstall with the npm command
  above (do NOT waste time hunting for it elsewhere). Use pnpm **10**, not
  12: pnpm 12's default `minimum-release-age` policy rejects this lockfile
  (several pinned versions were published within the last days). The repo
  `.npmrc` sets `minimum-release-age=0` as a backstop. If `node_modules` is
  wiped or broken, rebuild with `pnpm install --frozen-lockfile` (install
  works in-repo; only `pnpm add` is broken).
- **Kiro CLI sessions can get stuck** hunting for a missing binary or
  re-running a failing check. If a session makes no log progress for ~10 min,
  kill it and resume with the verified facts stated explicitly.

## Rules

- Never add `.kiro/` to `.gitignore` (Kiroween requires it committed).
- Never commit `.env.local` or real keys. Only `.env.example` (placeholders).
- Quality gate before every commit: `pnpm lint && pnpm typecheck && pnpm test`
  green; `pnpm build` green before pushing a feature.
- **Supabase project EXISTS** (19 Nov 2026, created by the user):
  `will-o-wisp`, ref `hdkuhnwvufndcsikmdil`, Singapore (ap-southeast-1),
  URL `https://hdkuhnwvufndcsikmdil.supabase.co`. `.env.local` is wired
  (URL + publishable/anon key, verified live — auth health 200) and gitignored.
  All 3 migrations APPLIED 19 Nov 2026 via the dashboard SQL Editor
  (profiles, heartbeat_settings, vaults, vault_items — all 200 via REST).
  The remaining 12 migrations (Specs 3–7) were APPLIED 21 Nov 2026 via the
  SQL Editor (device browser) — all 7 new tables verified live via REST
  (checkins, notifications, release_processes, keepers,
  keeper_confirmations, letters, will_items). All 15 migrations are now
  live. `lib/supabase/types.ts` was REGENERATED 26 Nov 2026 via the
  Management API (`GET /v1/projects/{ref}/types/typescript`, scoped PAT
  `will-o-wisp-agent`, Database Read) — the CLI link is still unnecessary.
  The schema uses text+CHECK columns (no PG enums), so an app-alias block
  (KeeperStatus, LetterStatus, WillWish, …) is appended at the end of
  types.ts; re-append it after every regeneration.
- **Edge Function DEPLOYED** (21 Nov 2026, via the dashboard editor — NOT the
  CLI: `supabase login` hangs on the build VM, TUI stalls after the
  verification code is entered, no token is ever written). Function
  `heartbeat-tick` is live at `/functions/v1/heartbeat-tick`, JWT
  verification OFF (the function authenticates itself via
  HEARTBEAT_CRON_SECRET), pg_cron + pg_net enabled, cron job `heartbeat-tick`
  (jobid 1) runs every 15 min via a Vault secret. Manual test: HTTP 200,
  `{"owners":0,"errors":0,"mailer":"log"}`. Resend INSTALLED 26 Nov 2026:
  account khususgarapan000001@gmail.com verified, API key `will-o-wisp`
  (Sending access) set as Edge Function secret RESEND_API_KEY plus
  APP_URL=https://will-o-wisp.vercel.app; manual test now returns
  `"mailer":"resend"` (0 owners, so no email was actually sent). The deployed code is
  `supabase/functions/heartbeat-tick/index.dashboard.ts` — same code as
  `index.ts` except lib/ imports point at the raw GitHub URLs of the same
  files (the dashboard editor cannot see the repo checkout); transitive
  relative imports inside lib/ resolve against raw.githubusercontent.com.
  The cron secret value lives OUTSIDE the repo at
  `~/workspace/kiroween/.heartbeat-cron-secret` (0600) — never commit it,
  never print it. If the function code changes, update BOTH index.ts and
  index.dashboard.ts and re-deploy via the dashboard editor.
- **Vercel DEPLOYED** (22 Nov 2026, 00:49 WIB): account created via GitHub
  (khususgarapan000001-maker, Hobby/free), project `will-o-wisp` imports
  this repo with auto-deploy from main. LIVE at
  https://will-o-wisp.vercel.app (verified HTTP 200 + landing content).
  Env vars set (Production + Preview): NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_APP_URL (= the Vercel
  domain), OPENROUTER_API_KEY (a NEW key the user created ~00:40 WIB —
  different from the `will-o-wisp-echo` key in the vault, which is still
  valid for Echo testing). Every push to main triggers a redeploy.
