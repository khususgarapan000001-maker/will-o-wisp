"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { WishBadge } from "@/components/will/WishBadge";
import type { EditableWillItem } from "@/components/will/WillItemForm";
import { CATEGORY_LABELS, type WillItemData } from "@/lib/will/model";
import { openWillNote } from "@/lib/will/seal";

interface Props {
  item: WillItemData;
  ownerId: string;
  /** null while the vault is locked or missing: the note stays sealed. */
  dek: CryptoKey | null;
  /** Name of the transfer keeper, when known. */
  transferName: string | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Reordering is only meaningful on the unfiltered list. */
  reorderEnabled: boolean;
  onEdit: (item: EditableWillItem) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
}

type Note = { state: "none" } | { state: "sealed" } | { state: "failed" } | { state: "open"; text: string };

/** One account in the owner's checklist: name, category, wish, keeper, note. */
export function WillItemRow({
  item,
  ownerId,
  dek,
  transferName,
  canMoveUp,
  canMoveDown,
  reorderEnabled,
  onEdit,
  onDelete,
  onMove,
}: Props) {
  const hasNote = item.notes_ciphertext !== null && item.iv !== null;
  const [note, setNote] = useState<Note>(hasNote ? { state: "sealed" } : { state: "none" });

  useEffect(() => {
    let cancelled = false;
    if (!hasNote) {
      setNote({ state: "none" });
      return;
    }
    if (!dek) {
      setNote({ state: "sealed" });
      return;
    }
    openWillNote(dek, ownerId, item.id, item.notes_ciphertext as string, item.iv as string)
      .then((text) => {
        if (!cancelled) setNote({ state: "open", text });
      })
      .catch(() => {
        // Log the id only: never ciphertext, keys or plaintext.
        console.error("[WillItemRow] could not decrypt note", item.id);
        if (!cancelled) setNote({ state: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [dek, ownerId, item.id, item.notes_ciphertext, item.iv, hasNote]);

  return (
    <li className="rounded-xl border border-border bg-card p-4" data-testid="will-item">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-serif text-lg text-foreground">{item.service_name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {CATEGORY_LABELS[item.category]}
            {item.wish === "transfer" && ` · to ${transferName ?? "a keeper"}`}
          </p>
        </div>
        <WishBadge wish={item.wish} />
      </div>

      {note.state === "open" && (
        <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted/40 px-3 py-2 text-sm text-foreground">
          {note.text}
        </p>
      )}
      {note.state === "sealed" && (
        <p className="mt-2 text-xs text-muted-foreground">Has an encrypted note. Unlock your vault to read it.</p>
      )}
      {note.state === "failed" && (
        <p className="mt-2 text-xs text-destructive">Couldn&apos;t decrypt this note.</p>
      )}

      <div className="mt-3 flex flex-wrap gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onEdit({
              id: item.id,
              serviceName: item.service_name,
              category: item.category,
              wish: item.wish,
              transferKeeperId: item.transfer_to_keeper_id,
              notes: note.state === "open" ? note.text : "",
              hasNote,
            })
          }
        >
          {item.wish === null ? "Set a wish" : "Edit"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => onDelete(item.id)}
        >
          Delete
        </Button>
        {reorderEnabled && (
          <>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Move ${item.service_name} up`}
              disabled={!canMoveUp}
              onClick={() => onMove(item.id, "up")}
            >
              ↑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Move ${item.service_name} down`}
              disabled={!canMoveDown}
              onClick={() => onMove(item.id, "down")}
            >
              ↓
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
