import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth/get-user";
import { createEchoProviderFromEnv } from "@/lib/echo/provider";
import { echoRateLimiter } from "@/lib/echo/rate-limit";
import { runEchoDraft } from "@/lib/echo/draft-service";

export const runtime = "nodejs";

/**
 * PRIVACY BOUNDARY (Spec 7, task 2.2): this route deliberately imports no
 * Supabase client and reads no table. It sees only what the browser posts:
 * the owner's notes and the recipient's name. getUser() is used for the auth
 * check and the rate-limit key only.
 */

/** GET → whether Echo is configured (lets the UI show an honest disabled state). */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  return NextResponse.json({ available: createEchoProviderFromEnv(process.env) !== null });
}

/** POST { notes, recipientName } → { draft, truncated } (plain text). */
export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "That request didn't look right." }, { status: 400 });
  }
  const b = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;

  const result = await runEchoDraft({
    ownerId: user.id,
    notes: b.notes,
    recipientName: b.recipientName,
    provider: createEchoProviderFromEnv(process.env),
    limiter: echoRateLimiter,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ draft: result.draft, truncated: result.truncated });
}
