"use server";

import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/get-user";
import type { Json } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Vault creation (onboarding step b)
// Only ciphertext/wrapped-key/salt values reach the server — never plaintext.
// ---------------------------------------------------------------------------

export interface CreateVaultPayload {
  saltB64: string;
  wrappedDekB64: string;
}

export interface CreateVaultResult {
  error?: string;
  vaultId?: string;
}

export async function createVaultAction(
  payload: CreateVaultPayload
): Promise<CreateVaultResult> {
  const user = await getUser();
  if (!user) return { error: "You must be signed in." };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("vaults")
      .insert({
        owner_id: user.id,
        salt: payload.saltB64,
        wrapped_dek: payload.wrappedDekB64,
        wrapped_dek_for_keepers: [] as unknown as Json,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[vault/create] Supabase error:", error.message);
      return { error: "Could not create vault. Please try again." };
    }

    return { vaultId: data.id };
  } catch (err) {
    console.error("[vault/create] unexpected error:", err);
    return { error: "Could not create vault. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Fetch vault metadata (salt + wrapped_dek for unlock)
// ---------------------------------------------------------------------------

export interface VaultMeta {
  id: string;
  saltB64: string;
  wrappedDekB64: string;
}

export async function getVaultMetaAction(): Promise<VaultMeta | null> {
  const user = await getUser();
  if (!user) return null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("vaults")
      .select("id, salt, wrapped_dek")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[vault/meta] Supabase error:", error.message);
      return null;
    }
    if (!data) return null;

    return { id: data.id, saltB64: data.salt, wrappedDekB64: data.wrapped_dek };
  } catch (err) {
    console.error("[vault/meta] unexpected error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Vault items — fetch (ciphertext only)
// ---------------------------------------------------------------------------

export interface VaultItemRow {
  id: string;
  vault_id: string;
  kind: string;
  /** Combined JSON payload {title, body} encrypted under one IV. */
  payload_ciphertext: string;
  iv: string;
  recipient_keeper_id: string | null;
  sort_order: number;
}

export async function getVaultItemsAction(vaultId: string): Promise<VaultItemRow[]> {
  const user = await getUser();
  if (!user) return [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("vault_items")
      .select(
        "id, vault_id, kind, payload_ciphertext, iv, recipient_keeper_id, sort_order"
      )
      .eq("vault_id", vaultId)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("[vault/items/get] Supabase error:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("[vault/items/get] unexpected error:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Vault items — create (ciphertext arrives from browser)
// ---------------------------------------------------------------------------

export interface SaveVaultItemPayload {
  id: string;             // client-generated UUID so AAD can bind before insert
  vaultId: string;
  kind: string;
  /** Combined JSON payload {title, body} encrypted under one IV. */
  payloadCiphertext: string;
  iv: string;
  recipientKeeperId?: string | null;
  sortOrder?: number;
}

export interface SaveVaultItemResult {
  error?: string;
}

export async function createVaultItemAction(
  payload: SaveVaultItemPayload
): Promise<SaveVaultItemResult> {
  const user = await getUser();
  if (!user) return { error: "You must be signed in." };

  const validKinds = ["message", "credential_pointer", "instruction"];
  if (!validKinds.includes(payload.kind)) {
    return { error: "Invalid item kind." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("vault_items").insert({
      id: payload.id,
      vault_id: payload.vaultId,
      kind: payload.kind,
      payload_ciphertext: payload.payloadCiphertext,
      iv: payload.iv,
      recipient_keeper_id: payload.recipientKeeperId ?? null,
      sort_order: payload.sortOrder ?? 0,
    });

    if (error) {
      console.error("[vault/items/create] Supabase error:", error.message);
      return { error: "Could not save item. Please try again." };
    }
    return {};
  } catch (err) {
    console.error("[vault/items/create] unexpected error:", err);
    return { error: "Could not save item. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Vault items — update (re-encrypted with fresh IV from browser)
// ---------------------------------------------------------------------------

export async function updateVaultItemAction(
  payload: SaveVaultItemPayload
): Promise<SaveVaultItemResult> {
  const user = await getUser();
  if (!user) return { error: "You must be signed in." };

  const validKinds = ["message", "credential_pointer", "instruction"];
  if (!validKinds.includes(payload.kind)) {
    return { error: "Invalid item kind." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("vault_items")
      .update({
        kind: payload.kind,
        payload_ciphertext: payload.payloadCiphertext,
        iv: payload.iv,
        recipient_keeper_id: payload.recipientKeeperId ?? null,
        sort_order: payload.sortOrder ?? 0,
      })
      .eq("id", payload.id);

    if (error) {
      console.error("[vault/items/update] Supabase error:", error.message);
      return { error: "Could not update item. Please try again." };
    }
    return {};
  } catch (err) {
    console.error("[vault/items/update] unexpected error:", err);
    return { error: "Could not update item. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Vault items — delete
// ---------------------------------------------------------------------------

export async function deleteVaultItemAction(
  itemId: string
): Promise<SaveVaultItemResult> {
  const user = await getUser();
  if (!user) return { error: "You must be signed in." };

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("vault_items")
      .delete()
      .eq("id", itemId);

    if (error) {
      console.error("[vault/items/delete] Supabase error:", error.message);
      return { error: "Could not delete item. Please try again." };
    }
    return {};
  } catch (err) {
    console.error("[vault/items/delete] unexpected error:", err);
    return { error: "Could not delete item. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Update wrapped_dek_for_keepers
// ---------------------------------------------------------------------------

export interface UpdateWrappedDeksPayload {
  vaultId: string;
  wrappedDeksJson: Json;
}

export async function updateWrappedDeksAction(
  payload: UpdateWrappedDeksPayload
): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: "You must be signed in." };

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("vaults")
      .update({ wrapped_dek_for_keepers: payload.wrappedDeksJson })
      .eq("id", payload.vaultId)
      .eq("owner_id", user.id);

    if (error) {
      console.error("[vault/wrapped-deks] Supabase error:", error.message);
      return { error: "Could not update keeper keys. Please try again." };
    }
    return {};
  } catch (err) {
    console.error("[vault/wrapped-deks] unexpected error:", err);
    return { error: "Could not update keeper keys. Please try again." };
  }
}
