import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { checkLetterCap, parseLetterWrite } from "@/lib/letters/validation";
import { letterWriteError } from "@/lib/letters/api-errors";

export const runtime = "nodejs";

const LIST_COLUMNS =
  "id, recipient_keeper_id, payload_ciphertext, iv, ai_assisted, status, delivered_at, created_at, updated_at";

/** GET /api/letters → the signed-in owner's letters (ciphertext only; RLS-scoped). */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("letters")
    .select(LIST_COLUMNS)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[letters/list] Supabase error:", error.message);
    return NextResponse.json({ error: "We couldn't load your letters just now." }, { status: 500 });
  }
  return NextResponse.json({ letters: data ?? [] });
}

/**
 * POST /api/letters
 *   { id, recipientKeeperId, payloadCiphertext, iv, status }
 * The browser has already encrypted the {subject, body} payload; the id is
 * client-generated because it is bound into the ciphertext's AAD.
 *
 * Limits: the 50-letter cap is enforced HERE (and in the editor); the database
 * deliberately does not count. The 10,000-character body limit cannot be
 * checked on ciphertext, so the route bounds the ciphertext size instead.
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
  const parsed = parseLetterWrite(json);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from("letters")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id);
  if (countError) {
    console.error("[letters/create] count failed:", countError.message);
    return NextResponse.json({ error: "We couldn't save that just now. Please try again." }, { status: 500 });
  }
  const cap = checkLetterCap(count ?? 0);
  if (!cap.ok) return NextResponse.json({ error: cap.error }, { status: 409 });

  const { data: vault } = await supabase
    .from("vaults")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!vault) {
    return NextResponse.json({ error: "Please set up your vault before writing a letter." }, { status: 409 });
  }

  const v = parsed.value;
  const { error } = await supabase.from("letters").insert({
    id: v.id,
    owner_id: user.id,
    vault_id: vault.id,
    recipient_keeper_id: v.recipientKeeperId,
    payload_ciphertext: v.payloadCiphertext,
    iv: v.iv,
    status: v.status,
    ai_assisted: v.aiAssisted,
  });
  if (error) {
    console.error("[letters/create] Supabase error:", error.message);
    const mapped = letterWriteError(error.message);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
  return NextResponse.json({ id: v.id }, { status: 201 });
}
