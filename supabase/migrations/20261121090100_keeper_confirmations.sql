-- Migration: keeper_confirmations + release decision functions (Spec 4,
-- tasks 1.3 / 3.3; design-doc §4.7, §6).
--
-- The release process row itself (release_processes) was created in Spec 3.
-- This migration adds:
--   * keeper SELECT access to release_processes (the release decision page);
--   * keeper_confirmations (one decision per keeper per release);
--   * record_keeper_decision(): the ONLY way a release becomes `released`;
--   * helpers for the keeper release page, e-mail fan-out and in-app inbox.
--
-- RLS tradeoff (handoff fix 3): release_processes still lets an OWNER insert an
-- `awaiting_keepers` row for themselves, because the demo-clock tick runs as the
-- owner. That cannot cause a false release: record_keeper_decision() releases
-- only while heartbeat_settings.state is AWAITING_KEEPERS (which an owner can
-- only reach through ALIVE -> OVERDUE -> AWAITING_KEEPERS, see the guard in
-- 20261121090200) AND two distinct accepted keepers confirmed. The worst an
-- owner can do with a forged open process is notify their own keepers early,
-- and any keeper can answer "false alarm". Owners still cannot write `released`.

-- ============================================================
-- Keepers can see their owner's release process
-- ============================================================
create policy "release_processes: keeper can select"
  on public.release_processes
  for select
  using (
    exists (
      select 1
        from public.keepers k
       where k.owner_id = release_processes.owner_id
         and k.auth_user_id = auth.uid()
         and k.status = 'accepted'
    )
  );

-- ============================================================
-- keeper_confirmations
-- ============================================================
create table if not exists public.keeper_confirmations (
  id            uuid primary key default gen_random_uuid(),
  release_id    uuid not null references public.release_processes (id) on delete cascade,
  keeper_id     uuid not null references public.keepers (id) on delete cascade,
  decision      text not null,
  confirmed_at  timestamptz not null default now(),
  note          text,
  constraint keeper_confirmations_decision_check
    check (decision in ('confirm', 'false_alarm')),
  constraint keeper_confirmations_note_check
    check (note is null or char_length(note) <= 500),
  -- One decision per keeper per release (requirement 10).
  constraint keeper_confirmations_release_keeper_key unique (release_id, keeper_id)
);

create index if not exists keeper_confirmations_release_idx
  on public.keeper_confirmations (release_id);

alter table public.keeper_confirmations enable row level security;

-- Owner sees the live count for their own release.
create policy "keeper_confirmations: owner can select"
  on public.keeper_confirmations
  for select
  using (
    exists (
      select 1
        from public.release_processes rp
       where rp.id = keeper_confirmations.release_id
         and rp.owner_id = auth.uid()
    )
  );

-- Involved (accepted) keepers see the decisions on their owner's release.
create policy "keeper_confirmations: involved keeper can select"
  on public.keeper_confirmations
  for select
  using (
    exists (
      select 1
        from public.release_processes rp
        join public.keepers k on k.owner_id = rp.owner_id
       where rp.id = keeper_confirmations.release_id
         and k.auth_user_id = auth.uid()
         and k.status = 'accepted'
    )
  );

-- NO insert/update/delete policies: decisions are written only by
-- record_keeper_decision() (SECURITY DEFINER), which checks the caller is the
-- keeper and the release is open.

