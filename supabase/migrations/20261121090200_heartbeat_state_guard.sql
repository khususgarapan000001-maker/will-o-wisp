-- Migration: heartbeat_settings state guard (Spec 4, handoff fix 2)
--
-- PROBLEM: the "owner can update" RLS policy on heartbeat_settings let an owner
-- write ANY state, including RELEASED, i.e. fake their own release.
--
-- RULE (mirrored in lib/heartbeat/transition-rules.ts and unit-tested against
-- the pure state machine in tests/unit/heartbeat-transition-rules.test.ts):
--
--   ALIVE            -> OVERDUE
--   OVERDUE          -> AWAITING_KEEPERS
--   any non-terminal -> ALIVE         (check-in, false-alarm cancel)
--   AWAITING_KEEPERS -> RELEASED      PRIVILEGED ONLY
--   RELEASED         -> (nothing)     terminal for everyone
--   same state       -> same state    allowed (cadence/grace edits, etc.)
--   INSERT           must start ALIVE unless privileged (seed scripts)
--
-- "Privileged" = the service role (auth.role() = 'service_role', i.e. the
-- Edge Function / seed scripts) OR any execution context whose current_user is
-- not `authenticated`/`anon`. The second clause is what lets the SECURITY
-- DEFINER function record_keeper_decision() flip to RELEASED: auth.role() is
-- read from the REQUEST's JWT claims, so inside the function it still says
-- 'authenticated' (the keeper); but current_user is the function owner
-- (postgres). Direct PostgREST calls from a signed-in user always run with
-- current_user = 'authenticated' and are never privileged.
--
-- Owner-driven demo-tick transitions (ALIVE -> OVERDUE -> AWAITING_KEEPERS) and
-- check-in rescues are all in the allowed set, so the demo flow is unaffected.

create or replace function public.heartbeat_settings_guard()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_privileged boolean :=
    coalesce(auth.role(), '') = 'service_role'
    or current_user not in ('authenticated', 'anon');
begin
  if tg_op = 'INSERT' then
    if new.state <> 'ALIVE' and not v_privileged then
      raise exception 'heartbeat_settings: a new heartbeat must start ALIVE'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.state is not distinct from old.state then
    return new;
  end if;

  if old.state = 'RELEASED' then
    raise exception 'heartbeat_settings: RELEASED is terminal' using errcode = '42501';
  end if;

  if new.state = 'RELEASED' then
    if not v_privileged or old.state <> 'AWAITING_KEEPERS' then
      raise exception 'heartbeat_settings: only a confirmed keeper release can set RELEASED'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.state = 'ALIVE'
     or (old.state = 'ALIVE' and new.state = 'OVERDUE')
     or (old.state = 'OVERDUE' and new.state = 'AWAITING_KEEPERS') then
    return new;
  end if;

  raise exception 'heartbeat_settings: illegal transition % -> %', old.state, new.state
    using errcode = '42501';
end;
$$;

create trigger heartbeat_settings_guard
  before insert or update on public.heartbeat_settings
  for each row
  execute function public.heartbeat_settings_guard();
