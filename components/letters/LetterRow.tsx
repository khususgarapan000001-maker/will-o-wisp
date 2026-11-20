"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { LetterCard } from "@/components/letters/LetterCard";
import { openLetter } from "@/lib/letters/seal";
import { formatLetterDate } from "@/lib/letters/format";
import { DELIVERED_LETTER_MESSAGE } from "@/lib/letters/api-errors";
import type { EditableLetter } from "@/components/letters/LetterEditor";
import type { LetterStatus } from "@/lib/supabase/types";

export interface LetterRowData {
  id: string;
  recipient_keeper_id: string;
  payload_ciphertext: string;
  iv: string;
  ai_assisted: boolean;
  status: LetterStatus;
  delivered_at: string | null;
  created_at: string;
}

interface Props {
  letter: LetterRowData;
  ownerId: string;
  ownerName: string;
  dek: CryptoKey;
  recipientName: string;
  onEdit: (letter: EditableLetter) => void;
  onDelete: (id: string) => void;
}

type Opened = { subject: string; body: string } | "failed" | null;

/** One letter in the owner's list. Opens in the browser; preview = keeper's view. */
export function LetterRow({ letter, ownerId, ownerName, dek, recipientName, onEdit, onDelete }: Props) {
  const [opened, setOpened] = useState<Opened>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    let cancelled = false;
    openLetter(dek, ownerId, letter.id, letter.payload_ciphertext, letter.iv)
      .then((d) => {
        if (!cancelled) setOpened(d);
      })
      .catch(() => {
        console.error("[LetterRow] could not decrypt letter", letter.id);
        if (!cancelled) setOpened("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [dek, ownerId, letter]);

  const delivered = letter.delivered_at !== null;

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      {opened === "failed" ? (
        <p className="text-sm text-destructive">This letter couldn&apos;t be opened.</p>
      ) : opened === null ? (
        <div className="h-5 w-1/2 animate-pulse rounded bg-muted" />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-serif text-lg text-foreground">{opened.subject}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                For {recipientName} · written {formatLetterDate(letter.created_at)}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <span
                className={`rounded-full px-2 py-0.5 ${
                  letter.status === "final" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                {letter.status === "final" ? "Ready to deliver" : "Draft"}
              </span>
              {delivered && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">Delivered</span>
              )}
              {letter.ai_assisted && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">AI-assisted</span>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1">
            <Button variant="ghost" size="sm" onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? "Hide" : "Read as your keeper will"}
            </Button>
            {!delivered && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onEdit({
                      id: letter.id,
                      subject: opened.subject,
                      body: opened.body,
                      recipientKeeperId: letter.recipient_keeper_id,
                      status: letter.status,
                      aiAssisted: letter.ai_assisted,
                      writtenAt: letter.created_at,
                    })
                  }
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onDelete(letter.id)}
                >
                  Delete
                </Button>
              </>
            )}
          </div>
          {delivered && (
            <p className="mt-2 text-xs text-muted-foreground">{DELIVERED_LETTER_MESSAGE}</p>
          )}

          {showPreview && (
            <div className="mt-4">
              <LetterCard
                ownerName={ownerName}
                writtenAt={letter.created_at}
                subject={opened.subject}
                body={opened.body}
                aiAssisted={letter.ai_assisted}
              />
            </div>
          )}
        </>
      )}
    </li>
  );
}
