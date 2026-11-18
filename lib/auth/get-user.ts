import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Returns the authenticated Supabase user for the current request, or `null`
 * for an anonymous visitor.
 *
 * Uses `auth.getUser()` (a server-side JWT verification call) rather than
 * `auth.getSession()` (which trusts the cookie without re-verifying). This is
 * the recommended approach for server-side auth checks.
 *
 * Never throws for an unauthenticated request — callers should treat a `null`
 * return as "not signed in".
 */
export async function getUser(): Promise<User | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();

    if (error !== null) {
      // AuthSessionMissingError is normal for anonymous visitors; log others.
      if (error.name !== "AuthSessionMissingError") {
        console.error("[get-user] unexpected auth error:", error.message);
      }
      return null;
    }

    return data.user ?? null;
  } catch (err) {
    // Defensive catch: if the Supabase client itself throws (e.g. misconfigured
    // env vars at build time), we return null rather than crashing the page.
    console.error("[get-user] caught unexpected error:", err);
    return null;
  }
}
