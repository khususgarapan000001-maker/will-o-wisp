/**
 * Letter delivery, step 2 of 2.
 *
 * Step 1 happens in the database, inside the transaction that flips a release
 * to `released` (trigger deliver_letters_on_release): it sets delivered_at on
 * eligible letters and writes each keeper's in-app notification. THAT is the
 * source of truth for delivery.
 *
 * This module sends the "a letter was left for you" email (link only) for each
 * pending notification, and records every attempt. If the provider fails, the
 * letter stays delivered and the notification keeps sent_at = null with
 * attempts + 1, so pending_letter_emails() returns it again for the next try
 * (max 3 attempts). It is idempotent: a keeper whose email already went out is
 * never returned, so calling it twice cannot send twice.
 *
 * Call it only when the decision outcome was `released`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Mailer } from "@/lib/heartbeat/mailer";
import { buildLetterDeliveredEmail } from "@/lib/email/templates/letter-delivered";

type Db = SupabaseClient<Database>;

export interface DeliveryReport {
  sent: number;
  failed: number;
}

export async function sendLetterDeliveryEmails(
  supabase: Db,
  mailer: Mailer,
  args: { releaseId: string; ownerName: string; appUrl: string }
): Promise<DeliveryReport> {
  const report: DeliveryReport = { sent: 0, failed: 0 };
  try {
    const { data: pending, error } = await supabase.rpc("pending_letter_emails", {
      p_release_id: args.releaseId,
    });
    if (error) {
      console.error("[letters/deliver] pending lookup failed:", error.message);
      return report;
    }
    const base = args.appUrl.replace(/\/$/, "");
    for (const p of pending ?? []) {
      if (p.letter_count < 1) continue;
      const result = await mailer.send(
        buildLetterDeliveredEmail({
          to: p.keeper_email,
          keeperName: p.keeper_name,
          ownerName: args.ownerName,
          letterCount: p.letter_count,
          lettersUrl: `${base}/keeper/release/${args.releaseId}/letters`,
        })
      );
      const { error: recordError } = await supabase.rpc("record_letter_email_attempt", {
        p_release_id: args.releaseId,
        p_keeper_id: p.keeper_id,
        p_ok: result.ok,
      });
      if (recordError) {
        console.error("[letters/deliver] could not record attempt:", recordError.message);
      }
      if (result.ok) report.sent++;
      else {
        report.failed++;
        console.error("[letters/deliver] email failed:", "letter_delivered");
      }
    }
  } catch (err) {
    // The release and delivered_at are already committed; email is best-effort.
    console.error("[letters/deliver] failed:", err instanceof Error ? err.message : "unknown");
  }
  return report;
}
