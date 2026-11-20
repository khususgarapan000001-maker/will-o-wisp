import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { hashInviteToken, looksLikeInviteToken } from "@/lib/keepers/token";
import { validateKeeperPassword } from "@/lib/keepers/validation";

export const runtime = "nodejs";

/**
 * POST /api/keepers/accept — two steps, because the key pair must be created in
 * the keeper's browser and uploaded only after they have a session:
 *
 *   { action: "auth", token, password, mode: "sign_up" | "sign_in" }
 *     Resolves the invite (email comes from the invite, never from the client),
 *     creates the keeper's Supabase Auth account (or signs an existing one in).
 *     Returns { keeperId, signedIn, needsConfirmation }.
 *
 *   { action: "finalize", token, publicKeyB64 }
 *     Requires the keeper's session. Calls accept_keeper_invite(), which checks
 *     the account email matches the invite, stores the public key, marks the
 *     keeper `accepted`, burns the token and notifies the owner.
 *
 * The private key never leaves the keeper's browser (IndexedDB, non-extractable).
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await request.json();
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "That request didn't look right." }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (!looksLikeInviteToken(token)) {
    return NextResponse.json({ error: "That invitation link isn't valid." }, { status: 404 });
  }
  const tokenHash = hashInviteToken(token);
  const supabase = await createClient();

  const { data: invites, error: lookupError } = await supabase.rpc("get_keeper_invite", {
    p_token_hash: tokenHash,
  });
  if (lookupError) {
    console.error("[keepers/accept] lookup failed:", lookupError.message);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  const invite = invites?.[0];
  if (!invite || invite.expired) {
    return NextResponse.json(
      { error: "This invitation has expired. Ask them to send you a new one." },
      { status: 410 }
    );
  }

  if (body.action === "auth") {
    const passwordError = validateKeeperPassword(body.password);
    if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });
    const password = body.password as string;

    if (body.mode === "sign_in") {
      const { error } = await supabase.auth.signInWithPassword({
        email: invite.keeper_email,
        password,
      });
      if (error) {
        console.error("[keepers/accept] sign-in failed:", error.message);
        return NextResponse.json(
          { error: "That password didn't match the account for this email." },
          { status: 401 }
        );
      }
      return NextResponse.json({ keeperId: invite.keeper_id, signedIn: true, needsConfirmation: false });
    }

    const { data, error } = await supabase.auth.signUp({ email: invite.keeper_email, password });
    if (error) {
      console.error("[keepers/accept] sign-up failed:", error.message);
      return NextResponse.json(
        { error: "We couldn't create that account. If you already have one, sign in instead." },
        { status: 400 }
      );
    }
    // Supabase hides "already registered" by returning a user with no identities.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return NextResponse.json(
        { error: "There's already an account for this email. Please sign in instead.", reason: "exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({
      keeperId: invite.keeper_id,
      signedIn: data.session !== null,
      needsConfirmation: data.session === null,
    });
  }

  if (body.action === "finalize") {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    const publicKeyB64 = typeof body.publicKeyB64 === "string" ? body.publicKeyB64 : "";
    if (publicKeyB64.length < 80 || publicKeyB64.length > 400) {
      return NextResponse.json({ error: "That key doesn't look right." }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("accept_keeper_invite", {
      p_token_hash: tokenHash,
      p_public_key: publicKeyB64,
    });
    if (error) {
      console.error("[keepers/accept] finalize failed:", error.message);
      const mismatch = error.message.includes("invite_email_mismatch");
      return NextResponse.json(
        {
          error: mismatch
            ? "This invitation was sent to a different email address. Please sign in with that address."
            : "We couldn't finish accepting. Please try again.",
        },
        { status: mismatch ? 403 : 500 }
      );
    }
    return NextResponse.json({ ok: true, keeperId: data });
  }

  return NextResponse.json({ error: "That request didn't look right." }, { status: 400 });
}
