import { decideClaim, type ClaimDecision } from "@/lib/heartbeat/reminders";
import type { PlannedReminder } from "@/lib/heartbeat/cadence";
import type { HeartbeatMachine } from "@/lib/heartbeat/state-machine";
import type { TickStore } from "@/lib/heartbeat/tick";

/** In-memory store: the reference implementation of the claim semantics. */
export class MemoryTickStore implements TickStore {
  machines = new Map<string, HeartbeatMachine>();
  releases: { ownerId: string; triggeredAt: Date; required: number }[] = [];
  notifications = new Map<string, { sentAt: Date | null; attempts: number; delivery?: string }>();

  private key(ownerId: string, r: PlannedReminder): string {
    return `${ownerId}|${r.kind}|${r.dueDate}`;
  }

  async saveMachine(ownerId: string, machine: HeartbeatMachine): Promise<void> {
    this.machines.set(ownerId, machine);
  }

  async openRelease(ownerId: string, triggeredAt: Date, required: number): Promise<void> {
    this.releases.push({ ownerId, triggeredAt, required });
  }

  async claimNotification(ownerId: string, r: PlannedReminder): Promise<ClaimDecision> {
    const k = this.key(ownerId, r);
    const existing = this.notifications.get(k) ?? null;
    const decision = decideClaim(existing);
    if (decision === "insert_and_send") {
      this.notifications.set(k, { sentAt: null, attempts: 1 });
    } else if (decision === "retry" && existing) {
      existing.attempts += 1;
    }
    return decision;
  }

  async finishNotification(
    ownerId: string,
    r: PlannedReminder,
    result: { sent: boolean; delivery: string; at: Date }
  ): Promise<void> {
    const row = this.notifications.get(this.key(ownerId, r));
    if (row && result.sent) {
      row.sentAt = result.at;
      row.delivery = result.delivery;
    }
  }
}
