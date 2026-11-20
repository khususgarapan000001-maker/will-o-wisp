/**
 * Supabase-bound heartbeat operations used by the API routes, server actions
 * and server components. All access goes through the signed-in user's client
 * and RLS — the service-role key is never used here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  DAY_MS,
  dueAfterCadenceChange,
  type PlannedReminder,
} from "./cadence.ts";
import {
  effectiveNow,
  formatIntervalForPg,
  isDemoMode,
  parseIntervalMs,
} from "./demo-clock.ts";
import { decideClaim, type ClaimDecision } from "./reminders.ts";
import { machineFromRows } from "./rows.ts";
import {
  nextState,
  type HeartbeatMachine,
  type HeartbeatState,
} from "./state-machine.ts";
import { createLogMailer, createMailerFromEnv } from "./mailer.ts";
import { buildReminderForOwner, formatDateLabel } from "./reminder-builder.ts";
import { processOwnerTick, type TickStore, type TickOutcome, type TickOwner } from "./tick.ts";
import { emailKeepersReleasePending } from "../keepers/release-notify.ts";

type Db = SupabaseClient<Database>;
export type CheckInMethod = "button" | "login" | "magic_link";

export interface HeartbeatView {
  machine: HeartbeatMachine;
  reminderDaysBefore: number[];
  timeZone: string;
  displayName: string;
  /** "Now" as the owner's heartbeat sees it (demo offset applied in demo mode). */
  now: Date;
  demoOffsetMs: number;
  demoMode: boolean;
}

export type LoadResult =
  | { ok: true; view: HeartbeatView }
  | { ok: false; reason: "no_profile" | "no_settings" };

