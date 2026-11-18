import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

// Guard against missing env vars at build time.
// The server client is only called at runtime (inside server components /
// route handlers), so falling back to empty strings prevents import-time
// throws during `next build` without a live Supabase project.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Returns a Supabase client for use in server components, route handlers,
 * and server actions.
 *
 * Always create a new client per request — never cache or share across
 * requests. The cookie store is request-scoped.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // `setAll` is called from a server component where cookies cannot
          // be set. The middleware handles session refresh, so this is safe
          // to ignore. See: https://supabase.com/docs/guides/auth/server-side
        }
      },
    },
  });
}
