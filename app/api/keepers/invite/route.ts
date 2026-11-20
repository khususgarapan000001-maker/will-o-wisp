import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { createInvite, resendInvite } from "@/lib/keepers/invite-service";
import { validateInvite } from "@/lib/keepers/validation";

export const runtime = "nodejs";

/**
 * POST /api/keepers/invite
 *   { name, email, relationship? }  → create an invite and email the link
 *   { resend: "<keeperId>" }        → fresh token + email for a pending invite
 * The raw token appears only in the emailed link; the database keeps its hash.
 */
export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await request.json();
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "That request didn't look right." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const owner = { id: user.id, displayName: profile?.display_name || "Someone you know" };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;

  if (typeof body.resend === "string") {
    const result = await resendInvite(supabase, owner, body.resend, appUrl);
    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : result.reason === "not_pending" ? 409 : 500;
      return NextResponse.json(
        { error: "We couldn't send that invitation again.", reason: result.reason },
        { status }
      );
    }
    return NextResponse.json(result);
  }

  const parsed = validateInvite(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if ((user.email ?? "").toLowerCase() === parsed.value.email) {
    return NextResponse.json(
      { error: "Keepers need to be other people. Who else could you ask?" },
      { status: 400 }
    );
  }

  const result = await createInvite(supabase, owner, parsed.value, appUrl);
  if (!result.ok) {
    if (result.reason === "duplicate") {
      return NextResponse.json(
        { error: "You've already invited that person." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "We couldn't send that invitation. Please try again." },
      { status: 500 }
    );
  }
  return NextResponse.json(result, { status: 201 });
}
