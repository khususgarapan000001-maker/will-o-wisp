import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { checkWillCap, parseWillWrite } from "@/lib/will/validation";
import { willWriteError } from "@/lib/will/api-errors";

export const runtime = "nodejs";

const LIST_COLUMNS =
  "id, service_name, category, wish, transfer_to_keeper_id, notes_ciphertext, iv, sort_order, created_at";

/** GET /api/will → the signed-in owner's will items (notes as ciphertext only; RLS-scoped). */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("will_items")
    .select(LIST_COLUMNS)
    .eq("owner_id", user.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[will/list] Supabase error:", error.message);
    return NextResponse.json({ error: "We couldn't load your list just now." }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] });
}

/**
 * POST /api/will
 *   { id, serviceName, category, wish | null, transferToKeeperId | null,
 *     notes: { ciphertext, iv } | null }
 * The browser has already encrypted the note (the id is client-generated
 * because it is bound into the ciphertext's AAD). Service name, category, wish
 * and transfer target are plaintext by design.
 *
 * Limits: the 200-account cap is enforced HERE (and in the editor); the
 * database does not count. The 2,000-character note limit cannot be checked on
 * ciphertext, so the route bounds the ciphertext size instead.
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
  const parsed = parseWillWrite(json, { allowKeep: false });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supabase = await createClient();

  // New items go to the end. The count doubles as the cap check.
  const { count, error: countError } = await supabase
    .from("will_items")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id);
  if (countError) {
    console.error("[will/create] count failed:", countError.message);
    return NextResponse.json({ error: "We couldn't save that just now. Please try again." }, { status: 500 });
  }
  const cap = checkWillCap(count ?? 0);
  if (!cap.ok) return NextResponse.json({ error: cap.error }, { status: 409 });

  const { data: last } = await supabase
    .from("will_items")
    .select("sort_order")
    .eq("owner_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const v = parsed.value;
  const notes = v.notes === "keep" ? null : v.notes;
  const { error } = await supabase.from("will_items").insert({
    id: v.id,
    owner_id: user.id,
    service_name: v.serviceName,
    category: v.category,
    wish: v.wish,
    transfer_to_keeper_id: v.transferToKeeperId,
    notes_ciphertext: notes?.ciphertext ?? null,
    iv: notes?.iv ?? null,
    sort_order: (last?.sort_order ?? -1) + 1,
  });
  if (error) {
    console.error("[will/create] Supabase error:", error.message);
    const mapped = willWriteError(error.message);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
  return NextResponse.json({ id: v.id }, { status: 201 });
}
