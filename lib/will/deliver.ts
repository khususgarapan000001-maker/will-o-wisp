/**
 * Will delivery, step 2 of 2 (mirrors lib/letters/deliver.ts).
 *
 * Step 1 happens in the database, inside the transaction that flips a release
 * to `released` (trigger deliver_will_on_release): it writes one in-app notice
 * per accepted keeper. RLS already opens the checklist to those keepers, so
 * that is the source of truth for delivery.
 *
 * This module sends the "your keeper checklist is ready" email (link only: no
 * service names, wishes or notes) for each pending notification and records
 * every attempt. A failed send leaves sent_at null with attempts + 1, so
 * pending_will_emails() returns it again for the next try (max 3). Idempotent:
 * a keeper whose email already went out is never returned.
 *
 * Call it only when the decision outcome was `released`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Mailer } from "@/lib/heartbeat/mailer";
import { buildWillDeliveredEmail } from "@/lib/email/templates/will-delivered";

type Db = SupabaseClient<Database>;

export interface WillDeliveryReport {
  sent: number;
  failed: number;
}

export async function sendWillDeliveryEmails(
  supabase: Db,
  mailer: Mailer,
  args: { releaseId: string; ownerName: string; appUrl: string }
): Promise<WillDeliveryReport> {
  const report: WillDeliveryReport = { sent: 0, failed: 0 };
  try {
    const { data: pending, error } = await supabase.rpc("pending_will_emails", {
      p_release_id: args.releaseId,
    });
    if (error) {
      console.error("[will/deliver] pending lookup failed:", error.message);
      return report;
    }
    const base = args.appUrl.replace(/\/$/, "");
    for (const p of pending ?? []) {
      const result = await mailer.send(
        buildWillDeliveredEmail({
          to: p.keeper_email,
          keeperName: p.keeper_name,
          ownerName: args.ownerName,
          willUrl: `${base}/keeper/release/${args.releaseId}/will`,
        })
      );
      const { error: recordError } = await supabase.rpc("record_will_email_attempt", {
        p_release_id: args.releaseId,
        p_keeper_id: p.keeper_id,
        p_ok: result.ok,
      });
      if (recordError) {
        console.error("[will/deliver] could not record attempt:", recordError.message);
      }
      if (result.ok) report.sent++;
      else {
        report.failed++;
        console.error("[will/deliver] email failed:", "will_delivered");
      }
    }
  } catch (err) {
    // The release is already committed; email is best-effort.
    console.error("[will/deliver] failed:", err instanceof Error ? err.message : "unknown");
  }
  return report;
}
