/**
 * Supabase-bound keeper queries for server components. Everything goes through
 * the signed-in user's client + RLS.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, KeeperStatus } from "@/lib/supabase/types";

type Db = SupabaseClient<Database>;

export interface OwnerKeeperRow {
  id: string;
  name: string;
  email: string;
  relationship: string | null;
  status: KeeperStatus;
  inviteExpiresAt: string | null;
  inviteEmailFailed: boolean;
  hasPublicKey: boolean;
}

export interface OpenReleaseSummary {
  id: string;
  state: Database["public"]["Tables"]["release_processes"]["Row"]["state"];
  required: number;
  received: number;
}

export interface OwnerKeeperSummary {
  keepers: OwnerKeeperRow[];
  acceptedCount: number;
  release: OpenReleaseSummary | null;
}

export async function loadOwnerKeeperSummary(
  supabase: Db,
  ownerId: string
): Promise<OwnerKeeperSummary> {
  const [{ data: rows }, { data: release }] = await Promise.all([
    supabase
      .from("keepers")
      .select(
        "id, name, email, relationship, status, invite_expires_at, invite_email_failed, public_key"
      )
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true }),
    supabase
      .from("release_processes")
      .select("id, state, required_confirmations")
      .eq("owner_id", ownerId)
      .order("triggered_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const keepers: OwnerKeeperRow[] = (rows ?? []).map((k) => ({
    id: k.id,
    name: k.name,
    email: k.email,
    relationship: k.relationship,
    status: k.status as KeeperStatus,
    inviteExpiresAt: k.invite_expires_at,
    inviteEmailFailed: k.invite_email_failed,
    hasPublicKey: k.public_key !== null,
  }));

  let summary: OpenReleaseSummary | null = null;
  if (release) {
    const { data: decisions } = await supabase
      .from("keeper_confirmations")
      .select("keeper_id")
      .eq("release_id", release.id)
      .eq("decision", "confirm");
    const acceptedIds = new Set(keepers.filter((k) => k.status === "accepted").map((k) => k.id));
    const received = new Set(
      (decisions ?? []).map((d) => d.keeper_id).filter((id) => acceptedIds.has(id))
    ).size;
    summary = {
      id: release.id,
      state: release.state,
      required: release.required_confirmations,
      received,
    };
  }

  return {
    keepers,
    acceptedCount: keepers.filter((k) => k.status === "accepted").length,
    release: summary,
  };
}
