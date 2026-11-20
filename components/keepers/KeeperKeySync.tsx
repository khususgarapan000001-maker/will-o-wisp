"use client";

/**
 * Wraps the vault DEK for every accepted keeper who has uploaded a public key
 * (design-doc §5.3), using the owner's already-unlocked vault. This is the
 * existing seam: the DEK lives in lib/crypto/session.ts, the result is stored
 * with updateWrappedDeksAction. There is no second unlock path; when the vault
 * is locked this component says so and links to the vault page.
 *
 * Each wrap uses a fresh ephemeral ECDH key and HKDF salt (see keeper-keys.ts);
 * no AES-GCM IV is involved, so the one-IV-per-ciphertext rule is untouched.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDek } from "@/lib/crypto/session";
import { wrapDekForKeeper } from "@/lib/crypto/keeper-keys";
import { getKeeperWrapStateAction } from "@/lib/keepers/actions";
import { updateWrappedDeksAction } from "@/lib/vault/actions";
import { planKeeperWraps } from "@/lib/keepers/wrap-sync";
import type { Json } from "@/lib/supabase/types";

type Status = "idle" | "locked" | "working" | "done" | "error";

export function KeeperKeySync({ trigger = 0 }: { trigger?: number }) {
  const [status, setStatus] = useState<Status>("idle");
  const [wrapped, setWrapped] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const dek = getDek();
      if (!dek) {
        if (!cancelled) setStatus("locked");
        return;
      }
      try {
        const state = await getKeeperWrapStateAction();
        if (!state) return;
        const plan = planKeeperWraps(state.entries, state.targets);
        const pruned = plan.keep.length !== state.entries.length;
        if (plan.toWrap.length === 0 && !pruned) {
          if (!cancelled) setStatus("idle");
          return;
        }
        if (!cancelled) setStatus("working");
        const fresh: Json[] = [];
        for (const t of plan.toWrap) {
          const entry = await wrapDekForKeeper(dek, t.id, t.publicKeyB64);
          fresh.push({ ...entry, keeper_public_key: t.publicKeyB64 });
        }
        const result = await updateWrappedDeksAction({
          vaultId: state.vaultId,
          wrappedDeksJson: [...(plan.keep as Json[]), ...fresh],
        });
        if (cancelled) return;
        if (result.error) {
          setStatus("error");
        } else {
          setWrapped(fresh.length);
          setStatus(fresh.length > 0 ? "done" : "idle");
        }
      } catch (err) {
        console.error("[KeeperKeySync] failed:", err);
        if (!cancelled) setStatus("error");
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [trigger]);

  if (status === "locked") {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
        To give a newly accepted keeper access, unlock your vault once.{" "}
        <Link href="/app/vault" className="text-primary underline-offset-4 hover:underline">
          Open the vault
        </Link>
      </p>
    );
  }
  if (status === "working") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Preparing your keepers&apos; access…
      </p>
    );
  }
  if (status === "done") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Access prepared for {wrapped} keeper{wrapped === 1 ? "" : "s"}. They can read it only
        after a confirmed release.
      </p>
    );
  }
  if (status === "error") {
    return (
      <p role="alert" className="text-sm text-destructive">
        We couldn&apos;t prepare your keepers&apos; access just now. Reopen this page to try again.
      </p>
    );
  }
  return null;
}
