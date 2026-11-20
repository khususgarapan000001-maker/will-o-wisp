import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { parseReorder } from "@/lib/will/validation";
import { willWriteError } from "@/lib/will/api-errors";

export const runtime = "nodejs";

/**
 * POST /api/will/reorder  { ids: [...] }
 * Gives each listed item sort_order = its position. RLS scopes every update to
 * the caller's own items, so an id that is not theirs is simply not updated.
 */
export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "That request didn't look right." }, { status: 400 });
  }
  const parsed = parseReorder(json);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supabase = await createClient();
  for (const [index, id] of parsed.ids.entries()) {
    const { error } = await supabase
      .from("will_items")
      .update({ sort_order: index })
      .eq("id", id)
      .eq("owner_id", user.id);
    if (error) {
      console.error("[will/reorder] Supabase error:", error.message);
      const mapped = willWriteError(error.message);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }
  }
  return NextResponse.json({ ok: true });
}
