import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { isUuid, parseWillWrite } from "@/lib/will/validation";
import { SEALED_WILL_MESSAGE, willWriteError } from "@/lib/will/api-errors";

export const runtime = "nodejs";

/**
 * PUT /api/will/:id
 *   { serviceName, category, wish | null, transferToKeeperId | null,
 *     notes: { ciphertext, iv } | null | "keep" }
 * When the note changes, the browser re-encrypted the WHOLE note with a fresh
 * IV. `"keep"` leaves the stored note alone (used while the vault is locked,
 * when only the plaintext fields can be edited).
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "We couldn't find that account." }, { status: 404 });

  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "That request didn't look right." }, { status: 400 });
  }
  const parsed = parseWillWrite(json, { idFromPath: id, allowKeep: true });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supabase = await createClient();
  const v = parsed.value;
  const patch = {
    service_name: v.serviceName,
    category: v.category,
    wish: v.wish,
    transfer_to_keeper_id: v.transferToKeeperId,
    ...(v.notes === "keep"
      ? {}
      : { notes_ciphertext: v.notes?.ciphertext ?? null, iv: v.notes?.iv ?? null }),
  };
  const { data, error } = await supabase
    .from("will_items")
    .update(patch)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id");
  if (error) {
    console.error("[will/update] Supabase error:", error.message);
    const mapped = willWriteError(error.message);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "We couldn't find that account." }, { status: 404 });
  }
  return NextResponse.json({ id });
}

/** DELETE /api/will/:id → hard delete (blocked by the database once the release has happened). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "We couldn't find that account." }, { status: 404 });

  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("will_items")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id");
  if (error) {
    console.error("[will/delete] Supabase error:", error.message);
    if (error.message.includes("release has already happened")) {
      return NextResponse.json({ error: SEALED_WILL_MESSAGE }, { status: 409 });
    }
    return NextResponse.json({ error: "We couldn't delete that just now. Please try again." }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "We couldn't find that account." }, { status: 404 });
  }
  return NextResponse.json({ id });
}
