"use server";

import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/get-user";
import type { Json } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Revoke: status -> revoked. The database trigger keepers_revoke_cleanup removes
// that keeper's wrapped DEK from vaults in the same transaction, and RLS stops
// matching them (status must be `accepted`), so access ends immediately.
// ---------------------------------------------------------------------------

export async function revokeKeeperAction(keeperId: string): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: "You must be signed in." };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("keepers")
      .update({ status: "revoked" })
      .eq("id", keeperId)
      .eq("owner_id", user.id)
      .in("status", ["invited", "accepted"])
      .select("id");
    if (error) {
      console.error("[keepers/revoke] Supabase error:", error.message);
      return { error: "We couldn't remove that keeper. Please try again." };
    }
    if (!data || data.length === 0) return { error: "That keeper was already removed." };
    return {};
  } catch (err) {
    console.error("[keepers/revoke] unexpected error:", err);
    return { error: "We couldn't remove that keeper. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Wrapping the vault DEK for accepted keepers (owner's browser does the crypto)
// ---------------------------------------------------------------------------

export interface KeeperWrapState {
  vaultId: string;
  /** Current vaults.wrapped_dek_for_keepers array. */
  entries: Json[];
  /** Accepted keepers that have uploaded a public key. */
  targets: { id: string; publicKeyB64: string }[];
}

export async function getKeeperWrapStateAction(): Promise<KeeperWrapState | null> {
  const user = await getUser();
  if (!user) return null;
  try {
    const supabase = await createClient();
    const [{ data: vault }, { data: keepers }] = await Promise.all([
      supabase
        .from("vaults")
        .select("id, wrapped_dek_for_keepers")
        .eq("owner_id", user.id)
        .maybeSingle(),
      supabase
        .from("keepers")
        .select("id, public_key")
        .eq("owner_id", user.id)
        .eq("status", "accepted"),
    ]);
    if (!vault) return null;
    return {
      vaultId: vault.id,
      entries: Array.isArray(vault.wrapped_dek_for_keepers) ? vault.wrapped_dek_for_keepers : [],
      targets: (keepers ?? [])
        .filter((k): k is { id: string; public_key: string } => k.public_key !== null)
        .map((k) => ({ id: k.id, publicKeyB64: k.public_key })),
    };
  } catch (err) {
    console.error("[keepers/wrap-state] unexpected error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Keeper-side: one decision page's data is loaded in server components.
// Mark an in-app notice as read.
// ---------------------------------------------------------------------------

export async function markNoticeReadAction(id: string): Promise<void> {
  const user = await getUser();
  if (!user) return;
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", user.id);
}
