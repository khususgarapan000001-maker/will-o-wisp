# Feature: Echo (AI-Assisted Drafting) — Tasks

> **PREP-ONLY DRAFT** for Kiroween 2026. Execute through the authenticated
> Kiro CLI. Check off each task only when its tests pass.

- [x] 1. Provider setup
  - [x] 1.1 Pick a $0 LLM option at build time (OpenRouter free-tier model first choice); store the key in env vars only
    - Done in code: `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` placeholders in `.env.example`. No key exists yet; Echo shows "AI drafting isn't configured yet" until one is set (needs the user's key decision).
  - [x] 1.2 `lib/echo/provider.ts`: adapter interface + chosen provider implementation
  - [x] 1.3 `lib/echo/prompt.ts`: fixed system prompt
- [x] 2. API route
  - [x] 2.1 `app/api/echo/draft/route.ts`: auth check, input validation (≤2,000 chars), rate limit (5/day/owner), provider call, plain-text response
  - [x] 2.2 Verify the route has NO access to vault/letters/will tables (code review — privacy boundary)
- [x] 3. UI
  - [x] 3.1 `EchoPanel` in the letter editor: notes box, consent notice (first use), draft button, loading/error states
  - [x] 3.2 Draft inserts into the editor as editable text; saving sets `ai_assisted = true`
  - [x] 3.3 Keeper letter view shows the AI-assisted badge (see `last-letters` spec)
- [ ] 4. Tests
  - [x] 4.1 Unit: prompt construction (notes + name only), rate limit, output sanitisation
  - [ ] 4.2 E2E (mocked provider): draft → save → badge visible to keeper
  - [ ] 4.3 Manual: one real draft with the chosen provider — check quality + latency
  - [x] 4.4 Run `pnpm lint && pnpm typecheck && pnpm test` — all green

> Notes: 4.2 is written but not run (`tests/e2e/echo.spec.ts`, mocked provider) but `.skip`ped like the other live specs (needs live Supabase). 4.3 is open: it needs an LLM API key. Rate limit is in-memory per server instance (the DB counter from the design is not built).
