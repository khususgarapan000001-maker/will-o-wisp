# Feature: Echo (AI-Assisted Drafting) — Requirements

> **PREP-ONLY DRAFT** for Kiroween 2026. No code exists yet; this spec is to
> be executed through the authenticated Kiro CLI during the real build.

## Introduction

"Echo" helps owners who struggle to find the words: it drafts a farewell
letter or vault message from the owner's own short notes. It is strictly
opt-in, clearly labelled, and the owner always edits the final text. The AI
never sees vault contents — only the notes the owner explicitly pastes into
the Echo prompt.

## Requirements

### 1. Drafting
1. WHEN the owner clicks "Help me draft" in the letter editor THEN they can
   write short bullet notes (e.g. "thank her for the garden; tell him about
   the key in the drawer") and request a draft.
2. WHEN a draft is requested THEN the app calls the configured LLM (see
   design) with ONLY the owner's notes + the recipient's name + a fixed
   system prompt — never with vault contents or other letters.
3. WHEN the draft returns THEN it appears in the editor as editable text;
   the owner can accept, edit, or discard it.
4. WHEN the owner saves a letter that used an Echo draft THEN `ai_assisted`
   is set to true (even if the owner edited it afterwards).

### 2. Labelling & consent
5. WHEN a letter is AI-assisted THEN the keeper's view shows a clear badge:
   "Drafted with AI assistance from the owner's notes".
6. WHEN the owner opens Echo for the first time THEN a short consent notice
   explains: the notes are sent to the AI provider to generate the draft;
   nothing else from the vault is sent.
7. WHEN the owner declines the consent notice THEN Echo stays disabled for
   that letter (they can still write manually).

### 3. Safety & limits
8. WHEN the notes exceed 2,000 characters THEN Echo refuses with a
   plain-language message.
9. WHEN the LLM call fails THEN the editor shows a gentle error and the
   owner's notes are preserved.
10. WHEN the LLM returns content THEN it is rendered as plain text (no
    markdown execution, no links) to avoid prompt-injection rendering issues.

## Out of scope
- Voice / tone cloning from the owner's writing.
- Auto-generating letters without owner notes.
- Any AI feature that reads vault contents.
