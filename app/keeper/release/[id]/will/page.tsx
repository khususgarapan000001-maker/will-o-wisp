import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { KeeperReleasedShell } from "@/components/keepers/KeeperReleasedShell";
import { lockedMessage, resolveReleasedAccess } from "@/lib/keepers/released-access";

/**
 * Digital will checklist view for keepers (post-release).
 *
 * TODO(spec-6): show the digital will checklist (service names + wishes, encrypted notes decrypted in the keeper's browser) once will_items exists (requirement 15). The will_items table is created in Spec 6, not here.
 * Until then this route shows an honest empty state.
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

  return (
    <KeeperReleasedShell releaseId={id} title="Will">
      <h1 className="font-serif text-3xl text-foreground">Digital will checklist</h1>
      <div className="mt-6 rounded-xl border border-dashed border-border py-12 text-center">
        <p className="text-muted-foreground">The digital will will appear here once it is available.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          This part of WILL-O&apos;-WISP isn&apos;t available yet.
        </p>
      </div>
    </KeeperReleasedShell>
  );
}
