import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { getVaultMetaAction } from "@/lib/vault/actions";
import { WillClient } from "@/components/will/WillClient";
import type { WillItemData } from "@/lib/will/model";

/**
 * Owner's digital will. Service names, categories and wishes are plaintext, so
 * the server loads them (RLS-scoped) and the page works without unlocking the
 * vault. Encrypted notes are opened in the browser after an optional unlock.
 */
export default async function WillPage() {
  const user = await getUser();
  if (!user) redirect("/auth/sign-in");

  const supabase = await createClient();
  const [vaultMeta, { data: keepers }, { data: items }] = await Promise.all([
    getVaultMetaAction(),
    supabase.from("keepers").select("id, name, status").eq("owner_id", user.id),
    supabase
      .from("will_items")
      .select("id, service_name, category, wish, transfer_to_keeper_id, notes_ciphertext, iv, sort_order")
      .eq("owner_id", user.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  const rows = keepers ?? [];
  return (
    <WillClient
      ownerId={user.id}
      initialItems={(items ?? []) as WillItemData[]}
      vault={vaultMeta ? { saltB64: vaultMeta.saltB64, wrappedDekB64: vaultMeta.wrappedDekB64 } : null}
      keeperNames={Object.fromEntries(rows.map((k) => [k.id, k.name]))}
      acceptedKeepers={rows.filter((k) => k.status === "accepted").map((k) => ({ id: k.id, name: k.name }))}
    />
  );
}
