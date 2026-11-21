/**
 * heartbeat-tick — DASHBOARD-EDITOR variant (deployed 21 Nov 2026).
 * Same code as index.ts, except the lib/ imports point at the raw GitHub
 * URLs of the same files, because the dashboard editor cannot see the
 * repo checkout that the CLI bundler uses. Transitive relative imports
 * inside lib/ resolve against raw.githubusercontent.com. The npm:
 * specifiers are unchanged (Deno resolves them).
 *
 * Deploy this file (not index.ts) when using Dashboard -> Edge Functions
 * -> Create a new function. The CLI deploy still uses index.ts.
 */

/**
 * heartbeat-tick — Supabase Edge Function (Deno), design-doc §6.3.
 *
 * Invoked every 15 minutes by pg_cron (see README.md). For every owner it:
 *   1. locks the owner's heartbeat_settings row (SELECT … FOR UPDATE) inside a
 *      transaction, so a retry or a concurrent tick cannot double-process;
 *   2. applies ONE state step with the shared pure machine
 *      (ALIVE → OVERDUE, or OVERDUE → AWAITING_KEEPERS + a release_processes row);
 *   3. sends due reminders, idempotent through the `notifications` unique key.
 * An error for one owner is caught and logged; other owners still run.
 *
 * The business logic is NOT re-implemented here: it imports the same pure
 * modules the Vitest/fast-check suite exercises (lib/heartbeat/*.ts).
 *
 * Direct Postgres access (SUPABASE_DB_URL, injected by the platform) is used
 * instead of PostgREST because row locks + transactions need a real connection.
 * The service-role key is used only to mint magic-link tokens for the
 * "I'm here" link in reminder emails.
 */

import postgres from "npm:postgres@3";
import { createClient } from "npm:@supabase/supabase-js@2";
import { processOwnerTick, type TickOwner, type TickStore } from "https://raw.githubusercontent.com/khususgarapan000001-maker/will-o-wisp/main/lib/heartbeat/tick.ts";
import { machineFromRows } from "https://raw.githubusercontent.com/khususgarapan000001-maker/will-o-wisp/main/lib/heartbeat/rows.ts";
import { decideClaim, type ClaimDecision } from "https://raw.githubusercontent.com/khususgarapan000001-maker/will-o-wisp/main/lib/heartbeat/reminders.ts";
import { isDemoMode } from "https://raw.githubusercontent.com/khususgarapan000001-maker/will-o-wisp/main/lib/heartbeat/demo-clock.ts";
import { createMailer } from "https://raw.githubusercontent.com/khususgarapan000001-maker/will-o-wisp/main/lib/heartbeat/mailer.ts";
import { buildReminderForOwner } from "https://raw.githubusercontent.com/khususgarapan000001-maker/will-o-wisp/main/lib/heartbeat/reminder-builder.ts";
import type { PlannedReminder } from "https://raw.githubusercontent.com/khususgarapan000001-maker/will-o-wisp/main/lib/heartbeat/cadence.ts";
import type { HeartbeatMachine } from "https://raw.githubusercontent.com/khususgarapan000001-maker/will-o-wisp/main/lib/heartbeat/state-machine.ts";
import { emailKeepersReleasePending } from "https://raw.githubusercontent.com/khususgarapan000001-maker/will-o-wisp/main/lib/keepers/release-notify.ts";
import { formatDateLabel } from "https://raw.githubusercontent.com/khususgarapan000001-maker/will-o-wisp/main/lib/heartbeat/reminder-builder.ts";

// deno-lint-ignore no-explicit-any
type Tx = any; // postgres.TransactionSql — kept loose so the file needs no type install.

const env = (name: string): string | undefined => Deno.env.get(name);

/** TickStore over a single open transaction (all statements share the row lock). */
class PgTickStore implements TickStore {
  constructor(private readonly tx: Tx) {}

  async saveMachine(ownerId: string, m: HeartbeatMachine, changedAt: Date) {
    await this.tx`
      update public.heartbeat_settings
         set state = ${m.state},
             next_checkin_due = ${m.nextCheckinDue},
             state_changed_at = ${changedAt}
       where owner_id = ${ownerId}`;
  }

  async openRelease(ownerId: string, triggeredAt: Date, required: number) {
    await this.tx`
      insert into public.release_processes (owner_id, triggered_at, state, required_confirmations)
      values (${ownerId}, ${triggeredAt}, 'awaiting_keepers', ${required})
      on conflict (owner_id) where state = 'awaiting_keepers' do nothing`;
  }

  async claimNotification(ownerId: string, r: PlannedReminder): Promise<ClaimDecision> {
    const inserted = await this.tx`
      insert into public.notifications (owner_id, kind, due_date, attempts)
      values (${ownerId}, ${r.kind}, ${r.dueDate}::date, 1)
      on conflict (owner_id, kind, due_date) do nothing
      returning id`;
    if (inserted.length > 0) return "insert_and_send";

    const [row] = await this.tx`
      select id, sent_at, attempts from public.notifications
       where owner_id = ${ownerId} and kind = ${r.kind} and due_date = ${r.dueDate}::date
       for update`;
    const decision = decideClaim(
      row ? { sentAt: row.sent_at, attempts: row.attempts } : null
    );
    if (decision === "retry") {
      await this.tx`update public.notifications set attempts = attempts + 1 where id = ${row.id}`;
    }
    return decision;
  }

