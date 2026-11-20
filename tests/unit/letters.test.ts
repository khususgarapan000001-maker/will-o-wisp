import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Mailer } from "@/lib/heartbeat/mailer";
import {
  checkLetterCap,
  checkLetterDraft,
  LETTER_CAP_MESSAGE,
  BODY_TOO_LONG_MESSAGE,
  MAX_BODY_CHARS,
  MAX_LETTERS_PER_OWNER,
  maxCiphertextLength,
  parseLetterWrite,
} from "@/lib/letters/validation";
import {
  countByRecipient,
  isLetterDeliverable,
  selectDeliverableLetters,
  type EligibilityLetter,
} from "@/lib/letters/eligibility";
import { openLetter, sealLetter } from "@/lib/letters/seal";
import { sendLetterDeliveryEmails } from "@/lib/letters/deliver";
import { buildLetterDeliveredEmail } from "@/lib/email/templates/letter-delivered";
import { describeNotice, noticePrefix } from "@/lib/keepers/notifications";
import { letterWriteError } from "@/lib/letters/api-errors";
import { decideRelease } from "@/lib/keepers/decision-service";
import { DecryptError } from "@/lib/crypto/decrypt";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const OWNER = "33333333-3333-4333-8333-333333333333";
const IV16 = "AAAAAAAAAAAAAAAA";

function letter(over: Partial<EligibilityLetter> = {}): EligibilityLetter {
  return { id: "l1", status: "final", recipientKeeperId: "k1", deliveredAt: null, ...over };
}

describe("delivery eligibility", () => {
  it("delivers a final letter to a keeper who is still accepted", () => {
    expect(isLetterDeliverable(letter(), [{ id: "k1", status: "accepted" }])).toBe(true);
  });
  it("never delivers a draft", () => {
    expect(isLetterDeliverable(letter({ status: "draft" }), [{ id: "k1", status: "accepted" }])).toBe(false);
  });
  it("does not deliver to a revoked, declined or pending keeper", () => {
    for (const status of ["revoked", "declined", "invited"] as const) {
      expect(isLetterDeliverable(letter(), [{ id: "k1", status }])).toBe(false);
    }
  });
  it("does not deliver to an unknown keeper", () => {
    expect(isLetterDeliverable(letter(), [{ id: "other", status: "accepted" }])).toBe(false);
  });
  it("is idempotent: an already delivered letter is skipped", () => {
    expect(
      isLetterDeliverable(letter({ deliveredAt: "2026-01-01T00:00:00Z" }), [{ id: "k1", status: "accepted" }])
    ).toBe(false);
  });
  it("selects and counts per recipient", () => {
    const keepers = [
      { id: "k1", status: "accepted" as const },
      { id: "k2", status: "revoked" as const },
    ];
    const all = [
      letter({ id: "a" }),
      letter({ id: "b", status: "draft" }),
      letter({ id: "c", recipientKeeperId: "k2" }),
      letter({ id: "d" }),
    ];
    const picked = selectDeliverableLetters(all, keepers);
    expect(picked.map((l) => l.id)).toEqual(["a", "d"]);
    expect(countByRecipient(picked).get("k1")).toBe(2);
  });
});

