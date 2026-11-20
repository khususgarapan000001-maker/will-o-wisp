/**
 * Mailer interface for heartbeat reminders.
 *
 * - `createResendMailer` talks to Resend's REST API with `fetch` (no SDK, so it
 *   runs unchanged in Next.js and in the Deno Edge Function).
 * - `createLogMailer` never sends anything; it logs kind + masked recipient
 *   only (never the body — it may contain a sign-in link).
 * - `createMailer(env)` picks Resend when RESEND_API_KEY is set, else the log
 *   fallback, so reminder bookkeeping works with no provider configured.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Short label for logs, e.g. "checkin_reminder_3d". Never contains secrets. */
  tag: string;
}

export interface SendResult {
  ok: boolean;
  /** "sent" = accepted by the provider, "logged" = fallback, nothing was emailed. */
  delivery: "sent" | "logged" | "failed";
  error?: string;
}

export interface Mailer {
  readonly provider: "resend" | "log";
  send(message: EmailMessage): Promise<SendResult>;
}

export interface MailerEnv {
  RESEND_API_KEY?: string | undefined;
  RESEND_FROM_EMAIL?: string | undefined;
}

export function maskEmail(address: string): string {
  const [local = "", domain = ""] = address.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

export function createLogMailer(
  log: (line: string) => void = (line) => console.log(line)
): Mailer {
  return {
    provider: "log",
    async send(message) {
      log(
        `[mailer:log] no email provider configured; not sending "${message.tag}" to ${maskEmail(message.to)}`
      );
      return { ok: true, delivery: "logged" };
    },
  };
}

export function createResendMailer(
  apiKey: string,
  from: string,
  fetchImpl: typeof fetch = fetch
): Mailer {
  return {
    provider: "resend",
    async send(message) {
      try {
        const res = await fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
          }),
        });
        if (!res.ok) {
          return { ok: false, delivery: "failed", error: `provider status ${res.status}` };
        }
        return { ok: true, delivery: "sent" };
      } catch (err) {
        return {
          ok: false,
          delivery: "failed",
          error: err instanceof Error ? err.message : "unknown error",
        };
      }
    },
  };
}

export function createMailer(env: MailerEnv, fetchImpl?: typeof fetch): Mailer {
  const key = env.RESEND_API_KEY?.trim();
  // The .env.example placeholder must not count as a real key.
  if (!key || key.startsWith("YOUR_")) return createLogMailer();
  const from = env.RESEND_FROM_EMAIL?.trim() || "WILL-O'-WISP <onboarding@resend.dev>";
  return createResendMailer(key, from, fetchImpl);
}

/** `createMailer` from a plain env record (e.g. `process.env`). */
export function createMailerFromEnv(
  env: Record<string, string | undefined>,
  fetchImpl?: typeof fetch
): Mailer {
  return createMailer(
    { RESEND_API_KEY: env.RESEND_API_KEY, RESEND_FROM_EMAIL: env.RESEND_FROM_EMAIL },
    fetchImpl
  );
}