  async finishNotification(
    ownerId: string,
    r: PlannedReminder,
    result: { sent: boolean; delivery: string; at: Date }
  ) {
    if (!result.sent) return; // stays unsent; the next tick retries (max 3 attempts)
    await this.tx`
      update public.notifications
         set sent_at = ${result.at},
             payload = ${JSON.stringify({ delivery: result.delivery })}::jsonb
       where owner_id = ${ownerId} and kind = ${r.kind} and due_date = ${r.dueDate}::date`;
  }
}

function authorized(req: Request): boolean {
  // pg_cron sends the service-role key (or a dedicated secret) as a bearer token.
  const expected = env("HEARTBEAT_CRON_SECRET") ?? env("SUPABASE_SERVICE_ROLE_KEY");
  if (!expected) return false;
  return req.headers.get("Authorization") === `Bearer ${expected}`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (!authorized(req)) return new Response("unauthorized", { status: 401 });

  const dbUrl = env("SUPABASE_DB_URL");
  if (!dbUrl) return new Response("SUPABASE_DB_URL is not set", { status: 500 });

  const appUrl = (env("APP_URL") ?? env("NEXT_PUBLIC_APP_URL") ?? "").replace(/\/$/, "");
  const demoMode = isDemoMode({ DEMO_MODE: env("DEMO_MODE") });
  const mailer = createMailer({
    RESEND_API_KEY: env("RESEND_API_KEY"),
    RESEND_FROM_EMAIL: env("RESEND_FROM_EMAIL"),
  });

  const supabaseUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const admin =
    supabaseUrl && serviceKey
      ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
      : null;

  /** One-tap check-in link: a magic link that lands on /app/checkin. */
  async function checkInUrl(email: string): Promise<string> {
    const plain = `${appUrl}/app/checkin`;
    if (!admin) return plain;
    try {
      const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
      const hash = data?.properties?.hashed_token;
      if (error || !hash) return plain;
      const next = encodeURIComponent("/app/checkin");
      return `${appUrl}/auth/callback?token_hash=${encodeURIComponent(hash)}&type=magiclink&next=${next}`;
    } catch {
      return plain;
    }
  }

  const sql = postgres(dbUrl, { max: 1, prepare: false });
  const now = new Date();
  const summary = {
    owners: 0,
    transitions: 0,
    releasesOpened: 0,
    remindersSent: 0,
    remindersFailed: 0,
    errors: 0,
    mailer: mailer.provider,
  };

  try {
    // Candidates: everyone who is not terminal. Cheap read, no lock.
    const candidates: { owner_id: string }[] = await sql`
      select owner_id from public.heartbeat_settings
       where state in ('ALIVE', 'OVERDUE')
       order by next_checkin_due asc`;

    for (const { owner_id } of candidates) {
      summary.owners++;
      try {
        await sql.begin(async (tx: Tx) => {
          // Row lock: a concurrent tick for this owner waits here, then re-reads fresh state.
          const [row] = await tx`
            select hs.owner_id, hs.state, hs.next_checkin_due, hs.cadence_days, hs.grace_days,
                   hs.reminder_days_before, p.timezone, p.display_name,
                   p.demo_time_offset::text as demo_time_offset, u.email,
                   (select max(c.checked_in_at) from public.checkins c where c.owner_id = hs.owner_id) as last_checkin
              from public.heartbeat_settings hs
              join public.profiles p on p.id = hs.owner_id
              left join auth.users u on u.id = hs.owner_id
             where hs.owner_id = ${owner_id}
               for update of hs`;
          if (!row || (row.state !== "ALIVE" && row.state !== "OVERDUE")) return;

          const owner: TickOwner = {
            ownerId: row.owner_id,
            email: row.email ?? null,
            displayName: row.display_name ?? "",
            machine: machineFromRows({
              settings: row,
              timeZone: row.timezone,
              lastCheckinAt: row.last_checkin,
            }),
            reminderDaysBefore: row.reminder_days_before ?? [3, 1],
            demoTimeOffset: row.demo_time_offset ?? null,
          };

          const outcome = await processOwnerTick(
            owner,
            {
              store: new PgTickStore(tx),
              mailer,
              demoMode,
              buildEmail: async (o, reminder) =>
                o.email ? buildReminderForOwner(o, reminder, await checkInUrl(o.email)) : null,
              // Spec 4: tell the accepted keepers (email + in-app inbox row).
              onReleaseOpened: async (o) => {
                const [release] = await tx`
                  select id from public.release_processes
                   where owner_id = ${o.ownerId} and state = 'awaiting_keepers'`;
                if (!release) return;
                await tx`select public.notify_release_pending(${release.id}::uuid)`;
                const keepers: { name: string; email: string }[] = await tx`
                  select name, email from public.keepers
                   where owner_id = ${o.ownerId} and status = 'accepted'`;
                const [last] = await tx`
                  select max(checked_in_at) as at from public.checkins where owner_id = ${o.ownerId}`;
                await emailKeepersReleasePending({
                  mailer,
                  ownerName: o.displayName,
                  lastCheckinLabel: last?.at ? formatDateLabel(new Date(last.at), o.machine.timeZone) : null,
                  releaseUrl: `${appUrl}/keeper/release/${release.id}`,
                  keepers,
                });
              },
            },
            now
          );
          if (outcome.before !== outcome.after) summary.transitions++;
          if (outcome.releaseOpened) summary.releasesOpened++;
          summary.remindersSent += outcome.remindersSent.length;
          summary.remindersFailed += outcome.remindersFailed.length;
        });
      } catch (err) {
        // Per-owner isolation: log (never include emails, tokens or links) and carry on.
        summary.errors++;
        console.error(
          `[heartbeat-tick] owner ${owner_id} failed:`,
          err instanceof Error ? err.message : "unknown error"
        );
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log("[heartbeat-tick] done", JSON.stringify(summary));
  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
});
