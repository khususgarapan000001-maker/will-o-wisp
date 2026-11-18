-- Migration: auth_profiles
-- Creates the profiles table with RLS and an auto-create trigger.

-- ============================================================
-- 2.1  profiles table
-- ============================================================
create table if not exists public.profiles (
  id                       uuid primary key references auth.users (id) on delete cascade,
  display_name             text not null,
  avatar_url               text,
  timezone                 text not null default 'Asia/Jakarta',
  onboarding_completed_at  timestamptz,
  -- demo_time_offset: offset applied to the system clock for demo accounts.
  -- Stored as an interval so it can be added directly in SQL.
  -- Always null for real accounts; only the demo seed script sets this.
  demo_time_offset         interval default '0 seconds',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ============================================================
-- Row-level security
-- ============================================================
alter table public.profiles enable row level security;

-- Owners can read their own row.
create policy "profiles: owner can select"
  on public.profiles
  for select
  using (auth.uid() = id);

-- Owners can update their own row.
create policy "profiles: owner can update"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ============================================================
-- Keep updated_at current automatically
-- ============================================================
create or replace function public.set_updated_at()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- 2.2  Trigger: create a profiles row when a user signs up
-- ============================================================
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  _display_name text;
begin
  -- Use the email local-part (everything before @) as the initial display name.
  _display_name := split_part(new.email, '@', 1);

  insert into public.profiles (id, display_name)
  values (new.id, _display_name);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
