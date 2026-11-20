import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { KeeperReleasedShell } from "@/components/keepers/KeeperReleasedShell";
import { KeeperVaultView } from "@/components/keepers/KeeperVaultView";
import { lockedMessage, resolveReleasedAccess } from "@/lib/keepers/released-access";
import type { WrappedDekForKeeper } from "@/lib/crypto/keeper-keys";

/** Vault items addressed to this keeper (or to all keepers), after release only. */
export default async function KeeperVaultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  if (!user) redirect(`/auth/sign-in?redirectTo=${encodeURIComponent(`/keeper/release/${id}/vault`)}`);

  const supabase = await createClient();
  const access = await resolveReleasedAccess(supabase, id);
  if (!access.ok) {
    return (
      <KeeperReleasedShell releaseId={id} title="Vault">
        <p role="status" className="text-foreground">{lockedMessage(access.reason)}</p>
      </KeeperReleasedShell>
    );
  }

  // RLS (20261121090300) returns these rows only after release, and only the
  // items addressed to this keeper or to all keepers.
  const { data: vault } = await supabase
    .from("vaults")
    .select("id, wrapped_dek_for_keepers")
    .eq("owner_id", access.ownerId)
    .maybeSingle();

  const entries = Array.isArray(vault?.wrapped_dek_for_keepers) ? vault.wrapped_dek_for_keepers : [];
  const mine = entries.find(
    (e): e is Record<string, string> =>
      typeof e === "object" && e !== null && !Array.isArray(e) && e.keeper_id === access.keeperId
  );
  const entry: WrappedDekForKeeper | null = mine
    ? {
        keeper_id: mine.keeper_id,
        wrapped_dek: mine.wrapped_dek,
        ephemeral_public_key: mine.ephemeral_public_key,
        kdf_salt: mine.kdf_salt,
      }
    : null;

  const { data: items } = vault
    ? await supabase
        .from("vault_items")
        .select("id, kind, payload_ciphertext, iv")
        .eq("vault_id", vault.id)
        .order("sort_order", { ascending: true })
    : { data: [] };

  return (
    <KeeperReleasedShell releaseId={id} title="Vault">
      <h1 className="font-serif text-3xl text-foreground">What {access.ownerName} left you</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Opened on this device. Nothing here was readable by anyone else.
      </p>
      <KeeperVaultView
        ownerId={access.ownerId}
        ownerName={access.ownerName}
        keeperId={access.keeperId}
        entry={entry}
        items={items ?? []}
      />
    </KeeperReleasedShell>
  );
}
