"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MAX_NOTES_CHARS } from "@/lib/echo/prompt";

const CONSENT_KEY = "wow.echo.consent.v1";

interface EchoPanelProps {
  recipientName: string;
  /** Called with the plain-text draft. The editor inserts it as editable text. */
  onDraft: (draft: string) => void;
  disabled?: boolean;
}

type Availability = "checking" | "available" | "unavailable";

/**
 * "Help me draft": notes box, first-use consent, loading and error states.
 * Only the notes typed here and the recipient's name are sent. Nothing else
 * from the vault leaves the device. Notes are kept on every error.
 */
export function EchoPanel({ recipientName, onDraft, disabled }: EchoPanelProps) {
  const [open, setOpen] = useState(false);
  const [availability, setAvailability] = useState<Availability>("checking");
  const [consent, setConsent] = useState<"unknown" | "given" | "declined">("unknown");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(CONSENT_KEY) === "given") setConsent("given");
    } catch {
      /* storage unavailable: ask each time */
    }
  }, []);

  useEffect(() => {
    if (!open || availability !== "checking") return;
    let cancelled = false;
    fetch("/api/echo/draft")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { available?: boolean } | null) => {
        if (!cancelled) setAvailability(d?.available ? "available" : "unavailable");
      })
      .catch(() => {
        if (!cancelled) setAvailability("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [open, availability]);

  const charCount = [...notes].length;
  const tooLong = charCount > MAX_NOTES_CHARS;

  function giveConsent() {
    setConsent("given");
    try {
      window.localStorage.setItem(CONSENT_KEY, "given");
    } catch {
      /* ignore */
    }
  }

  async function requestDraft() {
    setError(null);
    setInfo(null);
    if (notes.trim().length === 0) {
      setError("Please jot down a few notes first, even just a line or two.");
      return;
    }
    if (tooLong) {
      setError("Those notes are a little long for Echo. Please keep them under 2,000 characters.");
      return;
    }
    if (!recipientName) {
      setError("Please choose who this letter is for.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/echo/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, recipientName }),
      });
      const data = (await res.json().catch(() => null)) as
        | { draft?: string; truncated?: boolean; error?: string }
        | null;
      if (!res.ok || typeof data?.draft !== "string") {
        setError(data?.error ?? "Echo couldn't write a draft just now. Your notes are still here.");
        return;
      }
      onDraft(data.draft);
      setInfo(
        data.truncated
          ? "Your draft is in the letter below. It was shortened, so please finish it in your own words."
          : "Your draft is in the letter below. Change anything you like."
      );
    } catch {
      setError("Echo couldn't write a draft just now. Your notes are still here.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} disabled={disabled}>
          Help me draft
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3" data-testid="echo-panel">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Echo: help me draft</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>

      {availability === "checking" && <p className="text-sm text-muted-foreground">One moment…</p>}

      {availability === "unavailable" && (
        <p role="status" className="text-sm text-muted-foreground">
          AI drafting isn&apos;t configured yet. You can still write your letter by hand.
        </p>
      )}

      {availability === "available" && consent === "declined" && (
        <p role="status" className="text-sm text-muted-foreground">
          Echo is off for this letter. You can still write it by hand.
        </p>
      )}

      {availability === "available" && consent === "unknown" && (
        <div className="flex flex-col gap-2 text-sm">
          <p>
            Echo writes a first draft from a few notes you type here. Those notes, and the name of
            the person you&apos;re writing to, are sent to an AI provider to generate the draft.
            Nothing else from your vault is sent. The draft is always yours to edit, and your keeper
            will see that AI helped.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={giveConsent}>
              I understand, continue
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setConsent("declined")}>
              No thanks
            </Button>
          </div>
        </div>
      )}

      {availability === "available" && consent === "given" && (
        <div className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {info && (
            <p role="status" className="text-sm text-muted-foreground">
              {info}
            </p>
          )}
          <Label htmlFor="echo-notes">A few notes for {recipientName || "your keeper"}</Label>
          <textarea
            id="echo-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            disabled={loading}
            placeholder="e.g. thank her for the garden; tell him about the key in the drawer"
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          />
          <p className={`text-xs ${tooLong ? "text-destructive" : "text-muted-foreground"}`}>
            {charCount.toLocaleString("en-US")} / {MAX_NOTES_CHARS.toLocaleString("en-US")} characters
          </p>
          <div>
            <Button type="button" size="sm" onClick={requestDraft} disabled={loading || disabled}>
              {loading ? "Drafting…" : "Draft"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
