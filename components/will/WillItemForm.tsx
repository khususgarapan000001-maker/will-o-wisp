"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { WillCategory, WillWish } from "@/lib/supabase/types";
import { CATEGORIES, CATEGORY_LABELS, NO_WISH_LABEL, WISHES, WISH_META } from "@/lib/will/model";
import { SERVICE_SUGGESTIONS, suggestCategory } from "@/lib/will/suggestions";
import { sealWillNote } from "@/lib/will/seal";
import {
  checkWillCap,
  checkWillDraft,
  MAX_NOTE_CHARS,
  MAX_WILL_ITEMS,
} from "@/lib/will/validation";

export interface FormKeeper {
  id: string;
  name: string;
}

export interface EditableWillItem {
  id: string;
  serviceName: string;
  category: WillCategory;
  wish: WillWish | null;
  transferKeeperId: string | null;
  /** The decrypted note ("" = none). Only known while the vault is unlocked. */
  notes: string;
  hasNote: boolean;
}

interface Props {
  ownerId: string;
  /** null while the vault is locked or does not exist: notes cannot be sealed or opened. */
  dek: CryptoKey | null;
  /** Accepted keepers only: the only valid transfer targets. */
  keepers: FormKeeper[];
  itemCount: number;
  editing?: EditableWillItem | null;
  onSaved: () => void;
  onCancel: () => void;
}

/**
 * Add / edit one account. The service name, category, wish and transfer target
 * are plaintext (the checklist needs them); the note is sealed in this browser,
 * under a fresh IV on every save, before it reaches /api/will.
 */
export function WillItemForm({ ownerId, dek, keepers, itemCount, editing, onSaved, onCancel }: Props) {
  const isEditing = !!editing;
  const [serviceName, setServiceName] = useState(editing?.serviceName ?? "");
  const [category, setCategory] = useState<WillCategory>(editing?.category ?? "other");
  const [wish, setWish] = useState<WillWish | null>(editing?.wish ?? null);
  const [keeperId, setKeeperId] = useState(editing?.transferKeeperId ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const notesLocked = dek === null;
  const charCount = [...notes].length;
  const overLimit = charCount > MAX_NOTE_CHARS;
  const capReached = !isEditing && !checkWillCap(itemCount).ok;

  function onNameChange(value: string) {
    setServiceName(value);
    // A recognised service pre-selects its usual category for new accounts only.
    if (!isEditing) {
      const suggested = suggestCategory(value);
      if (suggested) setCategory(suggested);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isEditing) {
      const cap = checkWillCap(itemCount);
      if (!cap.ok) {
        setError(cap.error);
        return;
      }
    }
    const transferKeeperId = wish === "transfer" ? keeperId || null : null;
    const check = checkWillDraft({ serviceName, category, wish, transferKeeperId, notes: notesLocked ? "" : notes });
    if (!check.ok) {
      setError(check.error);
      return;
    }

    startTransition(async () => {
      try {
        // Client-generated id: it is bound into the note's AAD.
        const itemId = editing?.id ?? globalThis.crypto.randomUUID();
        let notesPayload: { ciphertext: string; iv: string } | null | "keep";
        if (notesLocked) {
          // Locked vault: leave any stored note exactly as it is.
          notesPayload = "keep";
        } else if (notes.trim().length === 0) {
          notesPayload = null;
        } else {
          // Whole note re-sealed; encryptItem draws a fresh IV on every call.
          const sealed = await sealWillNote(dek, ownerId, itemId, notes);
          notesPayload = { ciphertext: sealed.ciphertext, iv: sealed.iv };
        }
        const res = await fetch(isEditing ? `/api/will/${itemId}` : "/api/will", {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: itemId,
            serviceName: serviceName.trim(),
            category,
            wish,
            transferToKeeperId: transferKeeperId,
            notes: isEditing ? notesPayload : notesPayload === "keep" ? null : notesPayload,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(data?.error ?? "We couldn't save that just now. Please try again.");
          return;
        }
        onSaved();
      } catch {
        setError("We couldn't save that just now. Please try again.");
      }
    });
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="font-serif text-lg">{isEditing ? "Edit account" : "Add an account"}</CardTitle>
        <CardDescription>
          The name and your wish are visible to your keepers after a confirmed release. Anything
          sensitive belongs in the note, which is encrypted on this device.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {capReached && !error && (
            <p role="status" className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
              You&apos;ve reached {MAX_WILL_ITEMS} accounts. Please remove one before adding another.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="will-service">Account or service</Label>
            <Input
              id="will-service"
              list="will-service-suggestions"
              value={serviceName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g. Gmail"
              maxLength={100}
              disabled={isPending}
            />
            <datalist id="will-service-suggestions">
              {SERVICE_SUGGESTIONS.map((s) => (
                <option key={s.name} value={s.name} />
              ))}
            </datalist>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="will-category">Category</Label>
            <select
              id="will-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as WillCategory)}
              disabled={isPending}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">What should happen to it?</legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="will-wish"
                checked={wish === null}
                onChange={() => {
                  setWish(null);
                  setKeeperId("");
                }}
                disabled={isPending}
                className="mt-1"
              />
              <span>
                <strong>{NO_WISH_LABEL}.</strong> <span className="text-muted-foreground">Decide later.</span>
              </span>
            </label>
            {WISHES.map((w) => (
              <label key={w} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="will-wish"
                  checked={wish === w}
                  onChange={() => {
                    setWish(w);
                    if (w !== "transfer") setKeeperId("");
                  }}
                  disabled={isPending}
                  className="mt-1"
                />
                <span>
                  <span aria-hidden="true">{WISH_META[w].icon} </span>
                  <strong>{WISH_META[w].label}.</strong>{" "}
                  <span className="text-muted-foreground">{WISH_META[w].description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {wish === "transfer" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="will-keeper">Transfer to</Label>
              {keepers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  A transfer needs a keeper who has accepted their invitation. Invite one from the Keepers page.
                </p>
              ) : (
                <select
                  id="will-keeper"
                  value={keeperId}
                  onChange={(e) => setKeeperId(e.target.value)}
                  disabled={isPending}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                >
                  <option value="">Choose a keeper…</option>
                  {keepers.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="will-notes">Private note (encrypted)</Label>
            <textarea
              id="will-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              disabled={isPending || notesLocked}
              aria-describedby="will-notes-hint"
              placeholder={notesLocked ? "Unlock your vault to write or change a note." : "e.g. The recovery hint is in the safe."}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            />
            <p id="will-notes-hint" className={`text-xs ${overLimit ? "text-destructive" : "text-muted-foreground"}`}>
              {notesLocked
                ? editing?.hasNote
                  ? "This account has a note. It stays as it is until you unlock your vault."
                  : "Notes use your vault passphrase."
                : `${charCount.toLocaleString("en-US")} / ${MAX_NOTE_CHARS.toLocaleString("en-US")} characters. Point to where things are; never write a live password here.`}
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" type="button" onClick={onCancel} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isPending || capReached}>
              {isPending ? "Saving…" : isEditing ? "Save changes" : "Save account"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
