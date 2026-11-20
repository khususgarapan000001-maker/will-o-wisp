import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { recordCheckIn, type CheckInMethod } from "@/lib/heartbeat/service";
import { hashIp } from "@/lib/heartbeat/ip-hash";

export const runtime = "nodejs";

const METHODS: readonly CheckInMethod[] = ["button", "login", "magic_link"];

/**
 * POST /api/checkin  { method?: "button" | "login" | "magic_link" }
 *
 * Records a check-in, pushes `next_checkin_due` to now + cadence, returns the
 * owner to ALIVE from OVERDUE / AWAITING_KEEPERS and cancels any open release
 * as `cancelled_false_alarm`. Runs as the signed-in user under RLS.
 */
export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Please sign in to check in." },
      { status: 401 }
    );
  }

  let method: CheckInMethod = "button";
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && "method" in body) {
      const m = (body as { method: unknown }).method;
      if (typeof m === "string" && (METHODS as readonly string[]).includes(m)) {
        method = m as CheckInMethod;
      }
    }
  } catch {
    // Empty body is fine: defaults to "button".
  }

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0];
  const supabase = await createClient();
  const result = await recordCheckIn(supabase, user.id, method, hashIp(forwarded));

  if (!result.ok) {
    if (result.reason === "released") {
      return NextResponse.json(
        { error: "Your light has already been shared, so there's nothing left to check in for." },
        { status: 409 }
      );
    }
    if (result.reason === "no_settings" || result.reason === "no_profile") {
      return NextResponse.json(
        { error: "Finish setting up your heartbeat first, then check in." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "We couldn't record that just now. Please try again in a moment." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    state: result.state,
    previousState: result.previousState,
    nextCheckinDue: result.nextCheckinDue,
    cancelledRelease: result.cancelledRelease,
  });
}
