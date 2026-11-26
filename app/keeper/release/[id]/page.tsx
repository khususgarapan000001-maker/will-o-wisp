import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { DecisionForm } from "@/components/keepers/DecisionForm";
import { ReleaseTimeline } from "@/components/lantern/ReleaseTimeline";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { formatElapsed, type ReleaseStateName } from "@/lib/keepers/release-status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keeper's release decision page. Shows buttons only while a decision is possible. */
export default async function KeeperReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  if (!user) redirect(`/auth/sign-in?redirectTo=${encodeURIComponent(`/keeper/release/${id}`)}`);

  const supabase = await createClient();
  const context = UUID_RE.test(id)
    ? (await supabase.rpc("get_release_context", { p_release_id: id })).data?.[0]
    : undefined;

  if (!context) {
    return (
      <Shell>
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="font-serif text-xl">We couldn&apos;t find that page</CardTitle>
            <CardDescription>
              It may belong to a different account. Try signing in with the email address the
              invitation was sent to.
            </CardDescription>
          </CardHeader>
        </Card>
      </Shell>
    );
  }

  const open = context.release_state === "awaiting_keepers";
  const decided = context.my_decision !== null;
  const since = context.last_checkin_at
    ? formatElapsed(new Date(context.last_checkin_at), new Date(context.as_of))
    : null;

  return (
    <Shell>
      <div className="flex w-full max-w-lg flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl">{context.owner_name}</CardTitle>
            <CardDescription>
              {since
                ? `Last checked in ${since} ago.`
                : "We don't have a recent check-in from them."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {open && !decided && (
              <>
                <div className="space-y-2 text-sm text-foreground">
                  <p>
                    {context.owner_name} hasn&apos;t checked in, and their grace period has
                    passed. Please try to reach them first.
                  </p>
                  <p>
                    If you confirm and one other keeper does too, what {context.owner_name} left
                    for the keepers will be shared. If you know they&apos;re fine, tell us it&apos;s
                    a false alarm and nothing will be shared.
                  </p>
                </div>
                <DecisionForm releaseId={id} ownerName={context.owner_name} />
              </>
            )}

            {open && decided && (
              <p role="status" className="text-sm text-foreground">
                You&apos;ve confirmed. Thank you. We&apos;re waiting for another keeper; nothing
                is shared until then, and you can&apos;t change this decision.
              </p>
            )}

            {!open && (
              <p role="status" className="text-sm text-foreground">
                {context.release_state === "released"
                  ? `The release was confirmed. What ${context.owner_name} left for you is ready.`
                  : context.release_state === "cancelled_false_alarm"
                    ? `This was a false alarm. ${context.owner_name} is fine and nothing was shared.`
                    : "This release is closed."}
              </p>
            )}
          </CardContent>
        </Card>

        <ReleaseTimeline
          state={context.release_state as ReleaseStateName}
          received={context.confirmations}
          required={context.required_confirmations}
        />

        {context.release_state === "released" && (
          <nav aria-label="What was left for you" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { href: `/keeper/release/${id}/vault`, label: "Vault", desc: "Messages and instructions" },
              { href: `/keeper/release/${id}/letters`, label: "Letters", desc: "Last letters" },
              { href: `/keeper/release/${id}/will`, label: "Will", desc: "Account wishes" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/30"
              >
                <span className="text-sm font-medium text-foreground">{l.label}</span>
                <span className="mt-0.5 text-xs text-muted-foreground">{l.desc}</span>
              </Link>
            ))}
          </nav>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link href="/keeper" className="text-sm tracking-[0.3em] text-primary/80 uppercase">
          WILL-O&apos;-WISP
        </Link>
        <SignOutButton />
      </header>
      <main className="flex min-h-[80vh] justify-center px-4 py-10">{children}</main>
    </div>
  );
}
