# Feature: Digital Will Checklist — Design

> **PREP-ONLY DRAFT** for Kiroween 2026. No code exists yet; this spec is to
> be executed through the authenticated Kiro CLI during the real build.

## Overview

A simple CRUD list with one encrypted field. The interesting design points
are the wish taxonomy, the keeper transfer assignment, and the plaintext /
encrypted split (service names plaintext for UI sorting and keeper scanning;
notes encrypted because they may contain hints).

## Components

| Component / module | Responsibility |
|---|---|
| `app/app/will/page.tsx` | Owner's checklist page (grouped by category) |
| `components/will/WillChecklist.tsx` | List + grouping + wish filter |
| `components/will/WillItemRow.tsx` | One account: name, category, wish selector, transfer-keeper picker, encrypted notes field |
| `app/keeper/will/page.tsx` | Keeper checklist view (read-only, transfer highlights) |
| `lib/will/suggestions.ts` | Suggested service list (Gmail, Instagram, …) + category mapping |

## Data model (see design-doc §4.10)

- `will_items`: `service_name` (plaintext), `category`, `wish`,
  `transfer_to_keeper_id`, `notes_ciphertext` + `iv` (nullable), `sort_order`.
- RLS: owner full access; keepers read-only after release.

## Key decisions

- **Plaintext service names are a deliberate trade-off**, documented in
  design-doc §5.4: a checklist the keeper can't scan is useless, and service
  names alone are low-sensitivity. Anything sensitive goes in the encrypted
  notes field.
- **Wish is a closed enum** (`delete | memorialize | transfer | archive |
  ignore`) — no free text, so keepers get unambiguous instructions.
- **`transfer` requires a keeper** (enforced by a DB check constraint, not
  just UI validation).
- **No automation:** the checklist is instructions for humans. Automated
  deletion would need third-party credentials and is out of scope.

## Error handling

- Decryption failure on a note → that note shows "Couldn't decrypt this
  note" and the rest of the checklist renders.
- Transfer keeper revoked before release → the item still shows with a
  "keeper no longer available" flag so keepers can decide among themselves.

## Testing

- Unit: wish enum validation, transfer-requires-keeper constraint, category
  grouping.
- E2E: add/edit/delete account; set transfer wish; (demo clock) release →
  keeper sees checklist with their transfers highlighted.