describe("limits", () => {
  it("accepts a body of exactly 10,000 characters and refuses 10,001", () => {
    expect(checkLetterDraft({ subject: "Hi", body: "a".repeat(MAX_BODY_CHARS) }).ok).toBe(true);
    const r = checkLetterDraft({ subject: "Hi", body: "a".repeat(MAX_BODY_CHARS + 1) });
    expect(r).toEqual({ ok: false, error: BODY_TOO_LONG_MESSAGE });
  });
  it("counts characters, not UTF-16 units", () => {
    expect(checkLetterDraft({ subject: "Hi", body: "🕯️".repeat(4000) }).ok).toBe(true);
  });
  it("asks for a subject and a body in plain language", () => {
    expect(checkLetterDraft({ subject: " ", body: "x" }).ok).toBe(false);
    expect(checkLetterDraft({ subject: "x", body: "  " }).ok).toBe(false);
  });
  it("allows the 50th letter and blocks the 51st", () => {
    expect(checkLetterCap(MAX_LETTERS_PER_OWNER - 1).ok).toBe(true);
    expect(checkLetterCap(MAX_LETTERS_PER_OWNER)).toEqual({ ok: false, error: LETTER_CAP_MESSAGE });
  });
  it("API bound: the largest legal payload fits, a huge ciphertext does not", () => {
    const body = (ct: string, iv = IV16) => ({
      recipientKeeperId: UUID_B,
      payloadCiphertext: ct,
      iv,
      status: "final",
      id: UUID_A,
    });
    expect(parseLetterWrite(body("A".repeat(maxCiphertextLength()))).ok).toBe(true);
    expect(parseLetterWrite(body("A".repeat(maxCiphertextLength() + 1))).ok).toBe(false);
  });
  it("API rejects a bad id, status, recipient or IV", () => {
    const good = { id: UUID_A, recipientKeeperId: UUID_B, payloadCiphertext: "QUJD", iv: IV16, status: "draft" };
    expect(parseLetterWrite(good).ok).toBe(true);
    expect(parseLetterWrite({ ...good, id: "nope" }).ok).toBe(false);
    expect(parseLetterWrite({ ...good, status: "sent" }).ok).toBe(false);
    expect(parseLetterWrite({ ...good, recipientKeeperId: null }).ok).toBe(false);
    expect(parseLetterWrite({ ...good, iv: "short" }).ok).toBe(false);
    expect(parseLetterWrite({ ...good, payloadCiphertext: "not base64!" }).ok).toBe(false);
    expect(parseLetterWrite(null).ok).toBe(false);
  });
  it("maps database guard errors to gentle messages", () => {
    expect(letterWriteError("letters: a delivered letter can no longer be changed").status).toBe(409);
    expect(letterWriteError("letters: the release has already happened").status).toBe(409);
    expect(letterWriteError("boom").status).toBe(500);
  });
});

describe("sealing a letter (one payload, one fresh IV)", () => {
  async function dek(): Promise<CryptoKey> {
    return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  }

  it("round-trips subject and body", async () => {
    const k = await dek();
    const sealed = await sealLetter(k, OWNER, UUID_A, { subject: " Hello ", body: "Dear you,\nlove" });
    expect(await openLetter(k, OWNER, UUID_A, sealed.ciphertext, sealed.iv)).toEqual({
      subject: "Hello",
      body: "Dear you,\nlove",
    });
  });

  it("an edit re-encrypts the whole payload with a fresh IV", async () => {
    const k = await dek();
    const draft = { subject: "Same", body: "Same text" };
    const first = await sealLetter(k, OWNER, UUID_A, draft);
    const ivs = new Set([first.iv]);
    for (let i = 0; i < 20; i++) {
      const again = await sealLetter(k, OWNER, UUID_A, draft);
      expect(again.ciphertext).not.toBe(first.ciphertext);
      ivs.add(again.iv);
    }
    expect(ivs.size).toBe(21);
    expect(atob(first.iv).length).toBe(12);
  });

  it("is bound to the owner and letter id (AAD)", async () => {
    const k = await dek();
    const sealed = await sealLetter(k, OWNER, UUID_A, { subject: "s", body: "b" });
    await expect(openLetter(k, OWNER, UUID_B, sealed.ciphertext, sealed.iv)).rejects.toBeInstanceOf(DecryptError);
  });
});

describe("letter-delivered email", () => {
  const msg = buildLetterDeliveredEmail({
    to: "k@example.com",
    keeperName: "Sari",
    ownerName: "Ayu",
    letterCount: 2,
    lettersUrl: "https://app.example/keeper/release/r1/letters",
  });
  it("is link only, with a plain-text version", () => {
    expect(msg.text).toContain("https://app.example/keeper/release/r1/letters");
    expect(msg.html).toContain("https://app.example/keeper/release/r1/letters");
    expect(msg.subject).toBe("Ayu left you letters");
    expect(msg.text).toContain("not in this email");
  });
  it("uses the singular for one letter and stays calm", () => {
    const one = buildLetterDeliveredEmail({
      to: "k@example.com",
      keeperName: "Sari",
      ownerName: "Ayu",
      letterCount: 1,
      lettersUrl: "https://x/y",
    });
    expect(one.subject).toBe("Ayu left you a letter");
    expect(`${one.text} ${one.subject}`).not.toMatch(/urgent|immediately|death|died|dead/i);
  });
  it("describes the in-app notice", () => {
    expect(noticePrefix("letter_delivered_abc123")).toBe("letter_delivered");
    expect(describeNotice("letter_delivered_abc", { release_id: "r1" }, "keeper")?.href).toBe(
      "/keeper/release/r1/letters"
    );
  });
});

