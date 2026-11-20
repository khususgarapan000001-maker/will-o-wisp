-- Migration: will delivery (Spec 6, tasks 1.1 / 3.x)
--
-- Same shape as 20261121100100_letters_delivery.sql and the same reasons:
--   * a dedicated SECURITY DEFINER trigger on release_processes, NOT an edit to
--     record_keeper_decision() (the audited, row-locked release path stays
--     untouched);
--   * it fires inside the transaction that flips to `released`, so delivery is
--     atomic with the release;
--   * it fires only on the transition INTO `released` (never for `recorded`,
--     `cancelled` or `already_decided`, and never twice for one release).
--
-- Delivery is a NOTIFICATION, not a data flip. will_items need no delivered_at:
-- the keeper RLS policy already opens the checklist to accepted keepers once a
-- `released` release exists. This trigger writes one in-app notice per ACCEPTED
-- keeper, and only when the owner has at least one will item. Kind
-- will_delivered_<release id without dashes> (the same `<prefix>_<id>` pattern
-- that avoids the (owner_id, kind, due_date) unique-key collision); `on
-- conflict do nothing` makes it idempotent. `sent_at` / `attempts` on that row
-- are the EMAIL record only; the in-app notice does not depend on them.

create or replace function public.deliver_will_on_release()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  if not exists (select 1 from public.will_items w where w.owner_id = new.owner_id) then
    return new;
  end if;

  insert into public.notifications (owner_id, kind, due_date, payload)
  select k.auth_user_id,
         'will_delivered_' || replace(new.id::text, '-', ''),
         (v_now at time zone 'utc')::date,
         jsonb_build_object(
           'release_id', new.id,
           'owner_id', new.owner_id,
           'keeper_id', k.id
         )
    from public.keepers k
   where k.owner_id = new.owner_id
     and k.status = 'accepted'
     and k.auth_user_id is not null
  on conflict (owner_id, kind, due_date) do nothing;

  return new;
end;
$$;

revoke all on function public.deliver_will_on_release() from public, anon, authenticated;

create trigger release_processes_deliver_will
  after update of state on public.release_processes
  for each row
  when (new.state = 'released' and old.state is distinct from 'released')
  execute function public.deliver_will_on_release();

-- ============================================================
-- Nobody can forge a will notification from a client
-- ============================================================
-- notifications has an owner insert/update policy (the heartbeat demo tick
-- writes as the owner). Without this, any signed-in user could write a
-- will_delivered_* row for themselves and trigger a "your will is ready" email.
-- Only the delivery trigger above (current_user is not authenticated/anon) may
-- create that kind.
create or replace function public.notifications_will_kind_guard()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.kind like 'will\_delivered\_%'
     and (tg_op = 'INSERT' or new.kind is distinct from old.kind) then
    raise exception 'notifications: will_delivered is written by the release only' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger notifications_will_kind_guard
  before insert or update of kind on public.notifications
  for each row
  execute function public.notifications_will_kind_guard();

-- ============================================================
-- What a keeper needs to label transfer assignments
-- ============================================================
-- keepers RLS lets a keeper see only their OWN row, so the keeper view cannot
-- read who another keeper is. This returns just id, name and whether they are
-- still accepted (never an e-mail address), to an accepted keeper of a
-- RELEASED release. `available = false` drives the "keeper no longer
-- available" flag.
create or replace function public.will_transfer_keepers(p_release_id uuid)
  returns table (keeper_id uuid, keeper_name text, available boolean)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_owner uuid;
  v_state text;
begin
  select owner_id, state into v_owner, v_state
    from public.release_processes where id = p_release_id;
  if v_owner is null or v_state <> 'released' then
    return;
  end if;
  if not exists (
    select 1 from public.keepers k
     where k.owner_id = v_owner and k.auth_user_id = auth.uid() and k.status = 'accepted'
  ) then
    return;
  end if;

  return query
    select k.id, k.name, (k.status = 'accepted')
      from public.keepers k
     where k.owner_id = v_owner
       and k.id in (select w.transfer_to_keeper_id
                      from public.will_items w
                     where w.owner_id = v_owner and w.transfer_to_keeper_id is not null);
end;
$$;

revoke all on function public.will_transfer_keepers(uuid) from public, anon;
grant execute on function public.will_transfer_keepers(uuid) to authenticated;

-- ============================================================
-- Delivery e-mails still to send (link only; never any will content)
-- ============================================================
-- Callable by the owner or an accepted keeper of a RELEASED release. Returns
-- only a name and an address: no service names, wishes or notes.
create or replace function public.pending_will_emails(p_release_id uuid)
  returns table (keeper_id uuid, keeper_name text, keeper_email text)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_owner uuid;
  v_state text;
begin
  select owner_id, state into v_owner, v_state
    from public.release_processes where id = p_release_id;
  if v_owner is null or v_state <> 'released' then
    return;
  end if;
  if auth.uid() is distinct from v_owner and not exists (
    select 1 from public.keepers k
     where k.owner_id = v_owner and k.auth_user_id = auth.uid() and k.status = 'accepted'
  ) then
    return;
  end if;

  return query
    select k.id, k.name, k.email
      from public.notifications n
      join public.keepers k on k.auth_user_id = n.owner_id and k.owner_id = v_owner
     where n.kind = 'will_delivered_' || replace(p_release_id::text, '-', '')
       and n.sent_at is null
       and n.attempts < 3
       and k.status = 'accepted';
end;
$$;

revoke all on function public.pending_will_emails(uuid) from public, anon;
grant execute on function public.pending_will_emails(uuid) to authenticated;

-- Records one e-mail attempt. A failed send leaves sent_at null with attempts
-- incremented, which is exactly what pending_will_emails() selects for the next
-- retry (max 3, then left for manual review).
create or replace function public.record_will_email_attempt(
  p_release_id uuid,
  p_keeper_id  uuid,
  p_ok         boolean
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner
    from public.release_processes where id = p_release_id and state = 'released';
  if v_owner is null then
    return;
  end if;
  if auth.uid() is distinct from v_owner and not exists (
    select 1 from public.keepers k
     where k.owner_id = v_owner and k.auth_user_id = auth.uid() and k.status = 'accepted'
  ) then
    return;
  end if;

  update public.notifications n
     set attempts = n.attempts + 1,
         sent_at = case when p_ok then now() else n.sent_at end
    from public.keepers k
   where k.id = p_keeper_id
     and k.owner_id = v_owner
     and n.owner_id = k.auth_user_id
     and n.kind = 'will_delivered_' || replace(p_release_id::text, '-', '')
     and n.sent_at is null;
end;
$$;

revoke all on function public.record_will_email_attempt(uuid, uuid, boolean) from public, anon;
grant execute on function public.record_will_email_attempt(uuid, uuid, boolean) to authenticated;
