import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { decideRelease } from "@/lib/keepers/decision-service";
import { normalizeNote } from "@/lib/keepers/validation";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/releases/:id/decide  { decision: "confirm" | "false_alarm", note? }
 *
 * Thin wrapper over record_keeper_decision() (transactional, row-locked). When
 * the decision completes a release, or cancels one, every party gets a calm
 * email (and the SQL function writes their in-app notices).
 *
 * Spec 5 hook: when the outcome is "released", last-letter delivery to the
 * keepers is triggered from here (after the commit) — letters do not exist yet.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "We couldn't find that release." }, { status: 404 });
  }

  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  let decision: unknown;
  let note: unknown;
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object") {
      decision = (body as { decision?: unknown }).decision;
      note = (body as { note?: unknown }).note;
    }
  } catch {
    // fall through to validation
  }
  if (decision !== "confirm" && decision !== "false_alarm") {
    return NextResponse.json({ error: "That request didn't look right." }, { status: 400 });
  }

  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const result = await decideRelease(
    supabase,
    id,
    decision,
    decision === "false_alarm" ? normalizeNote(note) : null,
    appUrl
  );

  if (!result.ok) {
    if (result.reason === "not_a_keeper") {
      return NextResponse.json({ error: "We couldn't find that release." }, { status: 404 });
    }
    return NextResponse.json(
      { error: "We couldn't record that just now. Please try again." },
      { status: result.reason === "invalid" ? 400 : 500 }
    );
  }
  const status = result.outcome === "already_decided" || result.outcome === "not_open" ? 409 : 200;
  return NextResponse.json(result, { status });
}
