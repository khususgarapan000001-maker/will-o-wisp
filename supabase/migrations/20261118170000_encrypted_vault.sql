-- Migration: encrypted_vault
-- Creates the vaults and vault_items tables (design-doc §4.2, §4.8) with RLS.
--
-- RLS notes:
--   • Owners have full access to their own rows.
--   • Keepers need read access to vault_items only after a confirmed release.
--     That policy joins release_processes + keepers tables (Spec 4) which do NOT
--     exist yet. The intended policy is written as a commented block below so
--     it can be copy-pasted and uncommented in the Spec 4 migration.
--     TODO(spec-4): uncomment and apply the keeper read policies once
--     release_processes and keepers tables are created.

-- ============================================================
-- 1.1  vaults table
-- ============================================================
create table if not exists public.vaults (
  id                       uuid primary key default gen_random_uuid(),
  owner_id                 uuid not null unique references public.profiles (id) on delete cascade,
  -- Base64-encoded 32-byte random salt for PBKDF2 key derivation.
  salt                     text not null,
  -- Base64-encoded AES-KW wrapped DEK (data-encryption key).
  wrapped_dek              text not null,
  -- JSONB array of per-keeper wrapped DEKs:
  -- [{ keeper_id: uuid, wrapped_dek: base64, ephemeral_public_key: base64, kdf_salt: base64 }]
  -- The ephemeral_public_key is the owner's one-time ECDH public key — the
  -- keeper needs it to derive the shared secret and unwrap the DEK (§5.3).
  -- Keepers cannot read this column until after a confirmed release (see TODO(spec-4)).
  wrapped_dek_for_keepers  jsonb not null default '[]'::jsonb,
  -- Owner-written hint, plaintext — never the passphrase itself.
  recovery_hint            text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table public.vaults enable row level security;

create policy "vaults: owner can select"
  on public.vaults
  for select
  using (auth.uid() = owner_id);

create policy "vaults: owner can insert"
  on public.vaults
  for insert
  with check (auth.uid() = owner_id);

create policy "vaults: owner can update"
  on public.vaults
  for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "vaults: owner can delete"
  on public.vaults
  for delete
  using (auth.uid() = owner_id);

-- TODO(spec-4): keeper select on vaults.wrapped_dek_for_keepers — only after
-- release. Apply after keepers + release_processes tables are created.
-- NOTE: the policy below references keepers.auth_user_id, a column the
-- design-doc §4.5 keepers table does not have yet — Spec 4 must add it
-- (uuid FK to auth.users, set when the keeper accepts the invite) or join
-- on the keeper's email instead.
--
-- create policy "vaults: keeper can select wrapped_dek_for_keepers after release"
--   on public.vaults
--   for select
--   using (
--     exists (
--       select 1 from public.keepers k
--       join public.release_processes rp on rp.owner_id = vaults.owner_id
--       where k.auth_user_id = auth.uid()
--         and k.owner_id = vaults.owner_id
--         and k.status = 'accepted'
--         and rp.state = 'released'
--     )
--   );

create trigger vaults_set_updated_at
  before update on public.vaults
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- 1.2  vault_items table
-- ============================================================
create table if not exists public.vault_items (
  id                   uuid primary key default gen_random_uuid(),
  vault_id             uuid not null references public.vaults (id) on delete cascade,
  -- item kind: message | credential_pointer | instruction
  kind                 text not null,
  -- AES-GCM ciphertext (Base64) of the combined JSON payload {title, body}.
  -- Title and body are encrypted TOGETHER under one IV: encrypting them
  -- separately with the same IV would reuse an AES-GCM IV under one key,
  -- which breaks both confidentiality and authentication. AAD = owner_id || item_id.
  payload_ciphertext   text not null,
  -- Base64-encoded 12-byte random IV (unique per item, never reused).
  iv                   text not null,
  -- When non-null, only this keeper sees the item after release.
  recipient_keeper_id  uuid,
  sort_order           int  not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint vault_items_kind_check
    check (kind in ('message', 'credential_pointer', 'instruction'))
);

alter table public.vault_items enable row level security;

-- Helper: given a vault_items row, determine the owner's auth.uid().
-- Owners have full access through the vault they own.
create policy "vault_items: owner can select"
  on public.vault_items
  for select
  using (
    exists (
      select 1 from public.vaults v
      where v.id = vault_items.vault_id
        and v.owner_id = auth.uid()
    )
  );

create policy "vault_items: owner can insert"
  on public.vault_items
  for insert
  with check (
    exists (
      select 1 from public.vaults v
      where v.id = vault_items.vault_id
        and v.owner_id = auth.uid()
    )
  );

create policy "vault_items: owner can update"
  on public.vault_items
  for update
  using (
    exists (
      select 1 from public.vaults v
      where v.id = vault_items.vault_id
        and v.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.vaults v
      where v.id = vault_items.vault_id
        and v.owner_id = auth.uid()
    )
  );

create policy "vault_items: owner can delete"
  on public.vault_items
  for delete
  using (
    exists (
      select 1 from public.vaults v
      where v.id = vault_items.vault_id
        and v.owner_id = auth.uid()
    )
  );

-- TODO(spec-4): keeper read policy — only readable after confirmed release.
-- Apply after keepers + release_processes tables are created in Spec 4:
--
-- create policy "vault_items: keeper can select after release"
--   on public.vault_items
--   for select
--   using (
--     exists (
--       select 1
--       from public.vaults v
--       join public.keepers k on k.owner_id = v.owner_id
--       join public.release_processes rp on rp.owner_id = v.owner_id
--       where v.id = vault_items.vault_id
--         and k.auth_user_id = auth.uid()
--         and k.status = 'accepted'
--         and rp.state = 'released'
--         and (
--           vault_items.recipient_keeper_id is null
--           or vault_items.recipient_keeper_id = k.id
--         )
--     )
--   );

create trigger vault_items_set_updated_at
  before update on public.vault_items
  for each row
  execute function public.set_updated_at();
