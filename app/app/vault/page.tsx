import { redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/auth/get-user";
import { getVaultMetaAction } from "@/lib/vault/actions";
import { VaultClient } from "./VaultClient";
import { VaultSetup } from "@/components/vault/VaultSetup";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

/**
 * Vault page — server component shell.
 *
 * Loads only the vault metadata needed to display the unlock form
 * (salt + wrapped_dek). No vault items or plaintext reach the server
 * component — all decryption happens in VaultClient.
 *
 * If no vault exists (passphrase not yet set), shows a prompt to set it.
 */
export default async function VaultPage() {
  const user = await getUser();
  if (!user) redirect("/auth/sign-in");

  const vaultMeta = await getVaultMetaAction();

  if (!vaultMeta) {
    return <NoVaultPage />;
  }

  return (
    <VaultClient
      ownerId={user.id}
      vaultId={vaultMeta.id}
      saltB64={vaultMeta.saltB64}
      wrappedDekB64={vaultMeta.wrappedDekB64}
    />
  );
}

function NoVaultPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link href="/app" className="text-sm tracking-[0.3em] text-primary/80 uppercase">
          WILL-O&apos;-WISP
        </Link>
      </header>
      <main className="flex min-h-[80vh] items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="font-serif text-xl">Set up your vault</CardTitle>
            <CardDescription>
              You haven&apos;t created a vault passphrase yet. Set one to start
              storing encrypted items.
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
