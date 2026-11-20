"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EchoPanel } from "@/components/letters/EchoPanel";
import { LetterCard } from "@/components/letters/LetterCard";
import { sealLetter } from "@/lib/letters/seal";
import {
  checkLetterCap,
  checkLetterDraft,
  MAX_BODY_CHARS,
  MAX_LETTERS_PER_OWNER,
} from "@/lib/letters/validation";
import type { LetterStatus } from "@/lib/supabase/types";

export interface EditorKeeper {
  id: string;
  name: string;
}

export interface EditableLetter {
  id: string;
  subject: string;
  body: string;
  recipientKeeperId: string;
  status: LetterStatus;
  aiAssisted: boolean;
  writtenAt: string;
}

interface LetterEditorProps {
  ownerId: string;
  ownerName: string;
  dek: CryptoKey;
  /** Accepted keepers only: the only people a letter can be addressed to. */
  keepers: EditorKeeper[];
  /** How many letters the owner already has (for the 50-letter cap). */
  letterCount: number;
  /** Set when editing an existing letter. */
  editing?: EditableLetter | null;
  onSaved: () => void;
  onCancel: () => void;
}

/**
 * Subject + body editor. New letters default to DRAFT: a half-written letter
 * must never be delivered, so the owner has to mark it ready explicitly.
 * The text is sealed in the browser (one payload, one fresh IV, also on every
 * edit) before it is sent to /api/letters.
 */
export function LetterEditor({
  ownerId,
  ownerName,
  dek,
  keepers,
  letterCount,
  editing,
  onSaved,
  onCancel,
}: LetterEditorProps) {
  const isEditing = !!editing;
  const [subject, setSubject] = useState(editing?.subject ?? "");
  const [body, setBody] = useState(editing?.body ?? "");
  const [recipient, setRecipient] = useState(editing?.recipientKeeperId ?? keepers[0]?.id ?? "");
  const [status, setStatus] = useState<LetterStatus>(editing?.status ?? "draft");
  const [showPreview, setShowPreview] = useState(false);
  // Sticky: once an Echo draft has been used, the letter stays AI-assisted.
  const [usedEcho, setUsedEcho] = useState(false);
  const aiAssisted = (editing?.aiAssisted ?? false) || usedEcho;
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const charCount = [...body].length;
  const overLimit = charCount > MAX_BODY_CHARS;
  const capReached = !isEditing && !checkLetterCap(letterCount).ok;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isEditing) {
      const cap = checkLetterCap(letterCount);
      if (!cap.ok) {
        setError(cap.error);
        return;
      }
    }
    if (!recipient) {
      setError("Please choose who this letter is for.");
      return;
    }
    const check = checkLetterDraft({ subject, body });
    if (!check.ok) {
      setError(check.error);
      return;
    }

    startTransition(async () => {
      try {
        // The id is client-generated: it is bound into the ciphertext's AAD.
        const letterId = editing?.id ?? globalThis.crypto.randomUUID();
        // Whole payload re-sealed; encryptItem draws a fresh IV on every call.
        const sealed = await sealLetter(dek, ownerId, letterId, { subject, body });
        const res = await fetch(isEditing ? `/api/letters/${letterId}` : "/api/letters", {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: letterId,
            recipientKeeperId: recipient,
            payloadCiphertext: sealed.ciphertext,
            iv: sealed.iv,
            status,
            aiAssisted,
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
        <CardTitle className="font-serif text-lg">{isEditing ? "Edit letter" : "Write a letter"}</CardTitle>
        <CardDescription>
          Your words are encrypted on this device before they leave it. Only the keeper you choose
          can read this, and only after a confirmed release.
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
              You&apos;ve reached {MAX_LETTERS_PER_OWNER} letters. Please remove one before writing another.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="letter-recipient">For</Label>
            <select
              id="letter-recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              disabled={isPending}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
            >
              {keepers.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="letter-subject">Subject</Label>
            <Input
              id="letter-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. For when you're ready"
              maxLength={200}
              disabled={isPending}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="letter-body">Your letter</Label>
            <textarea
              id="letter-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              disabled={isPending}
              aria-describedby="letter-count"
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-serif text-base shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            />
            <p
              id="letter-count"
              className={`text-xs ${overLimit ? "text-destructive" : "text-muted-foreground"}`}
            >
              {charCount.toLocaleString("en-US")} / {MAX_BODY_CHARS.toLocaleString("en-US")} characters
            </p>
            <EchoPanel
              recipientName={keepers.find((k) => k.id === recipient)?.name ?? ""}
              disabled={isPending}
              onDraft={(draft) => {
                // Insert as ordinary editable text. If there is already text,
                // add the draft below it rather than overwrite the owner's words.
                setBody((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${draft}` : draft));
                setUsedEcho(true);
              }}
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">When the time comes</legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="letter-status"
                checked={status === "draft"}
                onChange={() => setStatus("draft")}
                disabled={isPending}
                className="mt-1"
              />
              <span>
                <strong>Keep as a draft.</strong> Not delivered. Safe to leave half-finished.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="letter-status"
                checked={status === "final"}
                onChange={() => setStatus("final")}
                disabled={isPending}
                className="mt-1"
              />
              <span>
                <strong>Ready to deliver.</strong> Delivered to your keeper if a release is confirmed.
              </span>
            </label>
          </fieldset>

          <div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? "Hide preview" : "Preview as your keeper will see it"}
            </Button>
            {showPreview && (
              <div className="mt-3">
                <LetterCard
                  ownerName={ownerName}
                  writtenAt={editing?.writtenAt ?? new Date().toISOString()}
                  subject={subject.trim() || "Untitled"}
                  body={body}
                  aiAssisted={aiAssisted}
                />
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" type="button" onClick={onCancel} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isPending || capReached}>
              {isPending ? "Saving…" : isEditing ? "Save changes" : "Save letter"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
