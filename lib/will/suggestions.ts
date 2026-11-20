/** Suggested services (requirement 1) with the category each usually belongs to. */

import type { WillCategory } from "@/lib/supabase/types";

export interface ServiceSuggestion {
  name: string;
  category: WillCategory;
}

export const SERVICE_SUGGESTIONS: readonly ServiceSuggestion[] = [
  { name: "Gmail", category: "email" },
  { name: "Outlook", category: "email" },
  { name: "Yahoo Mail", category: "email" },
  { name: "Instagram", category: "social" },
  { name: "Facebook", category: "social" },
  { name: "WhatsApp", category: "social" },
  { name: "X (Twitter)", category: "social" },
  { name: "TikTok", category: "social" },
  { name: "LinkedIn", category: "work" },
  { name: "Slack", category: "work" },
  { name: "Google Drive", category: "photos" },
  { name: "iCloud", category: "photos" },
  { name: "Google Photos", category: "photos" },
  { name: "Dropbox", category: "photos" },
  { name: "PayPal", category: "finance" },
  { name: "GoPay", category: "finance" },
  { name: "Online banking", category: "finance" },
  { name: "Netflix", category: "other" },
  { name: "Spotify", category: "other" },
];

/** The category suggested for a name typed by the owner, or null when it is not on the list. */
export function suggestCategory(serviceName: string): WillCategory | null {
  const needle = serviceName.trim().toLowerCase();
  if (!needle) return null;
  return SERVICE_SUGGESTIONS.find((s) => s.name.toLowerCase() === needle)?.category ?? null;
}
