import { redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { getIncompleteSetupItems } from "@/lib/onboarding/state";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { LanternFlame } from "@/components/lantern/LanternFlame";
import { CheckInButton } from "@/components/lantern/CheckInButton";
import { LoginCheckInPrompt } from "@/components/lantern/LoginCheckInPrompt";
import { DemoClockControl } from "@/components/lantern/DemoClockControl";
import { loadHeartbeatView, demoAccountEmail } from "@/lib/heartbeat/service";
import { formatDateLabel } from "@/lib/heartbeat/reminder-builder";
import { DAY_MS } from "@/lib/heartbeat/cadence";

/**
 * Dashboard — server component.
 *
 * Redirects to sign-in when unauthenticated, to onboarding when setup is
 * incomplete. The minimum requirement for "complete" is onboarding_completed_at
 * being set (steps a + c mandatory; b/d/e may be skipped).
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { welcome } = await searchParams;
  const user = await getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, onboarding_completed_at")
    .eq("id", user.id)
    .single();

  // Redirect to onboarding if not yet complete.
  if (!profile?.onboarding_completed_at) {
    redirect("/app/onboarding");
  }

  // Check for setup items that were skipped.
  const { data: heartbeatSettings } = await supabase
    .from("heartbeat_settings")
    .select("state, next_checkin_due, cadence_days")
    .eq("owner_id", user.id)
    .maybeSingle();

  // Check whether the vault passphrase has been set (Spec 2).
  const { data: vault } = await supabase
    .from("vaults")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  const incompleteItems = getIncompleteSetupItems({
    onboardingCompletedAt: profile.onboarding_completed_at,
    hasHeartbeatSettings: heartbeatSettings !== null,
    hasVault: vault !== null,
  });

  const displayName = profile.display_name ?? "there";
  const loaded = await loadHeartbeatView(supabase, user.id);
  const view = loaded.ok ? loaded.view : null;
  const heartbeatState = view?.machine.state ?? "ALIVE";
  const dueLabel = view
    ? formatDateLabel(view.machine.nextCheckinDue, view.timeZone)
    : "";
  const maxReminderDays = Math.max(3, ...(view?.reminderDaysBefore ?? []));
  const dueSoon =
    view !== null &&
    (heartbeatState !== "ALIVE" ||
      view.machine.nextCheckinDue.getTime() - view.now.getTime() <=
        maxReminderDays * DAY_MS);
  const showLoginPrompt = welcome === "1" && view !== null && heartbeatState !== "RELEASED" && dueSoon;
  const showDemoControl =
    view?.demoMode === true &&
    (user.email ?? "").toLowerCase() === demoAccountEmail(process.env);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <p className="text-sm tracking-[0.3em] text-primary/80 uppercase">
          WILL-O&apos;-WISP
        </p>
        <SignOutButton />
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        {/* Greeting */}
        <h1 className="font-serif text-3xl text-foreground">
          Hello, {displayName}.
        </h1>
        <p className="mt-1 text-muted-foreground">
          Your lantern is burning.
        </p>

        {/* Lantern */}
        <div className="mt-8 flex justify-center">
          <LanternFlame state={heartbeatState} />
        </div>

        {showLoginPrompt && (
          <LoginCheckInPrompt dueLabel={dueLabel} overdue={heartbeatState !== "ALIVE"} />
        )}

        {view && heartbeatState !== "RELEASED" && (
          <div className="mt-6 flex justify-center">
            <CheckInButton />
          </div>
        )}

        {/* Heartbeat status */}
        {heartbeatSettings && (
          <div className="mt-6 rounded-xl border border-border bg-card p-4 text-center">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Heartbeat
            </p>
            <p className="mt-1 text-lg font-semibold capitalize text-foreground">
              {heartbeatState.toLowerCase().replace("_", " ")}
            </p>
            {view && (
              <p className="mt-1 text-sm text-muted-foreground">
                Next check-in due {dueLabel}
              </p>
            )}
          </div>
        )}

        {showDemoControl && view && (
          <DemoClockControl offsetDays={Math.round(view.demoOffsetMs / DAY_MS)} />
        )}

        {/* Setup checklist — only shown when there are incomplete items */}
        {incompleteItems.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Finish setting up
            </h2>
            <ul className="flex flex-col gap-2">
              {incompleteItems.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/30"
                  >
                    <span className="mt-0.5 text-sm text-muted-foreground">◦</span>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {item.label}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Quick-links nav */}
        <nav className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="App sections">
          {[
            { href: "/app/vault", label: "Vault", desc: "Encrypted items" },
            { href: "/app/letters", label: "Letters", desc: "Last messages" },
            { href: "/app/will", label: "Will", desc: "Account wishes" },
            { href: "/app/keepers", label: "Keepers", desc: "Trusted people" },
            { href: "/app/heartbeat", label: "Heartbeat", desc: "Check-in settings" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/30"
            >
              <span className="text-sm font-medium text-foreground">{link.label}</span>
              <span className="mt-0.5 text-xs text-muted-foreground">{link.desc}</span>
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}
