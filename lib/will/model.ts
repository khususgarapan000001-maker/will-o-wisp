/**
 * The will's closed vocabularies: wishes (requirement 5) and categories. Labels
 * and descriptions are the plain-language copy shown to owners and keepers.
 * Mirrors the CHECK constraints in 20261121110000_will_items.sql.
 */

import type { WillCategory, WillWish } from "@/lib/supabase/types";

export const WISHES: readonly WillWish[] = ["delete", "memorialize", "transfer", "archive", "ignore"];
export const CATEGORIES: readonly WillCategory[] = ["social", "finance", "email", "photos", "work", "other"];

export interface WishMeta {
  label: string;
  /** Small glyph shown next to the label (decorative; the label carries the meaning). */
  icon: string;
  /** What this means for the person acting on it. */
  description: string;
}

export const WISH_META: Record<WillWish, WishMeta> = {
  delete: { label: "Delete", icon: "🗑", description: "Close the account and remove its content." },
  memorialize: { label: "Memorialize", icon: "🕯", description: "Keep it as a place to remember me, where the service allows." },
  transfer: { label: "Transfer", icon: "🤝", description: "Hand it over to a keeper." },
  archive: { label: "Archive", icon: "📦", description: "Save a copy of what's there, then close it." },
  ignore: { label: "Ignore", icon: "🌙", description: "Leave it as it is." },
};

export const NO_WISH_LABEL = "No wish yet";

export const CATEGORY_LABELS: Record<WillCategory, string> = {
  social: "Social",
  finance: "Money",
  email: "Email",
  photos: "Photos & files",
  work: "Work",
  other: "Other",
};

export function isWish(value: unknown): value is WillWish {
  return typeof value === "string" && (WISHES as readonly string[]).includes(value);
}

export function isCategory(value: unknown): value is WillCategory {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

/** The plain-language notice required on the will page (requirement 9). */
export const NOT_A_LEGAL_WILL_NOTICE =
  "This is a record of your wishes, not a legal will. For legal effect, consult a lawyer in your country.";

/** The shape of a will item as the pages and components handle it (DB row, snake_case). */
export interface WillItemData {
  id: string;
  service_name: string;
  category: WillCategory;
  wish: WillWish | null;
  transfer_to_keeper_id: string | null;
  notes_ciphertext: string | null;
  iv: string | null;
  sort_order: number;
}
