# Steering — Product

> **PREP-ONLY DRAFT.** This steering doc is preparation for the Kiroween 2026
> build of WILL-O'-WISP. The real build must be executed through the
> authenticated Kiro CLI. Nothing here represents work already done with Kiro.

## What WILL-O'-WISP is

A **Digital Legacy Keeper**: a web app that keeps a person's digital
afterlife in order. The owner checks in periodically (a "heartbeat"); if the
heartbeat stops past a grace period, two trusted "keepers" must confirm
before the owner's encrypted vault — last letters, credential pointers,
instructions, and a digital will — is released to them.

**One-line pitch:** *"A lantern for your digital afterlife — your words, your
wishes, released only when you're truly gone, and only to the people you
chose."*

## Who it is for

- **Owners** — anyone with online accounts who wants their family to be able
  to act when they can't. Primary user; the app must feel calm, not morbid.
- **Keepers** — trusted people (spouse, sibling, close friend) who confirm a
  release and then receive letters and instructions.
- **Judges / demo viewers** — must understand the product in under 60 seconds
  and see a full release in under 3 minutes (demo mode with a simulated clock).

## Core value propositions

1. **Privacy is real, not a slogan.** End-to-end encryption (WebCrypto
   AES-GCM). The server never sees plaintext. If we can't defend a privacy
   claim in the code, we don't make it in the UI.
2. **No false triggers.** A lost phone or a long holiday must never release
   someone's letters. Grace period + 2-keeper confirmation + owner check-in
   at any point before release.
3. **Calm, not scary.** Death is the subject; the tone is gentle, warm, and
   practical. Never use alarmist language, never use horror clichés.
4. **It actually works end-to-end.** A judge must be able to complete a full
   release in the demo without waiting days and without reading a manual.

## Voice & tone

- Warm, plain, respectful. Short sentences. No jargon in user-facing copy.
- The lantern metaphor is used consistently: flame = heartbeat, light =
  release, keepers = people who carry the light.
- Error states are gentle ("That passphrase didn't unlock the vault — try
  again, or check the hint you left yourself.") Never blame the user.
- All user-facing copy in English (Kiroween requires English submission
  materials). Code comments in English.

## What we do NOT do

- We do **not** store live passwords or secrets — the vault holds *pointers*
  and instructions (e.g. "the password manager hint is in the safe").
- We do **not** claim legal validity — the digital will is a wishes document,
  labelled "not a legal will".
- We do **not** sell, share, or analyse user data. There is no analytics
  beyond basic, anonymous, self-hosted page counts (and even that is
  optional).
- We do **not** use dark patterns: no fake urgency, no guilt-tripping the
  owner into checking in.

## Success criteria for the hackathon

- A working app at a public URL, with a demo account that completes a full
  release in ~3 minutes.
- All 7 specs implemented and tested (PBT for the state machine, e2e for the
  release flow).
- A <3-minute demo video telling one human story end-to-end.
- A Kiro usage write-up documenting genuine spec-driven development.
