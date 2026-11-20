"use client";

/**
 * Post-release digital will for a keeper (read-only). Service names, wishes and
 * transfer assignments are plaintext and render immediately. Encrypted notes
 * are decrypted in THIS browser with the same flow as the vault and letters
 * views: the keeper's non-extractable private key (IndexedDB) unwraps the DEK,
 * then lib/will/seal opens each note (AAD = owner_id || will_item_id). One note
 * failing to open never hides the rest of the checklist.
 */

import { useEffect, useState } from "react";
import { WishBadge } from "@/components/will/WishBadge";
import { loadKeeperPrivateKey } from "@/lib/crypto/keeper-store";
import { unwrapDekForKeeper, type WrappedDekForKeeper } from "@/lib/crypto/keeper-keys";
import { openWillNote } from "@/lib/will/seal";
import { groupByCategory } from "@/lib/will/grouping";
import { CATEGORY_LABELS, type WillItemData } from "@/lib/will/model";

export interface TransferKeeper {
  keeper_id: string;
  keeper_name: string;
  available: boolean;
}

interface Props {
  ownerId: string;
  ownerName: string;
  keeperId: string;
  entry: WrappedDekForKeeper | null;
  items: WillItemData[];
  transferKeepers: TransferKeeper[];
}

export const NOTE_FAILED_MESSAGE = "Couldn't decrypt this note";

type NoteState =
  | { phase: "loading" }
  | { phase: "no_entry" }
  | { phase: "no_key" }
  | { phase: "error" }
  | { phase: "ready"; notes: Record<string, string | null> }; // null = failed to decrypt

export function KeeperWillView({ ownerId, ownerName, keeperId, entry, items, transferKeepers }: Props) {
  const withNotes = items.filter((i) => i.notes_ciphertext !== null && i.iv !== null);
  const [notes, setNotes] = useState<NoteState>(
    withNotes.length === 0 ? { phase: "ready", notes: {} } : { phase: "loading" }
  );

  useEffect(() => {
    let cancelled = false;
    async function open() {
      const sealed = items.filter((i) => i.notes_ciphertext !== null && i.iv !== null);
      if (sealed.length === 0) {
        setNotes({ phase: "ready", notes: {} });
        return;
      }
      if (!entry) {
        setNotes({ phase: "no_entry" });
        return;
      }
      try {
        const privateKey = await loadKeeperPrivateKey(keeperId);
        if (!privateKey) {
          if (!cancelled) setNotes({ phase: "no_key" });
          return;
        }
        const dek = await unwrapDekForKeeper(entry, privateKey);
        const opened: Record<string, string | null> = {};
        for (const i of sealed) {
          try {
            opened[i.id] = await openWillNote(dek, ownerId, i.id, i.notes_ciphertext as string, i.iv as string);
          } catch {
            // Log the id only: never ciphertext, keys or plaintext.
            console.error("[KeeperWillView] could not decrypt note", i.id);
            opened[i.id] = null;
          }
        }
        if (!cancelled) setNotes({ phase: "ready", notes: opened });
      } catch (err) {
        console.error("[KeeperWillView] could not open notes:", err instanceof Error ? err.name : "error");
        if (!cancelled) setNotes({ phase: "error" });
      }
    }
    void open();
    return () => {
      cancelled = true;
    };
  }, [entry, items, keeperId, ownerId]);

  const keeperById = new Map(transferKeepers.map((k) => [k.keeper_id, k]));
  const groups = groupByCategory(items);
  const mine = items.filter((i) => i.wish === "transfer" && i.transfer_to_keeper_id === keeperId).length;

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-10 text-center">
        <p className="text-muted-foreground">{ownerName} didn&apos;t list any accounts.</p>
      </div>
    );
  }

  return (
    <div>
      {mine > 0 && (
        <p role="status" className="mb-6 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
          {mine === 1
            ? `${ownerName} asked for 1 account to be transferred to you.`
            : `${ownerName} asked for ${mine} accounts to be transferred to you.`}
        </p>
      )}
      {notes.phase === "no_entry" && (
        <p role="status" className="mb-6 text-sm text-foreground">
          {ownerName} hadn&apos;t prepared access for you before the release, so private notes can&apos;t be
          opened on this device. The rest of the list is below.
        </p>
      )}
      {notes.phase === "no_key" && (
        <p role="status" className="mb-6 text-sm text-foreground">
          This device doesn&apos;t hold your key, so private notes can&apos;t be opened here. Your key is created
          on the device where you accepted the invitation. The rest of the list is below.
        </p>
      )}
      {notes.phase === "error" && (
        <p role="alert" className="mb-6 text-sm text-destructive">
          We couldn&apos;t open the private notes just now. The rest of the list is below.
        </p>
      )}

      <div className="flex flex-col gap-8">
        {groups.map((g) => (
          <section key={g.category} aria-label={CATEGORY_LABELS[g.category]}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              {CATEGORY_LABELS[g.category]}
            </h2>
            <ul className="flex flex-col gap-3">
              {g.items.map((item) => {
                const target = item.transfer_to_keeper_id ? keeperById.get(item.transfer_to_keeper_id) : undefined;
                const isMine = item.wish === "transfer" && item.transfer_to_keeper_id === keeperId;
                const gone = item.wish === "transfer" && !isMine && target?.available === false;
                const hasNote = item.notes_ciphertext !== null;
                const note = notes.phase === "ready" ? notes.notes[item.id] : undefined;
                return (
                  <li
                    key={item.id}
                    data-testid="keeper-will-item"
                    data-mine={isMine ? "true" : undefined}
                    className={`rounded-xl border p-4 ${
                      isMine ? "border-primary bg-primary/10" : "border-border bg-card"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 truncate font-serif text-lg text-foreground">{item.service_name}</p>
                      <WishBadge wish={item.wish} />
                    </div>
                    {item.wish === "transfer" && (
                      <p className="mt-1 text-sm text-foreground">
                        {isMine ? "For you to take over." : `To be transferred to ${target?.keeper_name ?? "a keeper"}.`}
                        {gone && (
                          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            Keeper no longer available
                          </span>
                        )}
                      </p>
                    )}
                    {gone && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        You may want to decide together who looks after this one.
                      </p>
                    )}
                    {hasNote && note === null && (
                      <p role="alert" className="mt-2 text-sm text-destructive">
                        {NOTE_FAILED_MESSAGE}
                      </p>
                    )}
                    {hasNote && typeof note === "string" && (
                      <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted/40 px-3 py-2 text-sm text-foreground">
                        {note}
                      </p>
                    )}
                    {hasNote && notes.phase === "loading" && <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-muted" />}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
