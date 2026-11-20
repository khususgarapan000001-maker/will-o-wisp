-- Migration: release_processes (Spec 3, minimal; design-doc §4.6)
-- Created by the heartbeat tick when the grace period expires. `keepers` and
-- `keeper_confirmations` belong to Spec 4 and are NOT created here.
--
-- RLS (the owner's session must be able to cancel on check-in, and the demo
-- clock tick runs as the owner), but an owner can never mark a release as
-- "released":
--   * SELECT: own rows.
--   * INSERT: own rows, only as state = 'awaiting_keepers', unreleased.
--   * UPDATE: own rows that are still 'awaiting_keepers', and only into
--     'cancelled_false_alarm'. Moving to 'released' / 'expired' is reserved for
--     the service role (Spec 4 confirmation flow, cron).
-- At most one open (awaiting_keepers) process per owner.

create table if not exists public.release_processes (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null references public.profiles (id) on delete cascade,
  triggered_at           timestamptz not null,
  state                  text not null default 'awaiting_keepers',
  required_confirmations int  not null default 2,
  released_at            timestamptz,
  cancelled_at           timestamptz,
  cancel_reason          text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint release_processes_state_check
    check (state in ('awaiting_keepers', 'released', 'cancelled_false_alarm', 'expired')),
  constraint release_processes_required_check
    check (required_confirmations >= 1)
);

create unique index if not exists release_processes_one_open_per_owner
  on public.release_processes (owner_id)
  where state = 'awaiting_keepers';

create index if not exists release_processes_owner_idx
  on public.release_processes (owner_id, triggered_at desc);

alter table public.release_processes enable row level security;

create policy "release_processes: owner can select"
  on public.release_processes
  for select
  using (auth.uid() = owner_id);

create policy "release_processes: owner can open awaiting"
  on public.release_processes
  for insert
  with check (
    auth.uid() = owner_id
    and state = 'awaiting_keepers'
    and released_at is null
  );

create policy "release_processes: owner can cancel own open process"
  on public.release_processes
  for update
  using (auth.uid() = owner_id and state = 'awaiting_keepers')
  with check (auth.uid() = owner_id and state = 'cancelled_false_alarm');

create trigger release_processes_set_updated_at
  before update on public.release_processes
  for each row
  execute function public.set_updated_at();
