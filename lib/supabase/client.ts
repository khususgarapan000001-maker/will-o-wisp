"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

// Guard against missing env vars at build time.
// The browser client is only called at runtime (inside components), so
// returning a stub-free client with empty strings is safe — Supabase will
// simply fail to connect, which is the expected behaviour with no project.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Returns a Supabase client for use in browser (client) components.
 *
 * Call this inside a component or hook — do not call it at module level
 * and cache the result, as `createBrowserClient` manages its own singleton.
 */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
