-- Migration: checkins (Spec 3, task 1.2)
-- Audit trail of every check-in (design-doc §4.4).
--
-- RLS approach (consistent with the other tables: user-session client + RLS,
-- the service-role key is never used in app code):
--   * owner can SELECT their own rows;
--   * owner can INSERT rows for themselves only. The only code path that does
--     so is app/api/checkin/route.ts (which also computes ip_hash server-side);
--     the browser never talks to this table directly;
--   * there is NO update / delete policy: the trail is append-only.

create table if not exists public.checkins (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  method        text not null,
  ip_hash       text,
  created_at    timestamptz not null default now(),
  constraint checkins_method_check
    check (method in ('button', 'login', 'magic_link'))
);

create index if not exists checkins_owner_checked_in_at_idx
  on public.checkins (owner_id, checked_in_at desc);

alter table public.checkins enable row level security;

create policy "checkins: owner can select"
  on public.checkins
  for select
  using (auth.uid() = owner_id);

create policy "checkins: owner can insert"
  on public.checkins
  for insert
  with check (auth.uid() = owner_id);
