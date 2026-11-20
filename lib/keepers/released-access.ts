/**
 * Shared guard for the post-release keeper pages: the caller must be an
 * accepted keeper AND the release must be `released`. RLS enforces the same
 * rule on the data itself; this just lets the pages explain themselves.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Db = SupabaseClient<Database>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReleasedAccess =
  | { ok: true; ownerId: string; ownerName: string; keeperId: string }
  | { ok: false; reason: "not_found" | "not_released" };

export async function resolveReleasedAccess(supabase: Db, releaseId: string): Promise<ReleasedAccess> {
  if (!UUID_RE.test(releaseId)) return { ok: false, reason: "not_found" };
  const { data: ctx } = await supabase.rpc("get_release_context", { p_release_id: releaseId });
  const context = ctx?.[0];
  if (!context) return { ok: false, reason: "not_found" };
  if (context.release_state !== "released") return { ok: false, reason: "not_released" };

  const { data: release } = await supabase
    .from("release_processes")
    .select("owner_id")
    .eq("id", releaseId)
    .maybeSingle();
  if (!release) return { ok: false, reason: "not_found" };
  return {
    ok: true,
    ownerId: release.owner_id,
    ownerName: context.owner_name,
    keeperId: context.keeper_id,
  };
}

export function lockedMessage(reason: "not_found" | "not_released"): string {
  return reason === "not_released"
    ? "This opens only after the release is confirmed. Nothing is shared before then."
    : "We couldn't find that page. It may belong to a different account.";
}
