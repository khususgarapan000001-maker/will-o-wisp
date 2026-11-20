"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Maps Supabase auth error messages to plain-language user-facing strings.
 * Technical details are never exposed to the browser.
 */
function mapAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials") || lower.includes("invalid credentials")) {
    return "That email or password didn't match. Please try again.";
  }
  if (lower.includes("email not confirmed")) {
    return "Please check your inbox and confirm your email address before signing in.";
  }
  if (lower.includes("user already registered")) {
    return "An account with that email already exists. Try signing in instead.";
  }
  if (lower.includes("password should be at least")) {
    return "Password must be at least 8 characters.";
  }
  if (lower.includes("rate limit")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (lower.includes("otp")) {
    return "That magic link has expired or already been used. Request a new one.";
  }
  // Generic fallback — never expose the raw Supabase error.
  return "Something went wrong. Please try again in a moment.";
}

// ---------------------------------------------------------------------------
// Sign up
// ---------------------------------------------------------------------------

export interface SignUpResult {
  error?: string;
  /** True when Supabase requires email confirmation before sign-in. */
  needsConfirmation?: boolean;
}

export async function signUpAction(
  email: string,
  password: string
): Promise<SignUpResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      console.error("[auth/sign-up] Supabase error:", error.message);
      return { error: mapAuthError(error.message) };
    }

    // Supabase returns a session immediately when email confirmation is off;
    // it returns identities: [] with no session when confirmation is required.
    if (data.session) {
      redirect("/app/onboarding");
    }

    // Email confirmation enabled — tell the UI.
    return { needsConfirmation: true };
  } catch (err) {
    // redirect() throws a Next.js internal error that must be re-thrown.
    if (
      err !== null &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    console.error("[auth/sign-up] unexpected error:", err);
    return { error: "Something went wrong. Please try again in a moment." };
  }
}

// ---------------------------------------------------------------------------
// Sign in (email + password)
// ---------------------------------------------------------------------------

export interface SignInResult {
  error?: string;
}

export async function signInAction(
  email: string,
  password: string,
  redirectTo?: string
): Promise<SignInResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("[auth/sign-in] Supabase error:", error.message);
      return { error: mapAuthError(error.message) };
    }

    // Decide where to send the user. Only allow relative paths to prevent
    // open-redirect attacks (redirectTo comes from the sign-in URL).
    const destination =
      redirectTo !== undefined && redirectTo.startsWith("/")
        ? redirectTo
        : "/app?welcome=1";
    redirect(destination);
  } catch (err) {
    if (
      err !== null &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    console.error("[auth/sign-in] unexpected error:", err);
    return { error: "Something went wrong. Please try again in a moment." };
  }
}

// ---------------------------------------------------------------------------
// Magic link request
// ---------------------------------------------------------------------------

export interface MagicLinkResult {
  error?: string;
  sent?: boolean;
}

export async function requestMagicLinkAction(
  email: string
): Promise<MagicLinkResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // The OTP link will redirect through /auth/callback.
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/callback`,
      },
    });

    if (error) {
      console.error("[auth/magic-link] Supabase error:", error.message);
      return { error: mapAuthError(error.message) };
    }

    return { sent: true };
  } catch (err) {
    console.error("[auth/magic-link] unexpected error:", err);
    return { error: "Something went wrong. Please try again in a moment." };
  }
}

// ---------------------------------------------------------------------------
// Sign out
// ---------------------------------------------------------------------------

export async function signOutAction(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch (err) {
    console.error("[auth/sign-out] unexpected error:", err);
    // Sign-out failures are non-fatal; redirect to home regardless.
  }
  redirect("/");
}
