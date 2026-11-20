import { redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { loadHeartbeatView, demoAccountEmail } from "@/lib/heartbeat/service";
import { formatDateLabel } from "@/lib/heartbeat/reminder-builder";
import { graceEndsAt, DAY_MS } from "@/lib/heartbeat/cadence";
import { explainState } from "@/lib/heartbeat/explainer";
import { LanternFlame } from "@/components/lantern/LanternFlame";
import { CheckInButton } from "@/components/lantern/CheckInButton";
import { DemoClockControl } from "@/components/lantern/DemoClockControl";
import { HeartbeatSettingsForm } from "@/components/lantern/HeartbeatSettingsForm";

const METHOD_LABELS: Record<string, string> = {
  button: "Tapped “I'm here”",
  login: "On sign-in",
  magic_link: "From an email link",
};

const STATE_LABELS: Record<string, string> = {
  ALIVE: "Steady",
  OVERDUE: "Overdue (grace period)",
  AWAITING_KEEPERS: "Waiting for keepers",
  RELEASED: "Shared",
};

export default async function HeartbeatPage() {
  const user = await getUser();
  if (!user) redirect("/auth/sign-in");

  const supabase = await createClient();
  const loaded = await loadHeartbeatView(supabase, user.id);
  if (!loaded.ok) redirect("/app");
  const { view } = loaded;
  const { machine } = view;

  const { data: history } = await supabase
    .from("checkins")
    .select("id, checked_in_at, method")
    .eq("owner_id", user.id)
    .order("checked_in_at", { ascending: false })
    .limit(10);

  const tz = view.timeZone;
  const dueLabel = formatDateLabel(machine.nextCheckinDue, tz);
  const graceEndLabel = formatDateLabel(
    graceEndsAt(machine.nextCheckinDue, machine.graceDays, tz),
    tz
  );
  const explainer = explainState({
    state: machine.state,
    dueLabel,
    graceEndLabel,
    graceDays: machine.graceDays,
  });
  const dateTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    dateStyle: "medium",
    timeStyle: "short",
  });
  const showDemoControl =
    view.demoMode && (user.email ?? "").toLowerCase() === demoAccountEmail(process.env);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <p className="text-sm uppercase tracking-[0.3em] text-primary/80">WILL-O&apos;-WISP</p>
        <Link href="/app" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to your lantern
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="font-serif text-3xl text-foreground">Heartbeat</h1>

        <div className="mt-6 flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-6 text-center">
          <LanternFlame state={machine.state} />
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Current state</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {STATE_LABELS[machine.state]}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Next check-in due {dueLabel}</p>
          </div>
          {machine.state !== "RELEASED" && <CheckInButton />}
        </div>

        <section className="mt-8" aria-labelledby="next-heading">
          <h2 id="next-heading" className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            What happens next
          </h2>
          <p className="mt-2 font-serif text-lg text-foreground">{explainer.headline}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {explainer.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </section>

        {machine.state !== "RELEASED" && (
          <section className="mt-8" aria-labelledby="settings-heading">
            <h2 id="settings-heading" className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Settings
            </h2>
            <div className="rounded-xl border border-border bg-card p-4">
              <HeartbeatSettingsForm cadenceDays={machine.cadenceDays} graceDays={machine.graceDays} />
            </div>
          </section>
        )}

        <section className="mt-8" aria-labelledby="history-heading">
          <h2 id="history-heading" className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Check-in history
          </h2>
          {history && history.length > 0 ? (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="text-foreground">{dateTime.format(new Date(h.checked_in_at))}</span>
                  <span className="text-muted-foreground">{METHOD_LABELS[h.method] ?? h.method}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              No check-ins yet. Your first one will appear here.
            </p>
          )}
        </section>

        {showDemoControl && <DemoClockControl offsetDays={Math.round(view.demoOffsetMs / DAY_MS)} />}
      </main>
    </div>
  );
}
