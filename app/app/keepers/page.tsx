import { redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { loadOwnerKeeperSummary } from "@/lib/keepers/service";
import { keeperMinimumWarning } from "@/lib/keepers/release-status";
import { InviteForm } from "@/components/keepers/InviteForm";
import { KeeperRowActions } from "@/components/keepers/KeeperRowActions";
import { KeeperKeySync } from "@/components/keepers/KeeperKeySync";
import { ReleaseTimeline } from "@/components/lantern/ReleaseTimeline";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { formatDateLabel } from "@/lib/heartbeat/reminder-builder";

const STATUS_LABEL = {
  invited: "Invitation sent",
  accepted: "Accepted",
  declined: "Declined",
  revoked: "Removed",
} as const;

/** Owner's keeper management: invite, list, resend, remove. */
export default async function KeepersPage() {
  const user = await getUser();
  if (!user) redirect("/auth/sign-in");

  const supabase = await createClient();
  const summary = await loadOwnerKeeperSummary(supabase, user.id);
  const warning = keeperMinimumWarning(summary.acceptedCount);
  const needsKey = summary.keepers.some((k) => k.status === "accepted" && k.hasPublicKey);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/app" className="text-sm tracking-[0.3em] text-primary/80 uppercase">
            WILL-O&apos;-WISP
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm text-foreground">Keepers</span>
        </div>
        <SignOutButton />
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="font-serif text-3xl text-foreground">Your keepers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Keepers are the people who carry your light. If you stop checking in, two of them must
          confirm before anything is shared.
        </p>

        {warning && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-foreground"
          >
            {warning}
          </p>
        )}

        {summary.release && summary.release.state === "awaiting_keepers" && (
          <div className="mt-6">
            <ReleaseTimeline
              state={summary.release.state}
              received={summary.release.received}
              required={summary.release.required}
              acceptedKeepers={summary.acceptedCount}
            />
          </div>
        )}

        <section className="mt-8" aria-label="Keeper list">
          {summary.keepers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-10 text-center">
              <p className="text-muted-foreground">No keepers yet.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Invite two people you trust below.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {summary.keepers.map((k) => (
                <li key={k.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{k.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {k.email}
                        {k.relationship ? ` · ${k.relationship}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      {STATUS_LABEL[k.status]}
                    </span>
                  </div>
                  {k.status === "invited" && k.inviteExpiresAt && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Link expires {formatDateLabel(new Date(k.inviteExpiresAt), "UTC")}
                      {k.inviteEmailFailed ? " · the email didn't go out" : ""}
                    </p>
                  )}
                  {k.status === "accepted" && !k.hasPublicKey && (
                    <p className="mt-1 text-xs text-muted-foreground">Waiting for their key.</p>
                  )}
                  <KeeperRowActions
                    keeperId={k.id}
                    keeperName={k.name}
                    status={k.status}
                    inviteEmailFailed={k.inviteEmailFailed}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {needsKey && (
          <div className="mt-6">
            <KeeperKeySync />
          </div>
        )}

        <section className="mt-10" aria-label="Invite a keeper">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Invite a keeper
          </h2>
          <InviteForm />
        </section>
      </main>
    </div>
  );
}
