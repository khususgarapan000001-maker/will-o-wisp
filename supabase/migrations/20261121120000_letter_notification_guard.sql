-- Migration: letter_delivered_* notification guard (Spec 7 hardening)
--
-- Same hole, same fix as notifications_will_kind_guard() in
-- 20261121110100_will_delivery.sql. The notifications table has an owner
-- insert/update policy (the heartbeat demo tick writes as the owner), so
-- without this any signed-in user could write a letter_delivered_* row for
-- themselves and trigger a "letters are ready" email. Only the delivery
-- trigger (current_user is not authenticated/anon) may create that kind.
--
-- Mirrors the will guard exactly. Kinds follow <prefix>_<release id without
-- dashes>, hence the prefix match.
create or replace function public.notifications_letter_kind_guard()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.kind like 'letter\_delivered\_%'
     and (tg_op = 'INSERT' or new.kind is distinct from old.kind) then
    raise exception 'notifications: letter_delivered is written by the release only' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger notifications_letter_kind_guard
  before insert or update of kind on public.notifications
  for each row
  execute function public.notifications_letter_kind_guard();
