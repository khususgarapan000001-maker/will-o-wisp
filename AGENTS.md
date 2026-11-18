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
- No live Supabase project exists yet — migrations are written but not
  applied; `pnpm db:types` needs a linked project.
