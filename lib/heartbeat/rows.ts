/** Row → machine mapping shared by the app, the demo route and the Edge Function. */

import { isHeartbeatState, type HeartbeatMachine } from "./state-machine.ts";

export interface SettingsRowLike {
  state: string;
  next_checkin_due: string | Date;
  cadence_days: number;
  grace_days: number;
}

export function machineFromRows(args: {
  settings: SettingsRowLike;
  timeZone: string | null | undefined;
  lastCheckinAt: string | Date | null | undefined;
  requiredConfirmations?: number;
}): HeartbeatMachine {
  const { settings } = args;
  return {
    state: isHeartbeatState(settings.state) ? settings.state : "ALIVE",
    nextCheckinDue: new Date(settings.next_checkin_due),
    lastCheckinAt: args.lastCheckinAt ? new Date(args.lastCheckinAt) : null,
    cadenceDays: settings.cadence_days,
    graceDays: settings.grace_days,
    timeZone: args.timeZone || "Asia/Jakarta",
    requiredConfirmations: args.requiredConfirmations ?? 2,
    // Spec 4 supplies keeper decisions; Spec 3 never has any.
    confirmations: [],
    falseAlarmFlagged: false,
  };
}
