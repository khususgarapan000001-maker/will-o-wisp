import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { isUuid, parseLetterWrite } from "@/lib/letters/validation";
import { DELIVERED_LETTER_MESSAGE, letterWriteError } from "@/lib/letters/api-errors";

export const runtime = "nodejs";

/**
 * PUT /api/letters/:id  { recipientKeeperId, payloadCiphertext, iv, status }
 * The browser re-encrypted the WHOLE payload with a fresh IV. Delivered
 * letters cannot be edited (they have already been read); the database guard
 * enforces the same rule.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "We couldn't find that letter." }, { status: 404 });

  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "That request didn't look right." }, { status: 400 });
  }
  const parsed = parseLetterWrite(json, id);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("letters")
    .select("id, delivered_at")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "We couldn't find that letter." }, { status: 404 });
  if (existing.delivered_at) {
    return NextResponse.json({ error: DELIVERED_LETTER_MESSAGE }, { status: 409 });
  }

  const v = parsed.value;
  const { error } = await supabase
    .from("letters")
    .update({
      recipient_keeper_id: v.recipientKeeperId,
      payload_ciphertext: v.payloadCiphertext,
      iv: v.iv,
      status: v.status,
      // Sticky: an Echo draft was used once, so the flag is only ever raised,
      // never cleared by a later edit.
      ...(v.aiAssisted ? { ai_assisted: true } : {}),
    })
    .eq("id", id)
    .eq("owner_id", user.id);
  if (error) {
    console.error("[letters/update] Supabase error:", error.message);
    const mapped = letterWriteError(error.message);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
  return NextResponse.json({ id });
}

/** DELETE /api/letters/:id → hard delete (undelivered letters only). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "We couldn't find that letter." }, { status: 404 });

  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("letters")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("delivered_at", null)
    .select("id");
  if (error) {
    console.error("[letters/delete] Supabase error:", error.message);
    return NextResponse.json({ error: "We couldn't delete that just now. Please try again." }, { status: 500 });
  }
  if (!data || data.length === 0) {
    // Either not yours, already gone, or already delivered (RLS blocks it).
    return NextResponse.json({ error: DELIVERED_LETTER_MESSAGE }, { status: 409 });
  }
  return NextResponse.json({ id });
}
