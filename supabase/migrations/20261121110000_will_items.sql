-- Migration: will_items (Spec 6, tasks 1.1; design-doc §4.10)
--
-- Plaintext / encrypted split (design-doc §5.4): service_name, category, wish
--   and transfer_to_keeper_id are PLAINTEXT, because the checklist UI and the
--   keeper's scan of it need them and service names alone are low-sensitivity.
--   Anything sensitive goes in the single encrypted note (notes_ciphertext +
--   iv). There is only ONE ciphertext column, so there is no IV-reuse trap
--   like the letters sketch had; an edit still re-encrypts the whole note with
--   a fresh 96-bit IV (client side). AAD = owner_id || will_item_id
--   (lib/crypto/encrypt.ts).
--
-- wish is NULLABLE on purpose: NULL means "not set yet". Requirement 6 and the
--   dashboard prompt (task 2.5) need an account to exist WITHOUT a wish. When
--   set it is a closed enum, and `transfer` requires a target keeper (CHECK
--   below, not just UI validation). A target is only meaningful with the
--   transfer wish, so any other wish must leave it NULL.
--
-- owner_id column: like letters, items carry owner_id directly (vault_items
--   reaches its owner through vaults). It makes the owner policies a plain
--   `auth.uid() = owner_id`, and the keeper policy and delivery trigger
--   single-table lookups.
--
-- Limits: the 2,000-character note limit and the 200-item cap are enforced in
--   the editor and in /api/will. The database cannot count characters in
--   ciphertext (it only bounds the ciphertext size) and does not count rows.
--
-- Keeper revoked before release: the item is NOT deleted. The keeper view
--   shows it with a "keeper no longer available" flag (design.md). That is why
--   the transfer-target check below runs only when the target is being SET.
--
-- After release the owner's will is sealed (will_items_guard), and keepers can
--   read it. Delivery is a notification, not a data flip: see
--   20261121110100_will_delivery.sql. will_items has no delivery columns.

create table if not exists public.will_items (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null references public.profiles (id) on delete cascade,
  -- Plaintext, deliberately (see header).
  service_name           text not null,
  category               text not null default 'other',
  -- NULL = no wish chosen yet.
  wish                   text,
  -- Keepers are soft-revoked, never deleted, so this FK only cascades with the
  -- owner (NO ACTION: a plain keeper delete that would orphan a transfer fails).
  transfer_to_keeper_id  uuid references public.keepers (id),
  -- AES-GCM ciphertext (Base64) of the note, and its fresh 96-bit IV.
  notes_ciphertext       text,
  iv                     text,
  sort_order             int not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint will_items_service_name_check
    check (char_length(btrim(service_name)) between 1 and 100),
  constraint will_items_category_check
    check (category in ('social', 'finance', 'email', 'photos', 'work', 'other')),
  constraint will_items_wish_check
    check (wish is null or wish in ('delete', 'memorialize', 'transfer', 'archive', 'ignore')),
  -- transfer requires a keeper; any other wish (or none) carries no target.
  constraint will_items_transfer_requires_keeper
    -- (Written as an equality of two non-NULL booleans: a CHECK passes on a NULL
    -- result, and `wish = 'transfer'` is NULL while the wish is unset.)
    check ((wish is not distinct from 'transfer') = (transfer_to_keeper_id is not null)),
  -- An IV exists if and only if there is a note.
  constraint will_items_iv_iff_notes
    check ((notes_ciphertext is null) = (iv is null)),
  constraint will_items_iv_check
    check (iv is null or char_length(iv) between 16 and 24),
  -- Generous ciphertext ceiling (2,000 chars * 6 bytes worst case, Base64).
  -- The exact character limit is a client/API rule.
  constraint will_items_notes_size_check
    check (notes_ciphertext is null or char_length(notes_ciphertext) <= 17000)
);

create index if not exists will_items_owner_idx on public.will_items (owner_id, sort_order, created_at);
create index if not exists will_items_transfer_idx on public.will_items (transfer_to_keeper_id);

alter table public.will_items enable row level security;

create policy "will_items: owner can select"
  on public.will_items
  for select
  using (auth.uid() = owner_id);

create policy "will_items: owner can insert"
  on public.will_items
  for insert
  with check (auth.uid() = owner_id);

create policy "will_items: owner can update"
  on public.will_items
  for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "will_items: owner can delete"
  on public.will_items
  for delete
  using (auth.uid() = owner_id);

-- EVERY accepted keeper of the owner may read the whole checklist, but only
-- once the owner's release is `released` (same EXISTS pattern as
-- "letters: recipient keeper can select after release"; not one recipient).
create policy "will_items: accepted keeper can select after release"
  on public.will_items
  for select
  using (
    exists (
      select 1
        from public.keepers k
        join public.release_processes rp on rp.owner_id = k.owner_id
       where k.owner_id = will_items.owner_id
         and k.auth_user_id = auth.uid()
         and k.status = 'accepted'
         and rp.state = 'released'
    )
  );

create trigger will_items_set_updated_at
  before update on public.will_items
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- Column/state guard for direct client writes (RLS cannot see them)
-- ============================================================
-- Client access arrives as `authenticated`/`anon`. SECURITY DEFINER functions
-- (current_user = their owner) and cascades from account removal pass.
create or replace function public.will_items_guard()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  -- After the release the will is sealed: it has been delivered, so it can no
  -- longer be added to, changed or deleted.
  if exists (
    select 1 from public.release_processes rp
     where rp.owner_id = coalesce(new.owner_id, old.owner_id) and rp.state = 'released'
  ) then
    raise exception 'will: the release has already happened' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.owner_id <> old.owner_id then
      raise exception 'will: identity columns are immutable' using errcode = '42501';
    end if;
  end if;

  -- The transfer target must be one of the owner's accepted keepers when it is
  -- SET. A keeper revoked later does not block edits to the item (the keeper
  -- view flags it instead), so this runs only when the target or wish changes.
  if new.wish = 'transfer' and (
       tg_op = 'INSERT'
       or new.transfer_to_keeper_id is distinct from old.transfer_to_keeper_id
       or old.wish is distinct from 'transfer'
     ) then
    if not exists (
      select 1 from public.keepers k
       where k.id = new.transfer_to_keeper_id
         and k.owner_id = new.owner_id
         and k.status = 'accepted'
    ) then
      raise exception 'will: the transfer target must be one of your accepted keepers'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger will_items_guard
  before insert or update or delete on public.will_items
  for each row
  execute function public.will_items_guard();
