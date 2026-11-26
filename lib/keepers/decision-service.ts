/**
 * Keeper decision: thin wrapper over the transactional SQL function
 * record_keeper_decision(), plus the calm "released" / "false alarm" emails to
 * every party. The SQL function owns all counting, locking and state changes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, DecisionOutcome, KeeperDecision } from "@/lib/supabase/types";
import { createMailerFromEnv, type Mailer } from "@/lib/heartbeat/mailer";
import {
  buildFalseAlarmEmail,
  buildReleasedEmail,
} from "@/lib/email/templates/keepers";
import { sendLetterDeliveryEmails } from "@/lib/letters/deliver";
import { sendWillDeliveryEmails } from "@/lib/will/deliver";

type Db = SupabaseClient<Database>;

export type DecisionResult =
  | {
      ok: true;
      outcome: DecisionOutcome;
      releaseState: string;
      confirmations: number;
      required: number;
    }
  | { ok: false; reason: "not_a_keeper" | "invalid" | "db_error" };

export async function decideRelease(
  supabase: Db,
  releaseId: string,
  decision: KeeperDecision,
  note: string | null,
  appUrl: string,
  mailer: Mailer = createMailerFromEnv(process.env)
): Promise<DecisionResult> {
  // Resolve "which keeper am I for this release" through RLS-scoped context.
  const { data: ctx, error: ctxError } = await supabase.rpc("get_release_context", {
    p_release_id: releaseId,
  });
  if (ctxError) {
    console.error("[releases/decide] context failed:", ctxError.message);
    return { ok: false, reason: "db_error" };
  }
  const context = ctx?.[0];
  if (!context) return { ok: false, reason: "not_a_keeper" };

  const { data, error } = await supabase.rpc("record_keeper_decision", {
    p_release_id: releaseId,
    p_keeper_id: context.keeper_id,
    p_decision: decision,
    p_note: note ?? undefined,
  });
  if (error) {
    console.error("[releases/decide] rpc failed:", error.message);
    if (error.message.includes("not_a_keeper")) return { ok: false, reason: "not_a_keeper" };
    if (error.message.includes("invalid_decision")) return { ok: false, reason: "invalid" };
    return { ok: false, reason: "db_error" };
  }
  const row = data?.[0];
  if (!row) return { ok: false, reason: "db_error" };

  if (row.outcome === "released" || row.outcome === "cancelled") {
    await emailParties(supabase, mailer, {
      releaseId,
      ownerName: context.owner_name,
      kind: row.outcome,
      note,
      appUrl,
    });
  }

  // Spec 5: the database already marked the letters delivered and wrote the
  // in-app notices in the same transaction as the release. Only a genuinely
  // released outcome gets here: not recorded, cancelled or already_decided.
  if (row.outcome === "released") {
    await sendLetterDeliveryEmails(supabase, mailer, {
      releaseId,
      ownerName: context.owner_name,
      appUrl,
    });
    // Spec 6: the same shape for the digital will (link-only email; the
    // database trigger already wrote the in-app notices).
    await sendWillDeliveryEmails(supabase, mailer, {
      releaseId,
      ownerName: context.owner_name,
      appUrl,
    });
  }

  return {
    ok: true,
    outcome: row.outcome as DecisionOutcome,
    releaseState: row.release_state,
    confirmations: row.confirmations,
    required: row.required_confirmations,
  };
}

async function emailParties(
  supabase: Db,
  mailer: Mailer,
  args: {
    releaseId: string;
    ownerName: string;
    kind: "released" | "cancelled";
    note: string | null;
    appUrl: string;
  }
): Promise<void> {
  try {
    const { data: parties } = await supabase.rpc("release_party_emails", {
      p_release_id: args.releaseId,
    });
    const base = args.appUrl.replace(/\/$/, "");
    for (const p of parties ?? []) {
      const audience = p.party_role as "owner" | "keeper";
      const message =
        args.kind === "released"
          ? buildReleasedEmail({
              to: p.party_email,
              recipientName: p.party_name,
              ownerName: args.ownerName,
              audience,
              url: audience === "keeper" ? `${base}/keeper/release/${args.releaseId}` : `${base}/app`,
            })
          : buildFalseAlarmEmail({
              to: p.party_email,
              recipientName: p.party_name,
              ownerName: args.ownerName,
              audience,
              // The note is for the owner; other keepers just get the all-clear.
              note: audience === "owner" ? args.note : null,
              url: `${base}/app`,
            });
      const result = await mailer.send(message);
      if (!result.ok) console.error("[releases/decide] email failed:", message.tag);
    }
  } catch (err) {
    // Emails are best-effort; the decision is already committed.
    console.error("[releases/decide] email fan-out failed:", err instanceof Error ? err.message : "unknown");
  }
}
