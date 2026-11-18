# Feature: Digital Will Checklist — Requirements

> **PREP-ONLY DRAFT** for Kiroween 2026. No code exists yet; this spec is to
> be executed through the authenticated Kiro CLI during the real build.

## Introduction

The digital will is an inventory of the owner's online accounts, each with a
wish: delete it, memorialize it, transfer it to a keeper, archive it, or
leave it alone. Service names are plaintext (needed for the checklist UI);
sensitive notes are encrypted.

## Requirements

### 1. Inventory
1. WHEN the owner adds an account THEN they enter a service name (free text
   or from a suggested list: Gmail, Instagram, Facebook, WhatsApp, etc.),
   pick a category, and pick a wish.
2. WHEN the owner picks wish `transfer` THEN they must pick a recipient
   keeper.
3. WHEN the owner adds a sensitive note THEN it is encrypted (AES-GCM) before
   reaching the server; the service name and wish stay plaintext.
4. WHEN the owner edits or deletes an account THEN the change is reflected
   immediately for the owner and (after release) for keepers.

### 2. Wishes
5. WHEN the owner views the checklist THEN each account shows its wish with
   a clear icon + label: Delete / Memorialize / Transfer / Archive / Ignore.
6. WHEN the owner has accounts without a wish THEN the dashboard checklist
   prompts them to set one.

### 3. Keeper view
7. WHEN a release is confirmed THEN keepers see the full checklist (service
   names + wishes + transfer assignments; encrypted notes decrypted in their
   browser).
8. WHEN a keeper views the checklist THEN transfer items assigned to them are
   highlighted.

### 4. Legal clarity
9. WHEN the will page is rendered THEN it shows a plain-language notice:
   "This is a record of your wishes, not a legal will. For legal effect,
   consult a lawyer in your country."
10. WHEN the checklist is empty THEN the page shows the pocong empty-state
    illustration with a prompt to add the first account.

## Out of scope
- Automated account deletion / API-driven actions on third-party services.
- Importing accounts from a password manager.
