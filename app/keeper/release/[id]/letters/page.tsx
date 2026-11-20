import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { KeeperReleasedShell } from "@/components/keepers/KeeperReleasedShell";
import { KeeperLettersView } from "@/components/keepers/KeeperLettersView";
import { lockedMessage, resolveReleasedAccess } from "@/lib/keepers/released-access";
import type { WrappedDekForKeeper } from "@/lib/crypto/keeper-keys";

/**
 * Last letters for a keeper (post-release).
 *
 * One recipient per letter (Spec 5 requirement 1): this keeper sees only the
 * letters addressed to THEM. (Spec 4's placeholder said "or to all keepers";
 * that guess is corrected here.) RLS returns a letter only when it was
 * delivered, the keeper is still accepted and the release is `released`;
 * resolveReleasedAccess gives the page the same guard so it can explain itself.
 */
export default async function KeeperLettersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  if (!user) redirect(`/auth/sign-in?redirectTo=${encodeURIComponent(`/keeper/release/${id}/letters`)}`);

  const supabase = await createClient();
  const access = await resolveReleasedAccess(supabase, id);
  if (!access.ok) {
    return (
      <KeeperReleasedShell releaseId={id} title="Letters">
        <p role="status" className="text-foreground">{lockedMessage(access.reason)}</p>
      </KeeperReleasedShell>
    );
  }

  const { data: vault } = await supabase
    .from("vaults")
    .select("wrapped_dek_for_keepers")
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

  const { data: letters } = await supabase
    .from("letters")
    .select("id, payload_ciphertext, iv, ai_assisted, created_at")
    .eq("owner_id", access.ownerId)
    .eq("recipient_keeper_id", access.keeperId)
    .not("delivered_at", "is", null)
    .order("created_at", { ascending: true });

  return (
    <KeeperReleasedShell releaseId={id} title="Letters">
      <h1 className="font-serif text-3xl text-foreground">Letters from {access.ownerName}</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Opened on this device. Nothing here was readable by anyone else.
      </p>
      <KeeperLettersView
        ownerId={access.ownerId}
        ownerName={access.ownerName}
        keeperId={access.keeperId}
        entry={entry}
        letters={letters ?? []}
      />
    </KeeperReleasedShell>
  );
}
