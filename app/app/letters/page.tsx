import { redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { getVaultMetaAction } from "@/lib/vault/actions";
import { LettersClient } from "@/components/letters/LettersClient";
import { VaultSetup } from "@/components/vault/VaultSetup";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Owner's last letters. The server shell loads only what the unlock form and
 * recipient picker need (salt, wrapped DEK, keeper names). Letters themselves
 * are fetched and decrypted in the browser after the vault is unlocked.
 */
export default async function LettersPage() {
  const user = await getUser();
  if (!user) redirect("/auth/sign-in");

  const supabase = await createClient();
  const [vaultMeta, { data: keepers }, { data: profile }] = await Promise.all([
    getVaultMetaAction(),
    supabase.from("keepers").select("id, name, status").eq("owner_id", user.id),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);

  if (!vaultMeta) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border px-6 py-4">
          <Link href="/app" className="text-sm tracking-[0.3em] text-primary/80 uppercase">
            WILL-O&apos;-WISP
          </Link>
        </header>
        <main className="flex min-h-[80vh] items-center justify-center px-4 py-10">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="font-serif text-xl">Set up your vault first</CardTitle>
              <CardDescription>
                Letters are encrypted with your vault passphrase. Set one to start writing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <VaultSetup />
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const rows = keepers ?? [];
  return (
    <LettersClient
      ownerId={user.id}
      ownerName={profile?.display_name || "Me"}
      saltB64={vaultMeta.saltB64}
      wrappedDekB64={vaultMeta.wrappedDekB64}
      keeperNames={Object.fromEntries(rows.map((k) => [k.id, k.name]))}
      acceptedKeepers={rows.filter((k) => k.status === "accepted").map((k) => ({ id: k.id, name: k.name }))}
    />
  );
}
