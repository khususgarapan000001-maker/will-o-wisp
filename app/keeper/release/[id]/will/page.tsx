import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { KeeperReleasedShell } from "@/components/keepers/KeeperReleasedShell";
import { KeeperWillView } from "@/components/keepers/KeeperWillView";
import { lockedMessage, resolveReleasedAccess } from "@/lib/keepers/released-access";
import type { WrappedDekForKeeper } from "@/lib/crypto/keeper-keys";
import type { WillItemData } from "@/lib/will/model";

/**
 * Digital will checklist for a keeper (post-release, read-only).
 *
 * RLS returns will_items only to an accepted keeper of an owner whose release
 * is `released`; resolveReleasedAccess gives the page the same guard so it can
 * explain itself. EVERY accepted keeper sees the whole list (unlike letters,
 * which have one recipient); transfer items assigned to the viewer are
 * highlighted in the view. Notes are decrypted in the keeper's browser.
 */
export default async function KeeperWillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  if (!user) redirect(`/auth/sign-in?redirectTo=${encodeURIComponent(`/keeper/release/${id}/will`)}`);

  const supabase = await createClient();
  const access = await resolveReleasedAccess(supabase, id);
  if (!access.ok) {
    return (
      <KeeperReleasedShell releaseId={id} title="Will">
        <p role="status" className="text-foreground">{lockedMessage(access.reason)}</p>
      </KeeperReleasedShell>
    );
  }

  const [{ data: vault }, { data: items }, { data: transferKeepers }] = await Promise.all([
    supabase.from("vaults").select("wrapped_dek_for_keepers").eq("owner_id", access.ownerId).maybeSingle(),
    supabase
      .from("will_items")
      .select("id, service_name, category, wish, transfer_to_keeper_id, notes_ciphertext, iv, sort_order")
      .eq("owner_id", access.ownerId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.rpc("will_transfer_keepers", { p_release_id: id }),
  ]);

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

  return (
    <KeeperReleasedShell releaseId={id} title="Will">
      <h1 className="font-serif text-3xl text-foreground">{access.ownerName}&apos;s digital will</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        What {access.ownerName} would like to happen to their online accounts. It is a record of their
        wishes, not a legal will. Private notes are opened on this device only.
      </p>
      <KeeperWillView
        ownerId={access.ownerId}
        ownerName={access.ownerName}
        keeperId={access.keeperId}
        entry={entry}
        items={(items ?? []) as WillItemData[]}
        transferKeepers={transferKeepers ?? []}
      />
    </KeeperReleasedShell>
  );
}
