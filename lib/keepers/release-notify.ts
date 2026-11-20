/**
 * Release-pending fan-out (Spec 4, task 3.1): one calm email per accepted
 * keeper. Shared by the demo tick (Next.js) and the heartbeat-tick Edge Function
 * (Deno), so it imports with explicit `.ts` extensions and touches no runtime
 * API beyond the injected mailer. In-app inbox rows are written separately by
 * the SQL function notify_release_pending().
 */

import type { Mailer } from "../heartbeat/mailer.ts";
import { buildReleasePendingEmail } from "../email/templates/keepers.ts";

export interface ReleaseKeeperTarget {
  name: string;
  email: string;
}

export async function emailKeepersReleasePending(args: {
  mailer: Mailer;
  ownerName: string;
  lastCheckinLabel: string | null;
  releaseUrl: string;
  keepers: readonly ReleaseKeeperTarget[];
}): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const k of args.keepers) {
    const result = await args.mailer.send(
      buildReleasePendingEmail({
        to: k.email,
        keeperName: k.name,
        ownerName: args.ownerName,
        lastCheckinLabel: args.lastCheckinLabel,
        releaseUrl: args.releaseUrl,
      })
    );
    if (result.ok) sent++;
    else failed++;
  }
  return { sent, failed };
}
