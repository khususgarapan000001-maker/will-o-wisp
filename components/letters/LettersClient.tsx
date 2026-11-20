"use client";

/**
 * Owner's letters page (client half). While the vault is locked only the
 * passphrase form shows: no ciphertext is fetched, so nothing leaks into the
 * DOM. Once unlocked, letters are fetched from /api/letters and opened here.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { VaultUnlock } from "@/components/vault/VaultUnlock";
import { LetterEditor, type EditableLetter, type EditorKeeper } from "@/components/letters/LetterEditor";
import { LetterRow, type LetterRowData } from "@/components/letters/LetterRow";
import { getDek, isVaultUnlocked, lockVault } from "@/lib/crypto/session";
import { checkLetterCap } from "@/lib/letters/validation";

interface Props {
  ownerId: string;
  ownerName: string;
  saltB64: string;
  wrappedDekB64: string;
  /** Every keeper the owner has (names for the list). */
  keeperNames: Record<string, string>;
  /** Accepted keepers: the only valid recipients. */
  acceptedKeepers: EditorKeeper[];
}

export function LettersClient({
  ownerId,
  ownerName,
  saltB64,
  wrappedDekB64,
  keeperNames,
  acceptedKeepers,
}: Props) {
  const [unlocked, setUnlocked] = useState(() => isVaultUnlocked());
  const [letters, setLetters] = useState<LetterRowData[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<EditableLetter | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/letters", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { letters: LetterRowData[] };
      setLetters(data.letters);
      setError(null);
    } catch {
      setError("We couldn't load your letters just now. Please try again in a moment.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (unlocked) void load();
  }, [unlocked, load]);

  function handleLock() {
    lockVault();
    setUnlocked(false);
    setLetters([]);
    setLoaded(false);
    setShowEditor(false);
    setEditing(null);
  }

  function startNew() {
    setEditing(null);
    setShowEditor(true);
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/letters/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "We couldn't delete that just now. Please try again.");
      } else {
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  const dek = getDek();
  const capReached = !checkLetterCap(letters.length).ok;
  const noKeepers = acceptedKeepers.length === 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/app" className="text-sm tracking-[0.3em] text-primary/80 uppercase">
            WILL-O&apos;-WISP
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm text-foreground">Letters</span>
        </div>
        <div className="flex items-center gap-2">
          {unlocked && (
            <Button variant="ghost" size="sm" onClick={handleLock}>
              Lock vault
            </Button>
          )}
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="font-serif text-3xl text-foreground">Last letters</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Words for the people you trust. Each letter is for one keeper and is only delivered if a
          release is confirmed.
        </p>

        {!unlocked || !dek ? (
          <div className="mt-8">
            <p className="mb-4 text-sm text-muted-foreground">
              Your letters use the same passphrase as your vault. Unlock it to read or write them.
            </p>
            <VaultUnlock saltB64={saltB64} wrappedDekB64={wrappedDekB64} onUnlocked={() => setUnlocked(true)} />
          </div>
        ) : (
          <div className="mt-8">
            {error && (
              <p role="alert" className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            {noKeepers && (
              <p role="status" className="mb-4 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
                A letter needs someone to receive it. Once a keeper has accepted their invitation you
                can write to them.{" "}
                <Link href="/app/keepers" className="underline">
                  Invite a keeper
                </Link>
              </p>
            )}

            {showEditor && (
              <div className="mb-6">
                <LetterEditor
                  key={editing?.id ?? "new"}
                  ownerId={ownerId}
                  ownerName={ownerName}
                  dek={dek}
                  keepers={acceptedKeepers}
                  letterCount={letters.length}
                  editing={editing}
                  onSaved={() => {
                    setShowEditor(false);
                    setEditing(null);
                    void load();
                  }}
                  onCancel={() => {
                    setShowEditor(false);
                    setEditing(null);
                  }}
                />
              </div>
            )}

            {deleteId && (
              <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm text-foreground">
                  Delete this letter for good? This can&apos;t be undone.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>
                    Keep it
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => void confirmDelete()} disabled={busy}>
                    Delete permanently
                  </Button>
                </div>
              </div>
            )}

            {!showEditor && (
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {letters.length} of 50 letters{capReached ? " · you've reached the limit" : ""}
                </p>
                <Button onClick={startNew} disabled={noKeepers || capReached}>
                  Write a letter
                </Button>
              </div>
            )}

            {!loaded ? (
              <p className="text-sm text-muted-foreground">Opening your letters…</p>
            ) : letters.length === 0 && !showEditor ? (
              <div className="flex flex-col items-center rounded-xl border border-dashed border-border py-16 text-center">
                <p className="text-muted-foreground">You haven&apos;t written any letters yet.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  A few kind words can mean a great deal.
                </p>
                {!noKeepers && (
                  <Button className="mt-4" onClick={startNew}>
                    Write your first letter
                  </Button>
                )}
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {letters.map((l) => (
                  <LetterRow
                    key={l.id}
                    letter={l}
                    ownerId={ownerId}
                    ownerName={ownerName}
                    dek={dek}
                    recipientName={keeperNames[l.recipient_keeper_id] ?? "a keeper"}
                    onEdit={(letter) => {
                      setEditing(letter);
                      setShowEditor(true);
                    }}
                    onDelete={setDeleteId}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
