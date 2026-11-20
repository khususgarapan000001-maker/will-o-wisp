import { describe, expect, it, vi } from "vitest";
import { createLogMailer, createMailer, maskEmail } from "@/lib/heartbeat/mailer";
import { decideClaim } from "@/lib/heartbeat/reminders";
import { explainState } from "@/lib/heartbeat/explainer";
import { validateCadenceGrace } from "@/lib/heartbeat/validation";
import { buildReminderEmail } from "@/lib/email/templates/heartbeat";
import { hashIp } from "@/lib/heartbeat/ip-hash";

const message = { to: "jo@example.com", subject: "s", text: "t", html: "<p>t</p>", tag: "checkin_reminder_3d" };

describe("mailer", () => {
  it("falls back to the log mailer when no key is configured", async () => {
    const mailer = createMailer({});
    expect(mailer.provider).toBe("log");
    expect((await mailer.send(message)).delivery).toBe("logged");
  });

  it("treats the .env.example placeholder as no key", () => {
    expect(createMailer({ RESEND_API_KEY: "YOUR_RESEND_API_KEY" }).provider).toBe("log");
  });

  it("logs the tag and a masked address, never the body", async () => {
    const lines: string[] = [];
    await createLogMailer((l) => lines.push(l)).send({ ...message, text: "SECRET-LINK" });
    expect(lines.join("\n")).not.toContain("SECRET-LINK");
    expect(lines.join("\n")).not.toContain("jo@example.com");
    expect(lines.join("\n")).toContain(maskEmail("jo@example.com"));
  });

  it("posts to Resend when a key is configured and reports failures", async () => {
    const ok = vi.fn(async () => new Response("{}", { status: 200 }));
    const bad = vi.fn(async () => new Response("{}", { status: 500 }));
    const m1 = createMailer({ RESEND_API_KEY: "re_test" }, ok as unknown as typeof fetch);
    expect(m1.provider).toBe("resend");
    expect((await m1.send(message)).ok).toBe(true);
    expect(ok).toHaveBeenCalledOnce();
    const m2 = createMailer({ RESEND_API_KEY: "re_test" }, bad as unknown as typeof fetch);
    expect(await m2.send(message)).toMatchObject({ ok: false, delivery: "failed" });
  });
});

describe("decideClaim", () => {
  it("covers every case", () => {
    expect(decideClaim(null)).toBe("insert_and_send");
    expect(decideClaim({ sentAt: new Date(), attempts: 1 })).toBe("already_sent");
    expect(decideClaim({ sentAt: null, attempts: 1 })).toBe("retry");
    expect(decideClaim({ sentAt: null, attempts: 3 })).toBe("exhausted");
  });
});

describe("explainer + validation + templates", () => {
  const input = { dueLabel: "4 December 2026", graceEndLabel: "18 December 2026", graceDays: 14 };
  it("has calm copy for every state", () => {
    for (const state of ["ALIVE", "OVERDUE", "AWAITING_KEEPERS", "RELEASED"] as const) {
      const e = explainState({ ...input, state });
      expect(e.headline.length).toBeGreaterThan(5);
      expect(e.steps.length).toBeGreaterThan(0);
    }
    expect(explainState({ ...input, state: "OVERDUE" }).steps.join(" ")).toContain("18 December 2026");
  });

  it("accepts only 7/14/30", () => {
    expect(validateCadenceGrace(14, 7).ok).toBe(true);
    expect(validateCadenceGrace(10, 7).ok).toBe(false);
    expect(validateCadenceGrace(14, 0).ok).toBe(false);
  });

  it("builds plain-text and html reminders with the check-in link, escaping names", () => {
    const e = buildReminderEmail({
      to: "jo@example.com",
      displayName: "<b>Jo</b>",
      kind: "overdue_day_2",
      dueDateLabel: "4 December 2026",
      checkInUrl: "https://app.example/app/checkin",
      graceDays: 14,
    });
    expect(e.text).toContain("https://app.example/app/checkin");
    expect(e.html).not.toContain("<b>Jo</b>");
    expect(e.subject).toBe("Your lantern is waiting for you");
  });

  it("hashes IPs deterministically and tolerates a missing IP", () => {
    expect(hashIp(null)).toBeNull();
    expect(hashIp("1.2.3.4")).toBe(hashIp(" 1.2.3.4 "));
    expect(hashIp("1.2.3.4")).toMatch(/^[0-9a-f]{64}$/);
  });
});
