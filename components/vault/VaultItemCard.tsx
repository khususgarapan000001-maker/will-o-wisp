"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { decryptItem, DecryptError } from "@/lib/crypto/decrypt";

// Kind icons (text emoji — no icon lib needed).
const KIND_ICON: Record<string, string> = {
  message: "✉",
  credential_pointer: "🔑",
  instruction: "📋",
};

const KIND_LABEL: Record<string, string> = {
  message: "Message",
  credential_pointer: "Credential pointer",
  instruction: "Instruction",
};

export interface VaultItemData {
  id: string;
  vault_id: string;
  kind: string;
  /** Combined JSON payload {title, body} encrypted under one IV. */
  payload_ciphertext: string;
  iv: string;
  recipient_keeper_id: string | null;
}

interface VaultItemCardProps {
  item: VaultItemData;
  ownerId: string;
  dek: CryptoKey;
  onEdit: (item: VaultItemData) => void;
  onDelete: (id: string) => void;
}

export function VaultItemCard({ item, ownerId, dek, onEdit, onDelete }: VaultItemCardProps) {
  const [title, setTitle] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [decryptFailed, setDecryptFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function decrypt() {
      try {
        // payload_ciphertext holds the combined JSON payload { title, body }.
        const combined = await decryptItem(
          dek,
          ownerId,
          item.id,
          item.payload_ciphertext,
          item.iv
        );
        const parsed = JSON.parse(combined) as { title: string; body: string };
        if (!cancelled) {
          setTitle(parsed.title ?? combined);
          setBody(parsed.body ?? "");
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof DecryptError) {
            setDecryptFailed(true);
          } else {
            console.error("[VaultItemCard] unexpected decrypt error:", err);
            setDecryptFailed(true);
          }
        }
      }
    }
    void decrypt();
    return () => { cancelled = true; };
  }, [dek, item, ownerId]);

  if (decryptFailed) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-sm text-destructive">
            This item couldn&apos;t be decrypted
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            The data may be corrupted or encrypted with a different passphrase.
          </p>
        </CardContent>
      </Card>
    );
  }

  const icon = KIND_ICON[item.kind] ?? "◆";
  const kindLabel = KIND_LABEL[item.kind] ?? item.kind;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span aria-hidden className="text-base shrink-0">{icon}</span>
            <CardTitle className="truncate text-sm">
              {title ?? <span className="animate-pulse text-muted-foreground">Decrypting…</span>}
            </CardTitle>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(item)}
              aria-label="Edit item"
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => onDelete(item.id)}
              aria-label="Delete item"
            >
              Delete
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{kindLabel}</span>
          {item.recipient_keeper_id && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
              Specific keeper
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {body !== null && (
          <div>
            <p className={`text-sm text-foreground whitespace-pre-wrap ${!expanded ? "line-clamp-3" : ""}`}>
              {body}
            </p>
            {body.length > 150 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 text-xs text-primary hover:underline"
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        )}
        {body === null && !decryptFailed && (
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
        )}
      </CardContent>
    </Card>
  );
}
