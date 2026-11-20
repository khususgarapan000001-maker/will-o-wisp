"use client";

/**
 * Owner's digital-will page (client half). Service names, categories and
 * wishes are plaintext, so the list works with the vault locked. Only the
 * encrypted notes need the vault passphrase: while it is locked they stay
 * sealed, and the inline unlock form offers to open them.
 */

import { useCallback, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { VaultUnlock } from "@/components/vault/VaultUnlock";
import { WillChecklist } from "@/components/will/WillChecklist";
import { WillItemForm, type EditableWillItem, type FormKeeper } from "@/components/will/WillItemForm";
import { getDek, isVaultUnlocked, lockVault } from "@/lib/crypto/session";
import { NOT_A_LEGAL_WILL_NOTICE, type WillItemData } from "@/lib/will/model";
import { moveWithinCategory } from "@/lib/will/grouping";
import { checkWillCap, MAX_WILL_ITEMS } from "@/lib/will/validation";

interface Props {
  ownerId: string;
  initialItems: WillItemData[];
  /** Vault meta, or null when the owner has not set a vault up yet. */
  vault: { saltB64: string; wrappedDekB64: string } | null;
  /** Every keeper the owner has (names for the transfer line). */
  keeperNames: Record<string, string>;
  /** Accepted keepers: the only valid transfer targets. */
  acceptedKeepers: FormKeeper[];
}

export function WillClient({ ownerId, initialItems, vault, keeperNames, acceptedKeepers }: Props) {
  const [unlocked, setUnlocked] = useState(() => isVaultUnlocked());
  const [items, setItems] = useState<WillItemData[]>(initialItems);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EditableWillItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/will", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { items: WillItemData[] };
      setItems(data.items);
      setError(null);
    } catch {
      setError("We couldn't load your list just now. Please try again in a moment.");
    }
  }, []);

  const dek = unlocked ? getDek() : null;
  const capReached = !checkWillCap(items.length).ok;

  function handleLock() {
    lockVault();
    setUnlocked(false);
  }

  function startNew() {
    setEditing(null);
    setShowForm(true);
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/will/${id}`, { method: "DELETE" });
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

  async function handleMove(id: string, direction: "up" | "down") {
    const ids = moveWithinCategory(items, id, direction);
    setBusy(true);
    try {
      const res = await fetch("/api/will/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "We couldn't reorder that just now. Please try again.");
      } else {
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/app" className="text-sm tracking-[0.3em] text-primary/80 uppercase">
            WILL-O&apos;-WISP
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm text-foreground">Will</span>
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
        <h1 className="font-serif text-3xl text-foreground">Digital will</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          For each online account, say what you&apos;d like to happen to it. Your keepers see this
          only after a confirmed release.
        </p>
        <p role="note" className="mt-4 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground">
          {NOT_A_LEGAL_WILL_NOTICE}
        </p>

        <div className="mt-6">
          {error && (
            <p role="alert" className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {vault && !unlocked && (
            <details className="mb-4 rounded-xl border border-border bg-card p-4">
              <summary className="cursor-pointer text-sm text-foreground">
                Unlock your vault to read or write private notes
              </summary>
              <div className="mt-4">
                <VaultUnlock
                  saltB64={vault.saltB64}
                  wrappedDekB64={vault.wrappedDekB64}
                  onUnlocked={() => setUnlocked(true)}
                />
              </div>
            </details>
          )}
          {!vault && (
            <p className="mb-4 text-xs text-muted-foreground">
              Private notes use your vault passphrase.{" "}
              <Link href="/app/vault" className="underline">
                Set up your vault
              </Link>{" "}
              to add them.
            </p>
          )}

          {showForm && (
            <div className="mb-6">
              <WillItemForm
                key={editing?.id ?? "new"}
                ownerId={ownerId}
                dek={dek}
                keepers={acceptedKeepers}
                itemCount={items.length}
                editing={editing}
                onSaved={() => {
                  setShowForm(false);
                  setEditing(null);
                  void load();
                }}
                onCancel={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
              />
            </div>
          )}

          {deleteId && (
            <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-foreground">Remove this account from your list? This can&apos;t be undone.</p>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>
                  Keep it
                </Button>
                <Button variant="destructive" size="sm" onClick={() => void confirmDelete()} disabled={busy}>
                  Remove permanently
                </Button>
              </div>
            </div>
          )}

          {!showForm && (
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {items.length} of {MAX_WILL_ITEMS} accounts{capReached ? " · you've reached the limit" : ""}
              </p>
              <Button onClick={startNew} disabled={capReached}>
                Add an account
              </Button>
            </div>
          )}

          {items.length === 0 && !showForm ? (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-border py-16 text-center">
              {/* Pocong empty state: original illustration, drawn inline (no asset dependency). */}
              <svg
                role="img"
                aria-label="A small wrapped, glowing figure"
                width="72"
                height="96"
                viewBox="0 0 72 96"
                className="mb-4 text-primary/70"
              >
                <ellipse cx="36" cy="88" rx="18" ry="4" fill="currentColor" opacity="0.15" />
                <path
                  d="M36 6c-9 0-15 7-15 16 0 5 2 8 2 12 0 6-5 8-5 20 0 14 6 28 18 28s18-14 18-28c0-12-5-14-5-20 0-4 2-7 2-12 0-9-6-16-15-16z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path d="M24 26h24M22 44h28M21 62h30" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
                <circle cx="31" cy="18" r="1.6" fill="currentColor" />
                <circle cx="41" cy="18" r="1.6" fill="currentColor" />
              </svg>
              <p className="text-muted-foreground">Nothing on your list yet.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Start with one account, like your email, and say what should happen to it.
              </p>
              <Button className="mt-4" onClick={startNew}>
                Add your first account
              </Button>
            </div>
          ) : (
            items.length > 0 && (
              <WillChecklist
                items={items}
                ownerId={ownerId}
                dek={dek}
                keeperNames={keeperNames}
                onEdit={(item) => {
                  setEditing(item);
                  setShowForm(true);
                }}
                onDelete={setDeleteId}
                onMove={(id, dir) => void handleMove(id, dir)}
              />
            )
          )}
        </div>
      </main>
    </div>
  );
}
