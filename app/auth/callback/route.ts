import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth callback route handler.
 *
 * Supabase redirects here after:
 * - Email confirmation (sign-up)
 * - Magic link click
 * - OAuth callback (not used in v1 but handled gracefully)
 *
 * It exchanges the one-time `code` query parameter for a session, then
 * redirects the user to their intended destination (or /app as a fallback).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const otpType = searchParams.get("type");
  const errorParam = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // The `next` / `redirectTo` parameter carries the original destination.
  const next = searchParams.get("next") ?? searchParams.get("redirectTo") ?? "/app";
  // Sanitise: only allow relative paths to prevent open-redirect attacks.
  const destination = next.startsWith("/") ? next : "/app";

  // Handle Supabase-level errors (e.g. expired OTP link).
  if (errorParam) {
    console.error(`[auth/callback] provider error: ${errorParam} — ${errorDescription}`);
    return NextResponse.redirect(
      `${origin}/auth/sign-in?error=${encodeURIComponent(
        "That link has expired or already been used. Please sign in again."
      )}`
    );
  }

  // Email-link flow used by heartbeat reminders: the Edge Function builds the
  // link from an admin-generated magic-link token hash (no PKCE verifier exists
  // for those), so verify it server-side. Only magic-link types are accepted.
  if (tokenHash && (otpType === "magiclink" || otpType === "email")) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.verifyOtp({
        type: otpType,
        token_hash: tokenHash,
      });
      if (error) {
        console.error("[auth/callback] verifyOtp error:", error.message);
        return NextResponse.redirect(
          `${origin}/auth/sign-in?error=${encodeURIComponent(
            "That link has expired or already been used. Please sign in again."
          )}`
        );
      }
      return NextResponse.redirect(`${origin}${destination}`);
    } catch (err) {
      console.error("[auth/callback] unexpected verifyOtp error:", err);
      return NextResponse.redirect(`${origin}/auth/sign-in`);
    }
  }

  if (!code) {
    // No code and no error — probably a stale bookmark. Send to sign-in.
    return NextResponse.redirect(`${origin}/auth/sign-in`);
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("[auth/callback] exchangeCodeForSession error:", error.message);
      return NextResponse.redirect(
        `${origin}/auth/sign-in?error=${encodeURIComponent(
          "That link has expired or already been used. Please sign in again."
        )}`
      );
    }

    return NextResponse.redirect(`${origin}${destination}`);
  } catch (err) {
    console.error("[auth/callback] unexpected error:", err);
    return NextResponse.redirect(`${origin}/auth/sign-in`);
  }
}
