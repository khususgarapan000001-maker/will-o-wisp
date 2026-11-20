"use client";

/**
 * Client component for the vault page.
 *
 * Handles the locked/unlocked state transition entirely in the browser.
 * While locked: only the VaultUnlock passphrase form is shown — no ciphertext,
 * titles, or metadata leak into the DOM (requirement §2 rule 6).
 * While unlocked: items are fetched from the server and decrypted here.
 */

import { useState, useCallback, useEffect, useTransition } from "react";
import { VaultUnlock } from "@/components/vault/VaultUnlock";
import { VaultItemCard } from "@/components/vault/VaultItemCard";
import { VaultEditor } from "@/components/vault/VaultEditor";
import { KeeperKeySync } from "@/components/keepers/KeeperKeySync";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { isVaultUnlocked, getDek, lockVault } from "@/lib/crypto/session";
import { getVaultItemsAction, deleteVaultItemAction } from "@/lib/vault/actions";
import type { VaultItemData } from "@/components/vault/VaultItemCard";
import Link from "next/link";

interface VaultClientProps {
  ownerId: string;
  vaultId: string;
  saltB64: string;
  wrappedDekB64: string;
}

export function VaultClient({ ownerId, vaultId, saltB64, wrappedDekB64 }: VaultClientProps) {
  const [unlocked, setUnlocked] = useState(() => isVaultUnlocked());
  const [items, setItems] = useState<VaultItemData[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<VaultItemData | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadItems = useCallback(() => {
    startTransition(async () => {
      const fetched = await getVaultItemsAction(vaultId);
      setItems(fetched as VaultItemData[]);
    });
  }, [vaultId]);

  // Load items whenever the vault becomes unlocked — including on mount,
  // when the DEK is already in memory (e.g. the user just created the vault
  // in onboarding StepB, which leaves the DEK unlocked).
  useEffect(() => {
    if (unlocked) {
      loadItems();
    }
  }, [unlocked, loadItems]);

  function handleUnlocked() {
    setUnlocked(true);
  }

  function handleLock() {
    lockVault();
    setUnlocked(false);
    setItems([]);
    setShowEditor(false);
    setEditingItem(null);
  }

  function handleNewItem() {
    setEditingItem(null);
    setShowEditor(true);
  }

  function handleEditItem(item: VaultItemData) {
    setEditingItem(item);
    setShowEditor(true);
  }

  function handleSaved() {
    setShowEditor(false);
    setEditingItem(null);
    loadItems();
  }

  function handleDeleteRequest(id: string) {
    setDeleteConfirm(id);
  }

  function handleDeleteCancel() {
    setDeleteConfirm(null);
  }

  function handleDeleteConfirm() {
    if (!deleteConfirm) return;
    const id = deleteConfirm;
    setDeleteConfirm(null);
    startTransition(async () => {
      const result = await deleteVaultItemAction(id);
      if (result.error) {
        setLoadError(result.error);
      } else {
        loadItems();
      }
    });
  }

  const dek = getDek();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/app" className="text-sm tracking-[0.3em] text-primary/80 uppercase">
            WILL-O&apos;-WISP
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm text-foreground">Vault</span>
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
        {!unlocked ? (
          <VaultUnlock
            saltB64={saltB64}
            wrappedDekB64={wrappedDekB64}
            onUnlocked={handleUnlocked}
          />
        ) : (
          <>
            {/* Unlocked — item list */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="font-serif text-3xl text-foreground">Your vault</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Items are encrypted on your device. Only you can read them.
                </p>
              </div>
              {!showEditor && (
                <Button onClick={handleNewItem} disabled={isPending}>
                  Add item
                </Button>
              )}
            </div>

            {/* Spec 4: give newly accepted keepers their wrapped DEK (same unlock, no 2nd path). */}
            <div className="mb-4">
              <KeeperKeySync />
            </div>

            {loadError && (
              <p role="alert" className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {loadError}
              </p>
            )}

            {/* Editor (create / edit) */}
            {showEditor && dek && (
              <div className="mb-6">
                <VaultEditor
                  vaultId={vaultId}
                  ownerId={ownerId}
                  dek={dek}
                  editingItem={editingItem}
                  onSaved={handleSaved}
                  onCancel={() => { setShowEditor(false); setEditingItem(null); }}
                />
              </div>
            )}

            {/* Delete confirmation modal */}
            {deleteConfirm && (
              <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm text-foreground">
                  Are you sure you want to permanently delete this item? This cannot be undone.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleDeleteCancel}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteConfirm}
                    disabled={isPending}
                  >
                    Delete permanently
                  </Button>
                </div>
              </div>
            )}

            {/* Item list */}
            {items.length === 0 && !showEditor ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
                <p className="text-muted-foreground">Your vault is empty.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add your first item to get started.
                </p>
                <Button className="mt-4" onClick={handleNewItem}>
                  Add first item
                </Button>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {items.map((item) =>
                  dek ? (
                    <li key={item.id}>
                      <VaultItemCard
                        item={item}
                        ownerId={ownerId}
                        dek={dek}
                        onEdit={handleEditItem}
                        onDelete={handleDeleteRequest}
                      />
                    </li>
                  ) : null
                )}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
