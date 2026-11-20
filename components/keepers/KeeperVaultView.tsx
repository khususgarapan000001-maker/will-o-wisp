"use client";

/**
 * Post-release vault view for a keeper. Everything is decrypted in this browser:
 * the keeper's non-extractable private key (IndexedDB) unwraps the DEK, and the
 * existing decrypt module (AAD = owner_id || item_id) opens each item. The
 * server only ever sees ciphertext.
 */

import { useEffect, useState } from "react";
import { loadKeeperPrivateKey } from "@/lib/crypto/keeper-store";
import { unwrapDekForKeeper, type WrappedDekForKeeper } from "@/lib/crypto/keeper-keys";
import { decryptItem } from "@/lib/crypto/decrypt";

export interface KeeperVaultItem {
  id: string;
  kind: string;
  payload_ciphertext: string;
  iv: string;
}

interface Props {
  ownerId: string;
  ownerName: string;
  keeperId: string;
  entry: WrappedDekForKeeper | null;
  items: KeeperVaultItem[];
}

type Opened =
  | { id: string; kind: string; title: string; body: string }
  | { id: string; kind: string; failed: true };

const KIND_LABEL: Record<string, string> = {
  message: "Message",
  credential_pointer: "Credential pointer",
  instruction: "Instruction",
};

type State =
  | { phase: "loading" }
  | { phase: "no_entry" }
  | { phase: "no_key" }
  | { phase: "error" }
  | { phase: "ready"; opened: Opened[] };

export function KeeperVaultView({ ownerId, ownerName, keeperId, entry, items }: Props) {
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function open() {
      if (!entry) {
        setState({ phase: "no_entry" });
        return;
      }
      try {
        const privateKey = await loadKeeperPrivateKey(keeperId);
        if (!privateKey) {
          if (!cancelled) setState({ phase: "no_key" });
          return;
        }
        const dek = await unwrapDekForKeeper(entry, privateKey);
        const opened: Opened[] = [];
        for (const item of items) {
          try {
            const plain = await decryptItem(dek, ownerId, item.id, item.payload_ciphertext, item.iv);
            const parsed = JSON.parse(plain) as { title?: string; body?: string };
            opened.push({
              id: item.id,
              kind: item.kind,
              title: parsed.title ?? "Untitled",
              body: parsed.body ?? "",
            });
          } catch {
            opened.push({ id: item.id, kind: item.kind, failed: true });
          }
        }
        if (!cancelled) setState({ phase: "ready", opened });
      } catch (err) {
        console.error("[KeeperVaultView] could not open vault:", err);
        if (!cancelled) setState({ phase: "error" });
      }
    }
    void open();
    return () => {
      cancelled = true;
    };
  }, [entry, items, keeperId, ownerId]);

  if (state.phase === "loading") {
    return <p className="text-sm text-muted-foreground">Opening what {ownerName} left for you…</p>;
  }
  if (state.phase === "no_entry") {
    return (
      <p role="status" className="text-sm text-foreground">
        {ownerName} hadn&apos;t prepared vault access for you before the release, so there is
        nothing to open here. Their letters and wishes may still be available.
      </p>
    );
  }
  if (state.phase === "no_key") {
    return (
      <p role="status" className="text-sm text-foreground">
        This device doesn&apos;t hold your key. Your key is created on the device where you
        accepted the invitation, so please open this page there.
      </p>
    );
  }
  if (state.phase === "error") {
    return (
      <p role="alert" className="text-sm text-destructive">
        We couldn&apos;t open the vault just now. Please try again in a moment.
      </p>
    );
  }
  if (state.opened.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-10 text-center">
        <p className="text-muted-foreground">Nothing was left in the vault for you.</p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {state.opened.map((o) => (
        <li key={o.id} className="rounded-xl border border-border bg-card p-4">
          {"failed" in o ? (
            <p className="text-sm text-destructive">This item couldn&apos;t be opened.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{KIND_LABEL[o.kind] ?? o.kind}</p>
              <p className="mt-1 font-medium text-foreground">{o.title}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{o.body}</p>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
