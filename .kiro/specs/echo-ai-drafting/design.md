# Feature: Echo (AI-Assisted Drafting) — Design

> **PREP-ONLY DRAFT** for Kiroween 2026. No code exists yet; this spec is to
> be executed through the authenticated Kiro CLI during the real build.

## Overview

Echo is a thin, well-bounded AI feature: one API route, one prompt, one
consent gate. The model provider is chosen for the $0 budget — the primary
choice is an OpenRouter free-tier model (or any free-tier chat API available
at build time); the route is provider-agnostic behind a small `lib/echo/`
adapter so the model can be swapped without touching the UI.

**Privacy boundary (the key design point):** Echo's input is *only* what the
owner types into the Echo notes box in that moment. The route handler
receives the notes from the client; it never queries the vault, letters, or
will tables. This is enforced by code structure (the route has no DB access
to encrypted tables) and stated in the consent notice.

## Components

| Component / module | Responsibility |
|---|---|
| `components/letters/EchoPanel.tsx` | Notes textarea, consent notice, "Draft" button, loading + error states |
| `app/api/echo/draft/route.ts` | Rate-limited route: validates input, calls the LLM adapter, returns plain text |
| `lib/echo/provider.ts` | Provider adapter interface + OpenRouter free-tier implementation |
| `lib/echo/prompt.ts` | Fixed system prompt (warm, respectful, first-person, no clichés, no religious assumptions) |

## System prompt (draft — refine during build)

> You are helping someone write a farewell letter to a loved one. Use ONLY
> the notes provided. Write in the first person, as the letter-writer. Be
> warm, specific, and plain-spoken. Do not invent memories, facts, or
> details not in the notes. Do not use religious language unless the notes
> do. Keep it under 400 words. Output only the letter text.

## Key decisions

- **Provider-agnostic adapter** — free-tier LLM availability changes fast;
  the adapter pattern lets the build pick whatever free option works at the
  time (OpenRouter free models first).
- **Server-side route, not client-side API key** — the provider key stays in
  env vars; the client never sees it.
- **Rate limiting** — 5 drafts per owner per day (in-memory + DB counter);
  prevents runaway cost and abuse.
- **Plain-text output** — the response is treated as untrusted text and
  rendered without markdown/HTML, so a weird model output can't inject
  anything.
- **`ai_assisted` is sticky** — once a draft was used, the flag stays true
  even after heavy editing. Honesty to the recipient matters more than the
  owner's vanity.

## Error handling

- Provider down / rate-limited → gentle error, notes preserved, "try again
  later".
- Empty or over-long notes → client-side validation before any API call.
- Response over 2,000 characters → truncated with a note.

## Testing

- Unit: prompt construction (notes + recipient name only — assert no other
  fields are included), rate-limit counting, output sanitisation.
- E2E (mocked provider): open Echo → write notes → draft appears → save
  letter → `ai_assisted` true → keeper view shows the badge.
- Manual: one real draft with the chosen free provider before submission, to
  verify quality and latency.
