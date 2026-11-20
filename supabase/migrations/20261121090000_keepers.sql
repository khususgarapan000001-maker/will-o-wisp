-- Migration: keepers (Spec 4, tasks 1.1; design-doc §4.5)
--
-- A keeper is a trusted person an owner invites. Lifecycle:
--   invited -> accepted | declined | revoked      (accepted -> revoked)
--
-- Columns beyond design-doc §4.5:
--   auth_user_id         the keeper's own Supabase Auth account, set when they
--                        accept. Unique PER OWNER (owner_id, auth_user_id), not
--                        globally: one person may legitimately keep for several
--                        owners with a single login.
--   invite_email_failed  set by the invite API when the provider rejected the
--                        email, so the owner can resend from the keepers page.
--
-- Security model
--   * The raw invite token exists only in the emailed link. Only its SHA-256
--     hash is stored, and there is NO public SELECT policy: the public invite
--     page resolves a token through SECURITY DEFINER functions below.
--   * RLS: owners read/insert/update their own keepers; a keeper reads and
--     updates their own row. There is no DELETE policy on purpose: keepers are
--     revoked (soft), which keeps the audit trail for keeper_confirmations.
--   * RLS cannot restrict columns, so keepers_guard() does: clients cannot
--     forge `accepted`, `auth_user_id` or `public_key` as an owner, and a keeper
--     can change nothing but their own public_key. SECURITY DEFINER functions
--     run as the table owner (current_user is not authenticated/anon) and skip
--     the guard; they are the only way to accept/decline.
--   * Revoking removes that keeper's wrapped DEK from vaults immediately
--     (keepers_revoke_cleanup trigger), in the same transaction.
--   * Policies on this table reference only its own columns. Other tables'
--     policies reference keepers; keeping it leaf-level avoids Postgres'
--     "infinite recursion detected in policy" error.

create table if not exists public.keepers (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references public.profiles (id) on delete cascade,
  auth_user_id         uuid references auth.users (id) on delete set null,
  name                 text not null,
  email                text not null,
  relationship         text,
  status               text not null default 'invited',
  invite_token_hash    text,
  invite_expires_at    timestamptz,
  invite_email_failed  boolean not null default false,
  -- Base64 SPKI of the keeper's ECDH P-256 public key (design-doc §5.3).
  public_key           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint keepers_status_check
    check (status in ('invited', 'accepted', 'declined', 'revoked')),
  constraint keepers_name_check check (char_length(name) between 1 and 100),
  constraint keepers_email_check check (position('@' in email) > 1 and char_length(email) <= 254),
  constraint keepers_relationship_check
    check (relationship is null or char_length(relationship) <= 100),
  constraint keepers_owner_auth_user_key unique (owner_id, auth_user_id)
);

-- One live (invited/accepted) keeper per owner per email address.
create unique index if not exists keepers_one_live_per_email
  on public.keepers (owner_id, lower(email))
  where status in ('invited', 'accepted');

create unique index if not exists keepers_invite_token_hash_key
  on public.keepers (invite_token_hash)
  where invite_token_hash is not null;

create index if not exists keepers_owner_idx on public.keepers (owner_id);
create index if not exists keepers_auth_user_idx on public.keepers (auth_user_id);

alter table public.keepers enable row level security;

create policy "keepers: owner or keeper can select"
  on public.keepers
  for select
  using (auth.uid() = owner_id or auth.uid() = auth_user_id);

create policy "keepers: owner can insert"
  on public.keepers
  for insert
  with check (auth.uid() = owner_id);

create policy "keepers: owner or keeper can update"
  on public.keepers
  for update
  using (auth.uid() = owner_id or auth.uid() = auth_user_id)
  with check (auth.uid() = owner_id or auth.uid() = auth_user_id);

create trigger keepers_set_updated_at
  before update on public.keepers
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- Column-level guard for direct client writes
-- ============================================================
create or replace function public.keepers_guard()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  -- Direct client access arrives as `authenticated`/`anon`. SECURITY DEFINER
  -- functions (accept/decline) and service connections do not, and pass.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'invited' or new.auth_user_id is not null or new.public_key is not null then
      raise exception 'keepers: new keepers must be created as plain invites'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.id <> old.id or new.owner_id <> old.owner_id
     or new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'keepers: identity columns are immutable' using errcode = '42501';
  end if;

  if auth.uid() = old.owner_id then
    -- Owner: may revoke, edit/resend a pending invite. Cannot forge acceptance
    -- or a public key.
    if new.public_key is distinct from old.public_key then
      raise exception 'keepers: only the keeper can set their public key' using errcode = '42501';
    end if;
    if new.status is distinct from old.status and new.status <> 'revoked' then
      raise exception 'keepers: owners can only revoke' using errcode = '42501';
    end if;
    if old.status in ('revoked', 'declined') and new.status is distinct from old.status then
      raise exception 'keepers: this keeper is closed; invite them again instead'
        using errcode = '42501';
    end if;
    if new.email is distinct from old.email and old.status <> 'invited' then
      raise exception 'keepers: email can only change while the invite is pending'
        using errcode = '42501';
    end if;
    if new.status = 'revoked' then
      new.invite_token_hash := null;
      new.invite_expires_at := null;
    end if;
    return new;
  end if;

  if auth.uid() = old.auth_user_id then
    -- Keeper: only their own public key, and only while accepted.
    if old.status <> 'accepted'
       or new.status is distinct from old.status
       or new.name is distinct from old.name
       or new.email is distinct from old.email
       or new.relationship is distinct from old.relationship
       or new.invite_token_hash is distinct from old.invite_token_hash
       or new.invite_expires_at is distinct from old.invite_expires_at
       or new.invite_email_failed is distinct from old.invite_email_failed then
      raise exception 'keepers: keepers can only update their own public key'
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'keepers: not allowed' using errcode = '42501';
end;
$$;