-- ============================================================
-- record_keeper_decision — transactional, row-locked
-- ============================================================
-- outcome values:
--   recorded         confirmation stored; more confirmations needed
--   released         this confirmation completed the release
--   cancelled        false alarm: release cancelled, owner back to ALIVE
--   already_decided  this keeper already decided on this release
--   not_open         the release is not awaiting keepers (state returned)
--
-- Mirrors lib/heartbeat/state-machine.ts (invariants 3 and 4); the TS machine
-- is the tested specification, this is its transactional persistence.
create or replace function public.record_keeper_decision(
  p_release_id uuid,
  p_keeper_id  uuid,
  p_decision   text,
  p_note       text default null
)
  returns table (
    outcome                text,
    release_state          text,
    confirmations          int,
    required_confirmations int
  )
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_keeper  public.keepers%rowtype;
  v_rel     public.release_processes%rowtype;
  v_hb      public.heartbeat_settings%rowtype;
  v_count   int;
  v_now     timestamptz := now();
  v_tz      text;
  v_offset  interval;
  v_fresh   timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_decision is null or p_decision not in ('confirm', 'false_alarm') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  -- The caller must BE this keeper, and be accepted (revoked keepers are out).
  select * into v_keeper from public.keepers where id = p_keeper_id;
  if not found or v_keeper.auth_user_id is distinct from auth.uid()
     or v_keeper.status <> 'accepted' then
    raise exception 'not_a_keeper' using errcode = '42501';
  end if;

  -- Serialise every decision on this release: two simultaneous confirms queue
  -- here, so exactly one of them observes count >= required and flips it.
  select * into v_rel from public.release_processes where id = p_release_id for update;
  if not found or v_rel.owner_id <> v_keeper.owner_id then
    raise exception 'not_a_keeper' using errcode = '42501';
  end if;

  select count(distinct c.keeper_id)::int into v_count
    from public.keeper_confirmations c
    join public.keepers k on k.id = c.keeper_id
   where c.release_id = v_rel.id and c.decision = 'confirm' and k.status = 'accepted';

  if v_rel.state <> 'awaiting_keepers' then
    return query select 'not_open'::text, v_rel.state, v_count, v_rel.required_confirmations;
    return;
  end if;

  begin
    insert into public.keeper_confirmations (release_id, keeper_id, decision, note, confirmed_at)
    values (v_rel.id, v_keeper.id, p_decision, nullif(left(btrim(coalesce(p_note, '')), 500), ''), v_now);
  exception when unique_violation then
    return query select 'already_decided'::text, v_rel.state, v_count, v_rel.required_confirmations;
    return;
  end;

  select * into v_hb from public.heartbeat_settings where owner_id = v_rel.owner_id for update;

  if p_decision = 'false_alarm' then
    -- Invariant 4: one false alarm cancels, even if the other keeper confirmed.
    update public.release_processes
       set state = 'cancelled_false_alarm',
           cancelled_at = v_now,
           cancel_reason = 'keeper_false_alarm'
     where id = v_rel.id;

    if v_hb.state = 'AWAITING_KEEPERS' then
      select coalesce(p.timezone, 'Asia/Jakarta'), greatest(coalesce(p.demo_time_offset, interval '0'), interval '0')
        into v_tz, v_offset
        from public.profiles p where p.id = v_rel.owner_id;
      -- Same arithmetic as computeNextDue(): calendar days in the owner's zone,
      -- measured from the owner's (demo-offset) "now"; never moves backwards.
      v_fresh := (((v_now + v_offset) at time zone v_tz) + (v_hb.cadence_days * interval '1 day')) at time zone v_tz;
      update public.heartbeat_settings
         set state = 'ALIVE',
             next_checkin_due = greatest(v_hb.next_checkin_due, v_fresh),
             state_changed_at = v_now
       where owner_id = v_rel.owner_id;
    end if;

    insert into public.notifications (owner_id, kind, due_date, payload)
    select t.uid,
           'false_alarm_' || replace(v_rel.id::text, '-', ''),
           (v_now at time zone 'utc')::date,
           jsonb_build_object('release_id', v_rel.id, 'owner_id', v_rel.owner_id)
      from (
        select v_rel.owner_id as uid
        union
        select k.auth_user_id from public.keepers k
         where k.owner_id = v_rel.owner_id and k.status = 'accepted' and k.auth_user_id is not null
      ) t
    on conflict (owner_id, kind, due_date) do nothing;

    return query select 'cancelled'::text, 'cancelled_false_alarm'::text, v_count, v_rel.required_confirmations;
    return;
  end if;

  -- decision = 'confirm'
  v_count := v_count + 1;

  -- Invariant 3: release only with enough distinct accepted confirmations, and
  -- only while the owner's heartbeat really is AWAITING_KEEPERS (grace expired).
  if v_count >= v_rel.required_confirmations and v_hb.state = 'AWAITING_KEEPERS' then
    update public.release_processes
       set state = 'released', released_at = v_now
     where id = v_rel.id;

    -- Runs as the function owner, which the heartbeat_settings guard treats as
    -- privileged: this is the only path that may write RELEASED.
    update public.heartbeat_settings
       set state = 'RELEASED', state_changed_at = v_now
     where owner_id = v_rel.owner_id;

    -- Hook point for Spec 5: deliver last letters to keepers here (or in the
    -- API route right after this returns 'released').

    insert into public.notifications (owner_id, kind, due_date, payload)
    select t.uid,
           'released_' || replace(v_rel.id::text, '-', ''),
           (v_now at time zone 'utc')::date,
           jsonb_build_object('release_id', v_rel.id, 'owner_id', v_rel.owner_id)
      from (
        select v_rel.owner_id as uid
        union
        select k.auth_user_id from public.keepers k
         where k.owner_id = v_rel.owner_id and k.status = 'accepted' and k.auth_user_id is not null
      ) t
    on conflict (owner_id, kind, due_date) do nothing;

    return query select 'released'::text, 'released'::text, v_count, v_rel.required_confirmations;
    return;
  end if;

  return query select 'recorded'::text, v_rel.state, v_count, v_rel.required_confirmations;