type Pending = { keeper_id: string; keeper_name: string; keeper_email: string; letter_count: number }[];

function stubDb(pending: Pending, opts: { recordFails?: boolean } = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === "pending_letter_emails") return { data: pending, error: null };
      if (fn === "record_letter_email_attempt") {
        return { data: null, error: opts.recordFails ? { message: "boom" } : null };
      }
      return { data: null, error: { message: "unexpected" } };
    }),
  };
  return { db: client as unknown as SupabaseClient<Database>, calls };
}

function mailerThatReturns(ok: boolean): Mailer & { sent: string[] } {
  const sent: string[] = [];
  return {
    provider: "log",
    sent,
    async send(m) {
      sent.push(m.text);
      return ok ? { ok: true, delivery: "sent" } : { ok: false, delivery: "failed", error: "x" };
    },
  };
}

describe("sendLetterDeliveryEmails", () => {
  const pending: Pending = [
    { keeper_id: "k1", keeper_name: "Sari", keeper_email: "sari@example.com", letter_count: 2 },
    { keeper_id: "k2", keeper_name: "Budi", keeper_email: "budi@example.com", letter_count: 0 },
  ];

  it("emails each keeper who has letters and records the attempt", async () => {
    const { db, calls } = stubDb(pending);
    const mailer = mailerThatReturns(true);
    const report = await sendLetterDeliveryEmails(db, mailer, {
      releaseId: UUID_A,
      ownerName: "Ayu",
      appUrl: "https://app.example/",
    });
    expect(report).toEqual({ sent: 1, failed: 0 });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toContain(`https://app.example/keeper/release/${UUID_A}/letters`);
    const rec = calls.filter((c) => c.fn === "record_letter_email_attempt");
    expect(rec).toHaveLength(1);
    expect(rec[0]?.args).toMatchObject({ p_keeper_id: "k1", p_ok: true });
  });

  it("records a failed send (so it can be retried) and does not throw", async () => {
    const { db, calls } = stubDb(pending);
    const report = await sendLetterDeliveryEmails(db, mailerThatReturns(false), {
      releaseId: UUID_A,
      ownerName: "Ayu",
      appUrl: "https://app.example",
    });
    expect(report).toEqual({ sent: 0, failed: 1 });
    expect(calls.find((c) => c.fn === "record_letter_email_attempt")?.args).toMatchObject({ p_ok: false });
  });

  it("sends nothing when no letters are pending", async () => {
    const { db } = stubDb([]);
    const mailer = mailerThatReturns(true);
    expect(
      await sendLetterDeliveryEmails(db, mailer, { releaseId: UUID_A, ownerName: "Ayu", appUrl: "https://x" })
    ).toEqual({ sent: 0, failed: 0 });
    expect(mailer.sent).toHaveLength(0);
  });
});

describe("decideRelease wiring: delivery only on a released outcome", () => {
  function decisionDb(outcome: string) {
    const calls: string[] = [];
    const client = {
      rpc: vi.fn(async (fn: string) => {
        calls.push(fn);
        if (fn === "get_release_context") return { data: [{ owner_name: "Ayu", keeper_id: "k1" }], error: null };
        if (fn === "record_keeper_decision") {
          return {
            data: [{ outcome, release_state: "x", confirmations: 1, required_confirmations: 2 }],
            error: null,
          };
        }
        return { data: [], error: null };
      }),
    };
    return { db: client as unknown as SupabaseClient<Database>, calls };
  }
  const mailer: Mailer = { provider: "log", send: async () => ({ ok: true, delivery: "logged" }) };

  it.each([["recorded"], ["cancelled"], ["already_decided"], ["not_open"]])(
    "does not look for letter emails on %s",
    async (outcome) => {
      const { db, calls } = decisionDb(outcome);
      await decideRelease(db, UUID_A, "confirm", null, "https://x", mailer);
      expect(calls).not.toContain("pending_letter_emails");
    }
  );

  it("sends letter emails on released", async () => {
    const { db, calls } = decisionDb("released");
    await decideRelease(db, UUID_A, "confirm", null, "https://x", mailer);
    expect(calls).toContain("pending_letter_emails");
  });
});