export async function loadHeartbeatView(
  supabase: Db,
  userId: string,
  realNow: Date = new Date()
): Promise<LoadResult> {
  const demoMode = isDemoMode(process.env);
  const [{ data: profile }, { data: settings }, { data: last }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, timezone, demo_time_offset")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("heartbeat_settings").select("*").eq("owner_id", userId).maybeSingle(),
    supabase
      .from("checkins")
      .select("checked_in_at")
      .eq("owner_id", userId)
      .order("checked_in_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!profile) return { ok: false, reason: "no_profile" };
  if (!settings) return { ok: false, reason: "no_settings" };

  const timeZone = profile.timezone || "Asia/Jakarta";
  return {
    ok: true,
    view: {
      machine: machineFromRows({
        settings,
        timeZone,
        lastCheckinAt: last?.checked_in_at ?? null,
      }),
      reminderDaysBefore: settings.reminder_days_before,
      timeZone,
      displayName: profile.display_name,
      now: effectiveNow(profile, realNow, demoMode),
      demoOffsetMs: demoMode ? Math.max(0, parseIntervalMs(profile.demo_time_offset)) : 0,
      demoMode,
    },
  };
}

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

export type CheckInResult =
  | {
      ok: true;
      previousState: HeartbeatState;
      state: "ALIVE";
      nextCheckinDue: string;
      cancelledRelease: boolean;
    }
  | { ok: false; reason: "no_profile" | "no_settings" | "released" | "db_error" };

export async function recordCheckIn(
  supabase: Db,
  userId: string,
  method: CheckInMethod,
  ipHash: string | null,
  realNow: Date = new Date()
): Promise<CheckInResult> {
  const loaded = await loadHeartbeatView(supabase, userId, realNow);
  if (!loaded.ok) return loaded;
  const { machine, now } = loaded.view;

  const t = nextState(machine, { type: "CHECK_IN" }, now);
  if (machine.state === "RELEASED") return { ok: false, reason: "released" };

  const { error: insertError } = await supabase.from("checkins").insert({
    owner_id: userId,
    checked_in_at: now.toISOString(),
    method,
    ip_hash: ipHash,
  });
  if (insertError) {
    console.error("[heartbeat/checkin] insert failed:", insertError.message);
    return { ok: false, reason: "db_error" };
  }

  const { error: updateError } = await supabase
    .from("heartbeat_settings")
    .update({
      state: t.machine.state,
      next_checkin_due: t.machine.nextCheckinDue.toISOString(),
      ...(machine.state !== t.machine.state
        ? { state_changed_at: now.toISOString() }
        : {}),
    })
    .eq("owner_id", userId);
  if (updateError) {
    console.error("[heartbeat/checkin] settings update failed:", updateError.message);
    return { ok: false, reason: "db_error" };
  }

  const cancel = t.effects.find((e) => e.type === "CANCEL_RELEASE");
  if (cancel) {
    const { error } = await supabase
      .from("release_processes")
      .update({
        state: "cancelled_false_alarm",
        cancelled_at: now.toISOString(),
        cancel_reason: cancel.reason,
      })
      .eq("owner_id", userId)
      .eq("state", "awaiting_keepers");
    if (error) console.error("[heartbeat/checkin] cancel release failed:", error.message);
  }

  return {
    ok: true,
    previousState: machine.state,
    state: "ALIVE",
    nextCheckinDue: t.machine.nextCheckinDue.toISOString(),
    cancelledRelease: cancel !== undefined,
  };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function updateCadenceAndGrace(
  supabase: Db,
  userId: string,
  cadenceDays: number,
  graceDays: number
): Promise<{ ok: true; nextCheckinDue: string } | { ok: false; reason: string }> {
  const loaded = await loadHeartbeatView(supabase, userId);
  if (!loaded.ok) return loaded;
  const { machine } = loaded.view;

  const due = dueAfterCadenceChange({
    currentDue: machine.nextCheckinDue,
    lastCheckin: machine.lastCheckinAt,
    oldCadenceDays: machine.cadenceDays,
    newCadenceDays: cadenceDays,
    timeZone: machine.timeZone,
  });

  const { error } = await supabase
    .from("heartbeat_settings")
    .update({
      cadence_days: cadenceDays,
      grace_days: graceDays,
      next_checkin_due: due.toISOString(),
    })
    .eq("owner_id", userId);
  if (error) {
    console.error("[heartbeat/settings] update failed:", error.message);
    return { ok: false, reason: "db_error" };
  }
  return { ok: true, nextCheckinDue: due.toISOString() };
}

// ---------------------------------------------------------------------------
// Tick store backed by the Supabase client (demo route; RLS applies)
// ---------------------------------------------------------------------------

export class SupabaseTickStore implements TickStore {
  constructor(private readonly supabase: Db) {}

  async saveMachine(ownerId: string, machine: HeartbeatMachine, changedAt: Date) {
    const { error } = await this.supabase
      .from("heartbeat_settings")
      .update({
        state: machine.state,
        next_checkin_due: machine.nextCheckinDue.toISOString(),
        state_changed_at: changedAt.toISOString(),
      })
      .eq("owner_id", ownerId);
    if (error) throw new Error(`saveMachine: ${error.message}`);
  }

  async openRelease(ownerId: string, triggeredAt: Date, required: number) {
    const { error } = await this.supabase.from("release_processes").insert({
      owner_id: ownerId,
      triggered_at: triggeredAt.toISOString(),
      state: "awaiting_keepers",
      required_confirmations: required,
    });
    // 23505: an open process already exists (unique partial index) — fine.
    if (error && error.code !== "23505") throw new Error(`openRelease: ${error.message}`);
  }

  async claimNotification(
    ownerId: string,
    r: PlannedReminder
  ): Promise<ClaimDecision> {
    const { data: row } = await this.supabase
      .from("notifications")
      .select("id, sent_at, attempts")
      .eq("owner_id", ownerId)
      .eq("kind", r.kind)
      .eq("due_date", r.dueDate)
      .maybeSingle();
    const decision = decideClaim(
      row ? { sentAt: row.sent_at ? new Date(row.sent_at) : null, attempts: row.attempts } : null
    );
    if (decision === "insert_and_send") {
      const { error } = await this.supabase.from("notifications").insert({
        owner_id: ownerId,
        kind: r.kind,
        due_date: r.dueDate,
        attempts: 1,
      });
      // Lost the race to a concurrent insert: treat as already claimed.
      if (error?.code === "23505") return "already_sent";
      if (error) throw new Error(`claimNotification: ${error.message}`);
    } else if (decision === "retry" && row) {
      await this.supabase
        .from("notifications")
        .update({ attempts: row.attempts + 1 })
        .eq("id", row.id);
    }
    return decision;
  }

  async finishNotification(
    ownerId: string,
    r: PlannedReminder,
    result: { sent: boolean; delivery: string; at: Date }
  ) {
    if (!result.sent) return;
    await this.supabase
      .from("notifications")
      .update({ sent_at: result.at.toISOString(), payload: { delivery: result.delivery } })
      .eq("owner_id", ownerId)
      .eq("kind", r.kind)
      .eq("due_date", r.dueDate);
  }
}

// ---------------------------------------------------------------------------
// Release opened: notify the accepted keepers (demo path; runs as the owner)
// ---------------------------------------------------------------------------

/**
 * Emails each accepted keeper and writes their in-app notice. The owner's
 * session may read their own keepers (RLS) and call notify_release_pending
 * (which checks the caller owns the release). Spec 5 letters delivery is NOT
 * triggered here; it happens when the release is confirmed.
 */
export function releaseOpenedNotifier(supabase: Db, appUrl: string) {
  return async (owner: TickOwner): Promise<void> => {
    const { data: release } = await supabase
      .from("release_processes")
      .select("id")
      .eq("owner_id", owner.ownerId)
      .eq("state", "awaiting_keepers")
      .maybeSingle();
    if (!release) return;

    await supabase.rpc("notify_release_pending", { p_release_id: release.id });

    const { data: keepers } = await supabase
      .from("keepers")
      .select("name, email")
      .eq("owner_id", owner.ownerId)
      .eq("status", "accepted");
    if (!keepers || keepers.length === 0) return;

    const { data: last } = await supabase
      .from("checkins")
      .select("checked_in_at")
      .eq("owner_id", owner.ownerId)
      .order("checked_in_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    await emailKeepersReleasePending({
      mailer: createMailerFromEnv(process.env),
      ownerName: owner.displayName,
      lastCheckinLabel: last
        ? formatDateLabel(new Date(last.checked_in_at), owner.machine.timeZone)
        : null,
      releaseUrl: `${appUrl.replace(/\/$/, "")}/keeper/release/${release.id}`,
      keepers,
    });
  };
}

// ---------------------------------------------------------------------------
// Demo clock
// ---------------------------------------------------------------------------

/** The only account allowed to move the demo clock (even when DEMO_MODE is on). */
export function demoAccountEmail(env: Record<string, string | undefined>): string {
  return (env.DEMO_ACCOUNT_EMAIL || "demo@will-o-wisp.example").toLowerCase();
}

export type AdvanceResult =
  | { ok: true; offsetDays: number; before: HeartbeatState; after: HeartbeatState; ticks: TickOutcome[] }
  | { ok: false; reason: "demo_disabled" | "not_demo_account" | "invalid_days" | "no_profile" | "no_settings" | "db_error" };

export async function advanceDemoClock(
  supabase: Db,
  user: { id: string; email?: string | undefined },
  days: number,
  env: Record<string, string | undefined> = process.env,
  realNow: Date = new Date()
): Promise<AdvanceResult> {
  // Requirement 17: with DEMO_MODE off nobody can set an offset.
  if (!isDemoMode(env)) return { ok: false, reason: "demo_disabled" };
  if ((user.email ?? "").toLowerCase() !== demoAccountEmail(env)) {
    return { ok: false, reason: "not_demo_account" };
  }
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    return { ok: false, reason: "invalid_days" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("demo_time_offset")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return { ok: false, reason: "no_profile" };

  const newOffsetMs = Math.max(0, parseIntervalMs(profile.demo_time_offset)) + days * DAY_MS;
  const { error } = await supabase
    .from("profiles")
    .update({ demo_time_offset: formatIntervalForPg(newOffsetMs) })
    .eq("id", user.id);
  if (error) {
    console.error("[demo-clock] offset update failed:", error.message);
    return { ok: false, reason: "db_error" };
  }

  // Run ticks right away (the 15-minute cron would be too slow for a demo).
  // One tick moves at most one step, so loop until the state settles.
  const store = new SupabaseTickStore(supabase);
  const ticks: TickOutcome[] = [];
  let before: HeartbeatState | null = null;
  for (let i = 0; i < 3; i++) {
    const loaded = await loadHeartbeatView(supabase, user.id, realNow);
    if (!loaded.ok) return loaded;
    before ??= loaded.view.machine.state;
    const outcome = await processOwnerTick(
      {
        ownerId: user.id,
        email: user.email ?? null,
        displayName: loaded.view.displayName,
        machine: loaded.view.machine,
        reminderDaysBefore: loaded.view.reminderDaysBefore,
        demoTimeOffset: formatIntervalForPg(newOffsetMs),
      },
      {
        store,
        mailer: createLogMailer(),
        buildEmail: async (o, r) =>
          buildReminderForOwner(o, r, `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/app/checkin`),
        demoMode: true,
        onReleaseOpened: releaseOpenedNotifier(supabase, process.env.NEXT_PUBLIC_APP_URL ?? ""),
      },
      realNow
    );
    ticks.push(outcome);
    if (outcome.before === outcome.after) break;
  }
  const last = ticks[ticks.length - 1];
  return {
    ok: true,
    offsetDays: Math.round(newOffsetMs / DAY_MS),
    before: before ?? last.before,
    after: last.after,
    ticks,
  };
}
