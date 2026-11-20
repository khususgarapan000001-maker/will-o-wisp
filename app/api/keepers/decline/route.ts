import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hashInviteToken, looksLikeInviteToken } from "@/lib/keepers/token";

export const runtime = "nodejs";

/** POST /api/keepers/decline { token } — possession of the invite link is enough. */
export async function POST(request: NextRequest) {
  let token = "";
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && typeof (body as { token?: unknown }).token === "string") {
      token = (body as { token: string }).token;
    }
  } catch {
    // fall through
  }
  if (!looksLikeInviteToken(token)) {
    return NextResponse.json({ error: "That invitation link isn't valid." }, { status: 404 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decline_keeper_invite", {
    p_token_hash: hashInviteToken(token),
  });
  if (error) {
    console.error("[keepers/decline] rpc failed:", error.message);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "That invitation link has expired." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
