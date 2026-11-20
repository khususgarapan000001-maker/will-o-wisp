-- Migration: keeper read access to the released vault (Spec 4, task 4.1)
-- Resolves the TODO(spec-4) comments in 20261118170000_encrypted_vault.sql.
--
-- A keeper may read the owner's vault row and vault items ONLY when
--   * they are an `accepted` keeper of that owner (revoked keepers lose access
--     the instant their status changes), AND
--   * a release_processes row for that owner is in state `released`.
-- Before release these policies match nothing, so keepers hold nothing usable.
--
-- Column note: RLS is row-level, so the vaults row (salt, wrapped_dek,
-- wrapped_dek_for_keepers) becomes readable as a whole after release. That
-- adds no capability: after release the keeper is entitled to the DEK, and
-- `wrapped_dek` is useless without the owner's passphrase. Nothing here
-- exposes plaintext; everything is ciphertext or a wrapped key.
--
-- vault_items: items with recipient_keeper_id = null are for all keepers;
-- otherwise only for the addressed keeper.

create policy "vaults: keeper can select after release"
  on public.vaults
  for select
  using (
    exists (
      select 1
        from public.keepers k
        join public.release_processes rp on rp.owner_id = k.owner_id
       where k.owner_id = vaults.owner_id
         and k.auth_user_id = auth.uid()
         and k.status = 'accepted'
         and rp.state = 'released'
    )
  );

create policy "vault_items: keeper can select after release"
  on public.vault_items
  for select
  using (
    exists (
      select 1
        from public.vaults v
        join public.keepers k on k.owner_id = v.owner_id
        join public.release_processes rp on rp.owner_id = v.owner_id
       where v.id = vault_items.vault_id
         and k.auth_user_id = auth.uid()
         and k.status = 'accepted'
         and rp.state = 'released'
         and (
           vault_items.recipient_keeper_id is null
           or vault_items.recipient_keeper_id = k.id
         )
    )
  );
