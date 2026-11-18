"use client";

import { useState, useTransition, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { encryptItem } from "@/lib/crypto/encrypt";
import { decryptItem } from "@/lib/crypto/decrypt";
import { createVaultItemAction, updateVaultItemAction } from "@/lib/vault/actions";
import type { VaultItemData } from "./VaultItemCard";

type ItemKind = "message" | "credential_pointer" | "instruction";

const KIND_OPTIONS: { value: ItemKind; label: string; icon: string; placeholder: { title: string; body: string } }[] = [
  {
    value: "message",
    label: "Message",
    icon: "✉",
    placeholder: {
      title: "e.g. To my family",
      body: "Write what you want your keepers to know…",
    },
  },
  {
    value: "credential_pointer",
    label: "Credential pointer",
    icon: "🔑",
    placeholder: {
      title: "e.g. Email account",
      body: "e.g. The login details are in the green notebook on my desk…",
    },
  },
  {
    value: "instruction",
    label: "Instruction",
    icon: "📋",
    placeholder: {
      title: "e.g. Cancel subscriptions",
      body: "e.g. Contact Netflix at help.netflix.com to close the account…",
    },
  },
];

interface VaultEditorProps {
  vaultId: string;
  ownerId: string;
  dek: CryptoKey;
  /** If set, we're editing an existing item. */
  editingItem?: VaultItemData | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function VaultEditor({
  vaultId,
  ownerId,
  dek,
  editingItem,
  onSaved,
  onCancel,
}: VaultEditorProps) {
  const [kind, setKind] = useState<ItemKind>("message");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isEditing = editingItem !== null && editingItem !== undefined;

  // Decrypt existing values when editing.
  useEffect(() => {
    if (!isEditing || !editingItem) return;
    setKind(editingItem.kind as ItemKind);

    async function decryptFields() {
      if (!editingItem) return;
      try {
        const combined = await decryptItem(
          dek,
          ownerId,
          editingItem.id,
          editingItem.payload_ciphertext,
          editingItem.iv
        );
        const parsed = JSON.parse(combined) as { title: string; body: string };
        setTitle(parsed.title ?? combined);
        setBody(parsed.body ?? "");
      } catch {
        setServerError("Could not decrypt the existing item. Please try again.");
      }
    }
    void decryptFields();
  }, [editingItem, dek, ownerId, isEditing]);

  const selectedKind = KIND_OPTIONS.find((k) => k.value === kind) ?? KIND_OPTIONS[0];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTitleError(null);
    setServerError(null);

    if (!title.trim()) {
      setTitleError("Title is required.");
      return;
    }

    startTransition(async () => {
      try {
        // Generate a stable item ID client-side so AAD can bind before insert.
        const itemId = isEditing ? editingItem!.id : globalThis.crypto.randomUUID();

        // Encrypt the title and body as a single JSON payload under one fresh IV.
        // This guarantees the IV is used only once with this key, satisfying
        // AES-GCM's uniqueness requirement.
        const payloadPlaintext = JSON.stringify({ title: title.trim(), body });

        const enc = await encryptItem(dek, ownerId, itemId, payloadPlaintext);

        const payload = {
          id: itemId,
          vaultId,
          kind,
          payloadCiphertext: enc.ciphertext,
          iv: enc.iv,
          recipientKeeperId: null,
          sortOrder: 0,
        };

        const result = isEditing
          ? await updateVaultItemAction(payload)
          : await createVaultItemAction(payload);

        if (result.error) {
          setServerError(result.error);
        } else {
          onSaved();
        }
      } catch {
        setServerError("Could not save the item. Please try again.");
      }
    });
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="font-serif text-lg">
          {isEditing ? "Edit item" : "New vault item"}
        </CardTitle>
        <CardDescription>
          Everything is encrypted in your browser before it reaches our servers.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {serverError && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {serverError}
            </p>
          )}

          {/* Kind picker */}
          <div className="flex flex-col gap-1.5">
            <Label>Type</Label>
            <div className="flex flex-wrap gap-2">
              {KIND_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setKind(opt.value)}
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    kind === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input hover:bg-accent/50"
                  }`}
                >
                  <span aria-hidden>{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Credential pointer reminder */}
          {kind === "credential_pointer" && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
              Store a pointer or hint, not the live password itself.
            </div>
          )}

          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-title">Title</Label>
            <Input
              id="item-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={selectedKind.placeholder.title}
              aria-invalid={!!titleError}
              disabled={isPending}
            />
            {titleError && (
              <p className="text-sm text-destructive">{titleError}</p>
            )}
          </div>

          {/* Body */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-body">Content</Label>
            <textarea
              id="item-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={selectedKind.placeholder.body}
              rows={5}
              disabled={isPending}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Recipient keeper — keepers arrive in Spec 4, so for now every
              item goes to all keepers. The picker is shown disabled so the
              intent is visible rather than silently absent. */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-recipient">Visible to after release</Label>
            <select
              id="item-recipient"
              disabled
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option>All keepers</option>
            </select>
            <p className="text-xs text-muted-foreground">
              No keepers yet — invite keepers to assign items to a specific person.
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" type="button" onClick={onCancel} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isPending}>
              {isPending ? "Saving…" : isEditing ? "Save changes" : "Add item"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
