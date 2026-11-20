import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { KeeperReleasedShell } from "@/components/keepers/KeeperReleasedShell";
import { lockedMessage, resolveReleasedAccess } from "@/lib/keepers/released-access";

/**
 * Last letters view for keepers (post-release).
 *
 * TODO(spec-5): list the letters addressed to this keeper (or to all keepers) here once the letters table exists, with the "AI-assisted draft" badge when ai_assisted is true (requirement 14). The letters table is created in Spec 5, not here.
 * Until then this route shows an honest empty state.
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

  return (
    <KeeperReleasedShell releaseId={id} title="Letters">
      <h1 className="font-serif text-3xl text-foreground">Last letters</h1>
      <div className="mt-6 rounded-xl border border-dashed border-border py-12 text-center">
        <p className="text-muted-foreground">Letters will appear here once they are available.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          This part of WILL-O&apos;-WISP isn&apos;t available yet.
        </p>
      </div>
    </KeeperReleasedShell>
  );
}