create trigger keepers_guard
  before insert or update on public.keepers
  for each row
  execute function public.keepers_guard();

-- ============================================================
-- Revoke => the keeper's wrapped DEK disappears immediately
-- ============================================================
create or replace function public.keepers_revoke_cleanup()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  update public.vaults v
     set wrapped_dek_for_keepers = coalesce(
           (select jsonb_agg(e)
              from jsonb_array_elements(v.wrapped_dek_for_keepers) as e
             where e ->> 'keeper_id' is distinct from old.id::text),
           '[]'::jsonb)
   where v.owner_id = old.owner_id;
  return new;
end;
$$;

create trigger keepers_revoke_cleanup
  after update of status on public.keepers
  for each row
  when (new.status = 'revoked' and old.status is distinct from 'revoked')
  execute function public.keepers_revoke_cleanup();

-- ============================================================
-- Public invite lookup (no public SELECT policy exists)
-- ============================================================
-- Callable by anonymous visitors holding the token. Returns only what the
-- invite page needs. An unknown/consumed hash returns zero rows.
create or replace function public.get_keeper_invite(p_token_hash text)
  returns table (
    keeper_id     uuid,
    keeper_name   text,
    keeper_email  text,
    owner_name    text,
    status        text,
    expired       boolean
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select k.id,
         k.name,
         k.email,
         p.display_name,
         k.status,
         (k.invite_expires_at is null or k.invite_expires_at < now())
    from public.keepers k
    join public.profiles p on p.id = k.owner_id
   where p_token_hash is not null
     and k.invite_token_hash = p_token_hash
     and k.status = 'invited';
$$;

revoke all on function public.get_keeper_invite(text) from public;
grant execute on function public.get_keeper_invite(text) to anon, authenticated;

-- ============================================================
-- Accept: signed-in keeper whose login email matches the invite
-- ============================================================
create or replace function public.accept_keeper_invite(p_token_hash text, p_public_key text)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_keeper public.keepers%rowtype;
  v_email  text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_public_key is null or char_length(p_public_key) not between 80 and 400 then
    raise exception 'invalid_public_key' using errcode = '22023';
  end if;

  select * into v_keeper
    from public.keepers
   where invite_token_hash = p_token_hash and status = 'invited'
   for update;
  if not found or v_keeper.invite_expires_at is null or v_keeper.invite_expires_at < now() then
    raise exception 'invite_invalid' using errcode = 'P0002';
  end if;
  -- The account must belong to the invited address; a leaked link alone is not enough.
  if v_email = '' or v_email <> lower(v_keeper.email) then
    raise exception 'invite_email_mismatch' using errcode = '42501';
  end if;

  update public.keepers
     set status = 'accepted',
         auth_user_id = auth.uid(),
         public_key = p_public_key,
         invite_token_hash = null,        -- single use
         invite_expires_at = null,
         invite_email_failed = false
   where id = v_keeper.id;

  insert into public.notifications (owner_id, kind, due_date, payload)
  values (
    v_keeper.owner_id,
    'keeper_accepted_' || replace(v_keeper.id::text, '-', ''),
    (now() at time zone 'utc')::date,
    jsonb_build_object('keeper_id', v_keeper.id, 'keeper_name', v_keeper.name)
  )
  on conflict (owner_id, kind, due_date) do nothing;

  return v_keeper.id;
end;
$$;

revoke all on function public.accept_keeper_invite(text, text) from public, anon;
grant execute on function public.accept_keeper_invite(text, text) to authenticated;

-- ============================================================
-- Decline: possession of the token is enough (no account needed)
-- ============================================================
create or replace function public.decline_keeper_invite(p_token_hash text)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_keeper public.keepers%rowtype;
begin
  select * into v_keeper
    from public.keepers
   where invite_token_hash = p_token_hash and status = 'invited'
   for update;
  if not found then
    return false;
  end if;

  update public.keepers
     set status = 'declined',
         invite_token_hash = null,
         invite_expires_at = null
   where id = v_keeper.id;

  insert into public.notifications (owner_id, kind, due_date, payload)
  values (
    v_keeper.owner_id,
    'keeper_declined_' || replace(v_keeper.id::text, '-', ''),
    (now() at time zone 'utc')::date,
    jsonb_build_object('keeper_id', v_keeper.id, 'keeper_name', v_keeper.name)
  )
  on conflict (owner_id, kind, due_date) do nothing;

  return true;
end;
$$;

revoke all on function public.decline_keeper_invite(text) from public;
grant execute on function public.decline_keeper_invite(text) to anon, authenticated;
