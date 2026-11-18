# Feature: Echo (AI-Assisted Drafting) — Tasks

> **PREP-ONLY DRAFT** for Kiroween 2026. Execute through the authenticated
> Kiro CLI. Check off each task only when its tests pass.

- [ ] 1. Provider setup
  - [ ] 1.1 Pick a $0 LLM option at build time (OpenRouter free-tier model first choice); store the key in env vars only
  - [ ] 1.2 `lib/echo/provider.ts`: adapter interface + chosen provider implementation
  - [ ] 1.3 `lib/echo/prompt.ts`: fixed system prompt
- [ ] 2. API route
  - [ ] 2.1 `app/api/echo/draft/route.ts`: auth check, input validation (≤2,000 chars), rate limit (5/day/owner), provider call, plain-text response
  - [ ] 2.2 Verify the route has NO access to vault/letters/will tables (code review — privacy boundary)
- [ ] 3. UI
  - [ ] 3.1 `EchoPanel` in the letter editor: notes box, consent notice (first use), draft button, loading/error states
  - [ ] 3.2 Draft inserts into the editor as editable text; saving sets `ai_assisted = true`
  - [ ] 3.3 Keeper letter view shows the AI-assisted badge (see `last-letters` spec)
- [ ] 4. Tests
  - [ ] 4.1 Unit: prompt construction (notes + name only), rate limit, output sanitisation
  - [ ] 4.2 E2E (mocked provider): draft → save → badge visible to keeper
  - [ ] 4.3 Manual: one real draft with the chosen provider — check quality + latency
  - [ ] 4.4 Run `pnpm lint && pnpm typecheck && pnpm test` — all green
