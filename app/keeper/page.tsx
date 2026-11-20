import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { Notices } from "@/components/keepers/Notices";
import { SignOutButton } from "@/components/auth/SignOutButton";

/** Keeper home: any open or past releases they can see, and their notices. */
export default async function KeeperHomePage() {
  const user = await getUser();
  if (!user) redirect("/auth/sign-in?redirectTo=%2Fkeeper");

  const supabase = await createClient();
  const [{ data: releases }, { data: notices }] = await Promise.all([
    supabase
      .from("release_processes")
      .select("id, state, triggered_at")
      .order("triggered_at", { ascending: false })
      .limit(10),
    supabase
      .from("notifications")
      .select("id, kind, payload, created_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const contexts = await Promise.all(
    (releases ?? []).map(async (r) => {
      const { data } = await supabase.rpc("get_release_context", { p_release_id: r.id });
      return { id: r.id, ctx: data?.[0] ?? null };
    })
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <p className="text-sm tracking-[0.3em] text-primary/80 uppercase">WILL-O&apos;-WISP</p>
        <SignOutButton />
      </header>
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="font-serif text-3xl text-foreground">Keeper</h1>
        <p className="mt-1 text-muted-foreground">
          Thank you for carrying a light for someone.
        </p>

        <section className="mt-8" aria-label="Releases">
          {contexts.filter((c) => c.ctx).length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-10 text-center">
              <p className="text-muted-foreground">Nothing needs your attention.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                If someone stops checking in, we&apos;ll email you.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {contexts.map(({ id, ctx }) =>
                ctx ? (
                  <li key={id}>
                    <Link
                      href={`/keeper/release/${id}`}
                      className="flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/30"
                    >
                      <span className="text-sm font-medium text-foreground">{ctx.owner_name}</span>
                      <span className="mt-0.5 text-xs text-muted-foreground">
                        {ctx.release_state === "awaiting_keepers"
                          ? ctx.my_decision
                            ? "You've answered. Waiting for another keeper."
                            : "Waiting for your answer"
                          : ctx.release_state === "released"
                            ? "Released. What they left is ready."
                            : "Closed"}
                      </span>
                    </Link>
                  </li>
                ) : null
              )}
            </ul>
          )}
        </section>

        <Notices rows={notices ?? []} audience="keeper" />
      </main>
    </div>
  );
}
