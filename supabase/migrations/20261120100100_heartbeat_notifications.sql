-- Migration: notifications (Spec 3, task 1.3)
-- Idempotency record for heartbeat reminders (design-doc §4.11, trimmed to what
-- Spec 3 needs; keeper-facing columns arrive with Spec 4).
--
-- Idempotency: the reminder sender first INSERTs a row, relying on
-- UNIQUE (owner_id, kind, due_date). A duplicate insert is a no-op, so a retried
-- or concurrent tick can never send the same reminder twice. `sent_at` stays
-- null until the email provider accepts the message; `attempts` bounds retries
-- (max 3, then the row is left for manual review).
--
-- Kind naming (see lib/heartbeat/cadence.ts):
--   checkin_reminder_<n>d   n days before the due date   (due_date = due day)
--   overdue_day_<k>         k-th daily nudge while OVERDUE (due_date = due day)
--
-- RLS: owner can read their own rows (in-app inbox) and mark them read.
-- Inserts come from the heartbeat-tick Edge Function (service role / direct DB
-- connection, which bypasses RLS) and from the demo-clock tick running as the
-- owner, so an owner-insert policy is also provided.

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,
  due_date   date not null,
  sent_at    timestamptz,
  attempts   int not null default 0,
  read_at    timestamptz,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notifications_owner_kind_due_key unique (owner_id, kind, due_date),
  constraint notifications_kind_check check (kind ~ '^[a-z][a-z0-9_]*$'),
  constraint notifications_attempts_check check (attempts >= 0)
);

create index if not exists notifications_owner_created_idx
  on public.notifications (owner_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications: owner can select"
  on public.notifications
  for select
  using (auth.uid() = owner_id);

create policy "notifications: owner can insert"
  on public.notifications
  for insert
  with check (auth.uid() = owner_id and sent_at is null);

create policy "notifications: owner can update"
  on public.notifications
  for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create trigger notifications_set_updated_at
  before update on public.notifications
  for each row
  execute function public.set_updated_at();
