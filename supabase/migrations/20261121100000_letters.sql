-- Migration: letters (Spec 5, tasks 1.1; design-doc §4.9)
--
-- DEVIATION FROM design-doc §4.9 (deliberate, do not "fix" back):
--   The sketch has subject_ciphertext + body_ciphertext sharing ONE `iv`.
--   That is an AES-GCM IV-reuse defect (two ciphertexts under one key and one
--   IV leak the XOR of the plaintexts and break authentication). Letters
--   instead follow vault_items: a SINGLE `payload_ciphertext` holding the JSON
--   payload {"subject": "...", "body": "..."}, encrypted as one ciphertext
--   under ONE fresh 96-bit IV (column `iv`). An edit re-encrypts the whole
--   payload with a new IV. AAD = owner_id || letter_id (lib/crypto/encrypt.ts).
--
-- owner_id column: vault_items reaches its owner through vaults (a join in
--   every policy). Letters carry owner_id directly. It makes the owner
--   policies a plain `auth.uid() = owner_id`, makes the keeper policy and the
--   delivery trigger single-table lookups, and lets the API count a person's
--   letters cheaply. The insert policy still checks that vault_id is the
--   caller's own vault, so the two columns cannot disagree.
--
-- Limits: the 10,000-character body limit and the 50-letter cap are enforced
--   in the editor and in /api/letters. The database cannot count characters in
--   ciphertext and deliberately does not enforce the cap (the API is the only
--   writer in practice; a direct-API writer could exceed 50 of their OWN
--   letters, which only costs them free-tier space).
--
-- Delivery: see 20261121100100_letters_delivery.sql. Nobody can set
--   delivered_at from a client (letters_guard below).

create table if not exists public.letters (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references public.profiles (id) on delete cascade,
  vault_id             uuid not null references public.vaults (id) on delete cascade,
  -- One recipient per letter (requirements §1). Keepers are soft-revoked,
  -- never deleted, so this FK only cascades if the owner is removed entirely.
  recipient_keeper_id  uuid not null references public.keepers (id) on delete cascade,
  -- AES-GCM ciphertext (Base64) of the single JSON payload {subject, body}.
  payload_ciphertext   text not null,
  -- Base64 12-byte IV, fresh per ciphertext, never reused (see header).
  iv                   text not null,
  -- True when drafted with Echo (Spec 7). The editor does not set it yet.
  ai_assisted          boolean not null default false,
  -- Only `final` letters are delivered. New letters default to `draft`.
  status               text not null default 'draft',
  -- Set only by the release trigger, in the same transaction as the release.
  delivered_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint letters_status_check check (status in ('draft', 'final')),
  -- A draft is never delivered.
  constraint letters_delivered_only_final check (delivered_at is null or status = 'final'),
  constraint letters_iv_check check (char_length(iv) between 16 and 24),
  -- Generous ciphertext ceiling (10,000 chars * 4 bytes UTF-8 + subject + tag,
  -- Base64-encoded). The exact character limit is a client/API rule.
  constraint letters_payload_size_check check (char_length(payload_ciphertext) <= 80000)
);

create index if not exists letters_owner_idx on public.letters (owner_id, created_at desc);
create index if not exists letters_recipient_idx on public.letters (recipient_keeper_id);

alter table public.letters enable row level security;

create policy "letters: owner can select"
  on public.letters
  for select
  using (auth.uid() = owner_id);

create policy "letters: owner can insert"
  on public.letters
  for insert
  with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.vaults v
       where v.id = letters.vault_id and v.owner_id = auth.uid()
    )
  );

create policy "letters: owner can update"
  on public.letters
  for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- A delivered letter has already been read by its keeper; it stays.
create policy "letters: owner can delete undelivered"
  on public.letters
  for delete
  using (auth.uid() = owner_id and delivered_at is null);

-- The recipient keeper may read a letter ONLY once it has been delivered, they
-- are still `accepted`, and the owner's release is `released`. Mirrors the
-- EXISTS pattern of "vaults: keeper can select after release".
create policy "letters: recipient keeper can select after release"
  on public.letters
  for select
  using (
    letters.delivered_at is not null
    and exists (
      select 1
        from public.keepers k
        join public.release_processes rp on rp.owner_id = k.owner_id
       where k.id = letters.recipient_keeper_id
         and k.owner_id = letters.owner_id
         and k.auth_user_id = auth.uid()
         and k.status = 'accepted'
         and rp.state = 'released'
    )
  );

create trigger letters_set_updated_at
  before update on public.letters
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- Column-level guard for direct client writes (RLS cannot restrict columns)
-- ============================================================
-- Client access arrives as `authenticated`/`anon`. The delivery trigger is a
-- SECURITY DEFINER function (current_user = its owner) and passes.
create or replace function public.letters_guard()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- After the release, the owner's letters are sealed: a letter written now
  -- could never be delivered, so we do not let one be created or changed.
  if exists (
    select 1 from public.release_processes rp
     where rp.owner_id = new.owner_id and rp.state = 'released'
  ) then
    raise exception 'letters: the release has already happened' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.delivered_at is not null then
      raise exception 'letters: delivered_at is set by the release only' using errcode = '42501';
    end if;
  else
    if new.id <> old.id or new.owner_id <> old.owner_id or new.vault_id <> old.vault_id then
      raise exception 'letters: identity columns are immutable' using errcode = '42501';
    end if;
    if new.delivered_at is distinct from old.delivered_at then
      raise exception 'letters: delivered_at is set by the release only' using errcode = '42501';
    end if;
    if old.delivered_at is not null then
      raise exception 'letters: a delivered letter can no longer be changed' using errcode = '42501';
    end if;
  end if;

  -- The recipient must be one of the owner's accepted keepers at write time
  -- (the delivery trigger re-checks at release time).
  if tg_op = 'INSERT' or new.recipient_keeper_id is distinct from old.recipient_keeper_id then
    if not exists (
      select 1 from public.keepers k
       where k.id = new.recipient_keeper_id
         and k.owner_id = new.owner_id
         and k.status = 'accepted'
    ) then
      raise exception 'letters: the recipient must be one of your accepted keepers'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger letters_guard
  before insert or update on public.letters
  for each row
  execute function public.letters_guard();