end;
$$;

revoke all on function public.record_keeper_decision(uuid, uuid, text, text) from public, anon;
grant execute on function public.record_keeper_decision(uuid, uuid, text, text) to authenticated;

-- ============================================================
-- Context for the keeper release page (owner name is not readable under
-- profiles RLS, so this definer function exposes exactly what the page needs).
-- ============================================================
create or replace function public.get_release_context(p_release_id uuid)
  returns table (
    owner_name             text,
    keeper_id              uuid,
    release_state          text,
    triggered_at           timestamptz,
    released_at            timestamptz,
    required_confirmations int,
    confirmations          int,
    my_decision            text,
    last_checkin_at        timestamptz,
    as_of                  timestamptz
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select p.display_name,
         k.id,
         rp.state,
         rp.triggered_at,
         rp.released_at,
         rp.required_confirmations,
         (select count(distinct c.keeper_id)::int
            from public.keeper_confirmations c
            join public.keepers kk on kk.id = c.keeper_id
           where c.release_id = rp.id and c.decision = 'confirm' and kk.status = 'accepted'),
         (select c.decision from public.keeper_confirmations c
           where c.release_id = rp.id and c.keeper_id = k.id),
         (select max(ci.checked_in_at) from public.checkins ci where ci.owner_id = rp.owner_id),
         -- The owner's own notion of "now" (demo offset applied); equals now() for real accounts.
         now() + greatest(coalesce(p.demo_time_offset, interval '0'), interval '0')
    from public.release_processes rp
    join public.keepers k on k.owner_id = rp.owner_id
    join public.profiles p on p.id = rp.owner_id
   where rp.id = p_release_id
     and k.auth_user_id = auth.uid()
     and k.status = 'accepted';
$$;

revoke all on function public.get_release_context(uuid) from public, anon;
grant execute on function public.get_release_context(uuid) to authenticated;

-- ============================================================
-- Who gets an e-mail about this release (server-side only; never sent to a
-- browser). Callable by the owner or an accepted keeper of this release.
-- ============================================================
create or replace function public.release_party_emails(p_release_id uuid)
  returns table (party_role text, party_name text, party_email text)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.release_processes where id = p_release_id;
  if v_owner is null then
    return;
  end if;
  if auth.uid() is distinct from v_owner and not exists (
    select 1 from public.keepers k
     where k.owner_id = v_owner and k.auth_user_id = auth.uid() and k.status = 'accepted'
  ) then
    return;
  end if;

  return query
    select 'owner'::text, p.display_name, u.email::text
      from public.profiles p join auth.users u on u.id = p.id
     where p.id = v_owner
    union all
    select 'keeper'::text, k.name, k.email
      from public.keepers k
     where k.owner_id = v_owner and k.status = 'accepted';
end;
$$;

revoke all on function public.release_party_emails(uuid) from public, anon;
grant execute on function public.release_party_emails(uuid) to authenticated;

-- ============================================================
-- In-app "release pending" inbox rows for each accepted keeper.
-- Called when the release opens: by the demo tick (as the owner) or by the
-- heartbeat-tick Edge Function (direct DB connection, auth.uid() is null).
-- ============================================================
create or replace function public.notify_release_pending(p_release_id uuid)
  returns int
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_owner uuid;
  v_count int;
begin
  select owner_id into v_owner from public.release_processes where id = p_release_id;
  if v_owner is null then
    return 0;
  end if;
  if auth.uid() is not null and auth.uid() <> v_owner then
    raise exception 'not_the_owner' using errcode = '42501';
  end if;

  insert into public.notifications (owner_id, kind, due_date, payload)
  select k.auth_user_id,
         'release_pending_' || replace(p_release_id::text, '-', ''),
         (now() at time zone 'utc')::date,
         jsonb_build_object('release_id', p_release_id, 'owner_id', v_owner)
    from public.keepers k
   where k.owner_id = v_owner and k.status = 'accepted' and k.auth_user_id is not null
  on conflict (owner_id, kind, due_date) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.notify_release_pending(uuid) from public, anon;
grant execute on function public.notify_release_pending(uuid) to authenticated;

-- Keepers read their own inbox rows through the existing owner-scoped
-- notifications policies (notifications.owner_id = the recipient's auth id).
