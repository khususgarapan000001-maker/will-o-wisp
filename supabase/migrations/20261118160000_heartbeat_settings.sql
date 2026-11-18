-- Migration: heartbeat_settings
-- Creates the heartbeat_settings table (design-doc §4.3) with RLS.
-- State machine states and transitions are enforced in application code
-- (lib/heartbeat/state-machine.ts); the DB stores state as text for
-- flexibility during the hackathon build.

-- ============================================================
-- heartbeat_settings table
-- ============================================================
create table if not exists public.heartbeat_settings (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null unique references public.profiles (id) on delete cascade,
  cadence_days           int  not null default 14,
  grace_days             int  not null default 14,
  reminder_days_before   int[] not null default '{3,1}',
  next_checkin_due       timestamptz not null,
  state                  text not null default 'ALIVE',
  state_changed_at       timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint heartbeat_settings_cadence_check
    check (cadence_days in (7, 14, 30)),
  constraint heartbeat_settings_grace_check
    check (grace_days in (7, 14, 30)),
  constraint heartbeat_settings_state_check
    check (state in ('ALIVE', 'OVERDUE', 'AWAITING_KEEPERS', 'RELEASED'))
);

-- ============================================================
-- Row-level security
-- ============================================================
alter table public.heartbeat_settings enable row level security;

-- Owners can read their own row.
create policy "heartbeat_settings: owner can select"
  on public.heartbeat_settings
  for select
  using (auth.uid() = owner_id);

-- Owners can insert their own row (created during onboarding step c).
create policy "heartbeat_settings: owner can insert"
  on public.heartbeat_settings
  for insert
  with check (auth.uid() = owner_id);

-- Owners can update their own row.
create policy "heartbeat_settings: owner can update"
  on public.heartbeat_settings
  for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ============================================================
-- Keep updated_at current automatically
-- ============================================================
-- Reuse public.set_updated_at() created in the profiles migration.
create trigger heartbeat_settings_set_updated_at
  before update on public.heartbeat_settings
  for each row
  execute function public.set_updated_at();
