-- Migration: letters delivery (Spec 5, tasks 3.1 / 3.2)
--
-- DESIGN CHOICE: a dedicated SECURITY DEFINER trigger on release_processes,
-- NOT an edit to record_keeper_decision(). Reasons:
--   * record_keeper_decision() is the audited, row-locked release path; this
--     leaves its body byte-for-byte untouched.
--   * The trigger fires inside the same transaction as the flip to `released`
--     (the function's UPDATE of release_processes), so delivery is atomic with
--     the release: either both commit or neither does.
--   * It fires only on the transition INTO `released`, so it cannot run for
--     `recorded`, `cancelled` or `already_decided` outcomes, and cannot run
--     twice for one release.
-- The "Hook point for Spec 5" comment in record_keeper_decision() therefore
-- stays a comment; delivery happens here.
--
-- Rules applied on delivery (all re-checked at release time):
--   * only `final` letters (drafts are never delivered);
--   * only to a recipient keeper whose status is STILL `accepted` (a keeper
--     revoked before the release gets nothing);
--   * idempotent: letters already delivered are skipped.
--
-- In-app notification: one row per receiving keeper, kind
-- letter_delivered_<release id without dashes> (same pattern as released_<id>,
-- avoids the (owner_id, kind, due_date) collision). `sent_at` is the EMAIL
-- delivery record for that row (null until the provider accepted the message,
-- `attempts` bounds retries) — the in-app delivery does not depend on it.

create or replace function public.deliver_letters_on_release()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  with delivered as (
    update public.letters l
       set delivered_at = v_now
      from public.keepers k
     where l.owner_id = new.owner_id
       and l.status = 'final'
       and l.delivered_at is null
       and k.id = l.recipient_keeper_id
       and k.owner_id = l.owner_id
       and k.status = 'accepted'
    returning l.recipient_keeper_id
  ),
  per_keeper as (
    select recipient_keeper_id, count(*)::int as letter_count
      from delivered
     group by recipient_keeper_id
  )
  insert into public.notifications (owner_id, kind, due_date, payload)
  select k.auth_user_id,
         'letter_delivered_' || replace(new.id::text, '-', ''),
         (v_now at time zone 'utc')::date,
         jsonb_build_object(
           'release_id', new.id,
           'owner_id', new.owner_id,
           'keeper_id', k.id,
           'letter_count', pk.letter_count
         )
    from per_keeper pk
    join public.keepers k on k.id = pk.recipient_keeper_id
   where k.auth_user_id is not null
  on conflict (owner_id, kind, due_date) do nothing;

  return new;
end;
$$;

revoke all on function public.deliver_letters_on_release() from public, anon, authenticated;

create trigger release_processes_deliver_letters
  after update of state on public.release_processes
  for each row
  when (new.state = 'released' and old.state is distinct from 'released')
  execute function public.deliver_letters_on_release();

-- ============================================================
-- Delivery e-mails still to send (link only; never any letter content)
-- ============================================================
-- Callable by the owner or an accepted keeper of a RELEASED release. Returns
-- only a name, an address and a count: nothing from the letters themselves.
create or replace function public.pending_letter_emails(p_release_id uuid)
  returns table (keeper_id uuid, keeper_name text, keeper_email text, letter_count int)
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
    select k.id, k.name, k.email, coalesce((n.payload ->> 'letter_count')::int, 0)
      from public.notifications n
      join public.keepers k on k.auth_user_id = n.owner_id and k.owner_id = v_owner
     where n.kind = 'letter_delivered_' || replace(p_release_id::text, '-', '')
       and n.sent_at is null
       and n.attempts < 3
       and k.status = 'accepted';
end;
$$;

revoke all on function public.pending_letter_emails(uuid) from public, anon;
grant execute on function public.pending_letter_emails(uuid) to authenticated;

-- Records one e-mail attempt. A failed send leaves sent_at null with attempts
-- incremented, which is exactly what pending_letter_emails() selects for the
-- next retry (max 3, then left for manual review — same bound as reminders).
create or replace function public.record_letter_email_attempt(
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
     and n.kind = 'letter_delivered_' || replace(p_release_id::text, '-', '')
     and n.sent_at is null;
end;
$$;

revoke all on function public.record_letter_email_attempt(uuid, uuid, boolean) from public, anon;
grant execute on function public.record_letter_email_attempt(uuid, uuid, boolean) to authenticated;
