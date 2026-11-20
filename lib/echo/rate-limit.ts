/**
 * Per-owner daily draft limit (5/day). In-memory and per server instance: it
 * bounds cost and abuse but resets on a cold start. A DB-backed counter is a
 * possible later hardening.
 */

export const DAILY_DRAFT_LIMIT = 5;

export interface RateLimiter {
  /** Records an attempt. Returns false (and records nothing) when over the limit. */
  tryConsume(ownerId: string, now?: Date): boolean;
  remaining(ownerId: string, now?: Date): number;
}

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10); // UTC day
}

export function createRateLimiter(limit: number = DAILY_DRAFT_LIMIT): RateLimiter {
  const counts = new Map<string, { day: string; n: number }>();
  const current = (ownerId: string, now: Date) => {
    const day = dayKey(now);
    const entry = counts.get(ownerId);
    if (!entry || entry.day !== day) {
      const fresh = { day, n: 0 };
      counts.set(ownerId, fresh);
      // Drop other owners' stale days so the map cannot grow without bound.
      for (const [k, v] of counts) if (v.day !== day) counts.delete(k);
      return fresh;
    }
    return entry;
  };
  return {
    tryConsume(ownerId, now = new Date()) {
      const e = current(ownerId, now);
      if (e.n >= limit) return false;
      e.n += 1;
      return true;
    },
    remaining(ownerId, now = new Date()) {
      return Math.max(0, limit - current(ownerId, now).n);
    },
  };
}

export const echoRateLimiter = createRateLimiter();
