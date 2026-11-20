"use client";

/**
 * Post-release letters for a keeper. Decrypted in THIS browser, with the same
 * flow as the keeper vault view: the keeper's non-extractable private key
 * (IndexedDB) unwraps the DEK, then lib/letters/seal opens each letter (AAD =
 * owner_id || letter_id). The server only ever sees ciphertext.
 */

import { useEffect, useState } from "react";
import { LetterCard } from "@/components/letters/LetterCard";
import { loadKeeperPrivateKey } from "@/lib/crypto/keeper-store";
import { unwrapDekForKeeper, type WrappedDekForKeeper } from "@/lib/crypto/keeper-keys";
import { openLetter } from "@/lib/letters/seal";

export interface KeeperLetter {
  id: string;
  payload_ciphertext: string;
  iv: string;
  ai_assisted: boolean;
  created_at: string;
}

interface Props {
  ownerId: string;
  ownerName: string;
  keeperId: string;
  entry: WrappedDekForKeeper | null;
  letters: KeeperLetter[];
}

type Opened =
  | { id: string; subject: string; body: string; aiAssisted: boolean; writtenAt: string }
  | { id: string; failed: true };

type State =
  | { phase: "loading" }
  | { phase: "no_entry" }
  | { phase: "no_key" }
  | { phase: "error" }
  | { phase: "ready"; opened: Opened[] };

export const LETTER_FAILED_MESSAGE =
  "This letter couldn't be opened — please contact support.";

export function KeeperLettersView({ ownerId, ownerName, keeperId, entry, letters }: Props) {
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function open() {
      if (letters.length === 0) {
        setState({ phase: "ready", opened: [] });
        return;
      }
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
        for (const l of letters) {
          try {
            const d = await openLetter(dek, ownerId, l.id, l.payload_ciphertext, l.iv);
            opened.push({
              id: l.id,
              subject: d.subject,
              body: d.body,
              aiAssisted: l.ai_assisted,
              writtenAt: l.created_at,
            });
          } catch {
            // Log the id only: never ciphertext, keys or plaintext.
            console.error("[KeeperLettersView] could not decrypt delivered letter", l.id);
            opened.push({ id: l.id, failed: true });
          }
        }
        if (!cancelled) setState({ phase: "ready", opened });
      } catch (err) {
        console.error("[KeeperLettersView] could not open letters:", err instanceof Error ? err.name : "error");
        if (!cancelled) setState({ phase: "error" });
      }
    }
    void open();
    return () => {
      cancelled = true;
    };
  }, [entry, letters, keeperId, ownerId]);

  if (state.phase === "loading") {
    return <p className="text-sm text-muted-foreground">Opening what {ownerName} wrote for you…</p>;
  }
  if (state.phase === "no_entry") {
    return (
      <p role="status" className="text-sm text-foreground">
        {ownerName} hadn&apos;t prepared access for you before the release, so these letters can&apos;t
        be opened on this device.
      </p>
    );
  }
  if (state.phase === "no_key") {
    return (
      <p role="status" className="text-sm text-foreground">
        This device doesn&apos;t hold your key. Your key is created on the device where you accepted
        the invitation, so please open this page there.
      </p>
    );
  }
  if (state.phase === "error") {
    return (
      <p role="alert" className="text-sm text-destructive">
        We couldn&apos;t open the letters just now. Please try again in a moment.
      </p>
    );
  }
  if (state.opened.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-10 text-center">
        <p className="text-muted-foreground">{ownerName} didn&apos;t leave a letter for you.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Their vault and wishes may still hold something for you.
        </p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-8">
      {state.opened.map((o) => (
        <li key={o.id}>
          {"failed" in o ? (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {LETTER_FAILED_MESSAGE}
            </p>
          ) : (
            <LetterCard
              ownerName={ownerName}
              writtenAt={o.writtenAt}
              subject={o.subject}
              body={o.body}
              aiAssisted={o.aiAssisted}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
