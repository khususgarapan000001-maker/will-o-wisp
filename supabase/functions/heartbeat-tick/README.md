# heartbeat-tick

Cron Edge Function for the heartbeat / grace-period state machine
(design-doc §6.3, Spec 3). Every run, for each owner still `ALIVE` or `OVERDUE`:

1. opens a transaction and locks the owner's `heartbeat_settings` row
   (`SELECT … FOR UPDATE`), so concurrent or retried ticks cannot double-process;
2. applies **one** state step with the shared pure machine
   (`ALIVE → OVERDUE`, or `OVERDUE → AWAITING_KEEPERS` + a `release_processes` row);
3. sends due reminders. A `notifications` row is claimed first
   (`UNIQUE (owner_id, kind, due_date)`), so each reminder goes out at most once;
   failed sends are retried on later ticks, at most 3 attempts.

4. (Spec 4) when a release opens, calls `notify_release_pending()` (in-app
   notice) and emails each accepted keeper. This needs the four Spec 4
   migrations (`20261121090000`–`090300`) applied first; without them the
   keeper lookup fails, is logged, and the state change still stands.

A failure for one owner is logged and the tick continues with the next.
The function imports `lib/heartbeat/*.ts` (the same code the Vitest and
fast-check suites test) via relative paths.

> Status: written and type-checked against shims, **never deployed or run**
> (no Supabase CLI / Deno on the build VM). Everything below is a human step.

## Prerequisites

1. Apply the three Spec 3 migrations in the SQL Editor, in order:
   `20261120100000_heartbeat_checkins.sql`,
   `20261120100100_heartbeat_notifications.sql`,
   `20261120100200_release_processes.sql`.
2. Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and run
   `supabase link --project-ref hdkuhnwvufndcsikmdil`.

## Deploy

```bash
supabase functions deploy heartbeat-tick --no-verify-jwt
```

`--no-verify-jwt` is intentional: the function does its own check and only
accepts `Authorization: Bearer <HEARTBEAT_CRON_SECRET>` (falling back to the
service-role key when that secret is unset).

The function imports files outside its own folder (`../../../lib/heartbeat`).
If the bundler cannot see them, deploy from the repository root with
`supabase functions deploy heartbeat-tick --use-api`; as a last resort copy
`lib/heartbeat` and `lib/email/templates` into `supabase/functions/_shared/`
and fix the import paths.

## Secrets

```bash
supabase secrets set \
  HEARTBEAT_CRON_SECRET='<long random string>' \
  APP_URL='https://<your-vercel-domain>' \
  RESEND_API_KEY='<optional: without it reminders are recorded but only logged>' \
  RESEND_FROM_EMAIL='WILL-O'\''-WISP <lantern@yourdomain.example>' \
  DEMO_MODE='true'   # only on the demo deployment; omit for real accounts
```

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL` are injected
by the platform. Do not paste real keys into the repo.

## Schedule (pg_cron, every 15 minutes)

Enable the `pg_cron` and `pg_net` extensions (Database → Extensions), store the
secret in Vault, then in the SQL Editor:

```sql
select vault.create_secret('<same HEARTBEAT_CRON_SECRET>', 'heartbeat_cron_secret');

select cron.schedule(
  'heartbeat-tick',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://hdkuhnwvufndcsikmdil.supabase.co/functions/v1/heartbeat-tick',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'heartbeat_cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

## Verify

- Dashboard → Integrations → Cron: job `heartbeat-tick` is listed and runs succeed.
- Dashboard → Edge Functions → heartbeat-tick → Logs: each run prints
  `[heartbeat-tick] done {"owners":…,"transitions":…,…}`.
- Manual run: `curl -X POST -H "Authorization: Bearer $HEARTBEAT_CRON_SECRET" https://hdkuhnwvufndcsikmdil.supabase.co/functions/v1/heartbeat-tick`.
- `select * from notifications order by created_at desc;` shows each reminder once.

## Unschedule

```sql
select cron.unschedule('heartbeat-tick');
```
