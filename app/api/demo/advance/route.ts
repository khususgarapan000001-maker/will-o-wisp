import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { advanceDemoClock } from "@/lib/heartbeat/service";

export const runtime = "nodejs";

/**
 * POST /api/demo/advance  { days: number }
 *
 * Advances the demo clock (profiles.demo_time_offset) and runs the heartbeat
 * tick for the demo account straight away. Refuses (403) unless DEMO_MODE=true
 * AND the caller is the demo account — with DEMO_MODE off no offset can be set.
 */
export async function POST(request: NextRequest) {
  // Cheap early refusal before touching auth or the database.
  if (process.env.DEMO_MODE !== "true") {
    return NextResponse.json({ error: "Demo mode is not enabled." }, { status: 403 });
  }

  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }

  let days = NaN;
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && "days" in body) {
      days = Number((body as { days: unknown }).days);
    }
  } catch {
    // fall through to validation
  }

  const supabase = await createClient();
  const result = await advanceDemoClock(
    supabase,
    { id: user.id, email: user.email },
    days
  );

  if (!result.ok) {
    const status =
      result.reason === "demo_disabled" || result.reason === "not_demo_account"
        ? 403
        : result.reason === "invalid_days"
          ? 400
          : result.reason === "db_error"
            ? 500
            : 409;
    return NextResponse.json({ error: "The demo clock couldn't be moved." , reason: result.reason }, { status });
  }

  return NextResponse.json({
    offsetDays: result.offsetDays,
    before: result.before,
    after: result.after,
  });
}
