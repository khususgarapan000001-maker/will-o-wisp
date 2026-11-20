/**
 * Decides which keepers need their DEK (re)wrapped, and prunes entries for
 * keepers who are no longer accepted. Pure, so it is unit-tested; the owner's
 * browser performs the actual crypto (lib/crypto/keeper-keys.ts) and stores the
 * result through updateWrappedDeksAction — the same seam the vault already uses.
 */

export interface StoredEntryLike {
  keeper_id?: unknown;
  /** Copy of the public key the DEK was wrapped for; a changed key means re-wrap. */
  keeper_public_key?: unknown;
}

export interface WrapTarget {
  id: string;
  publicKeyB64: string;
}

export interface WrapPlan {
  /** Entries to keep untouched. */
  keep: unknown[];
  /** Keepers that need a fresh wrap. */
  toWrap: WrapTarget[];
}

export function planKeeperWraps(entries: readonly unknown[], targets: readonly WrapTarget[]): WrapPlan {
  const byId = new Map(targets.map((t) => [t.id, t]));
  const keep: unknown[] = [];
  const have = new Set<string>();

  for (const raw of entries) {
    const e = (raw ?? {}) as StoredEntryLike;
    const id = typeof e.keeper_id === "string" ? e.keeper_id : null;
    const target = id ? byId.get(id) : undefined;
    // Drop entries for keepers who are gone (revoked/declined) or whose key changed.
    if (!id || !target) continue;
    if (e.keeper_public_key !== target.publicKeyB64) continue;
    if (have.has(id)) continue;
    keep.push(raw);
    have.add(id);
  }
  return { keep, toWrap: targets.filter((t) => !have.has(t.id)) };
}
