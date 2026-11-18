# Feature: Last Letters — Requirements

> **PREP-ONLY DRAFT** for Kiroween 2026. No code exists yet; this spec is to
> be executed through the authenticated Kiro CLI during the real build.

## Introduction

Last Letters are the emotional core of the product: personal messages the
owner writes now, delivered to a specific keeper automatically when a release
is confirmed. They are encrypted like vault items and rendered as beautiful
paper letters.

## Requirements

### 1. Writing letters
1. WHEN the owner creates a letter THEN they pick one recipient keeper, write
   a subject + body, and the letter is encrypted (AES-GCM, same module as
   vault items) before it reaches the server.
2. WHEN the owner saves a letter THEN they can mark it as a draft or final;
   only final letters are delivered on release.
3. WHEN the owner edits a letter THEN it is re-encrypted with a fresh IV.
4. WHEN the owner deletes a letter THEN its row is hard-deleted.

### 2. Delivery
5. WHEN a release is confirmed THEN every final letter is delivered to its
   recipient keeper: an email containing the letter (decrypted in the
   keeper's browser via a secure link, not in the email body — see design)
   plus an in-app letter view.
6. WHEN a letter is delivered THEN `delivered_at` is set and the owner-side
   record shows "Delivered".
7. WHEN a letter is addressed to a keeper who was revoked before release THEN
   it is not delivered.

### 3. Presentation
8. WHEN a keeper reads a letter THEN it renders as a paper letter card
   (serif type, batik-inspired border, the owner's name + date written).
9. WHEN a letter was drafted with Echo (AI assistance) THEN it shows a clear
   badge: "Drafted with AI assistance from the owner's notes".
10. WHEN the owner previews a letter THEN they see exactly what the keeper
    will see.

### 4. Limits (free-tier safety)
11. WHEN a letter body exceeds 10,000 characters THEN the editor refuses to
    save with a plain-language message.
12. WHEN an owner has 50 letters THEN creating another is blocked with a
    plain-language message.

## Out of scope
- Scheduled (date-based) letter delivery independent of release.
- Letter attachments / photos.
