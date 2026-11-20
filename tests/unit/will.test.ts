import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, WillCategory, WillWish } from "@/lib/supabase/types";
import type { Mailer } from "@/lib/heartbeat/mailer";
import { CATEGORIES, CATEGORY_LABELS, isCategory, isWish, NOT_A_LEGAL_WILL_NOTICE, WISH_META, WISHES } from "@/lib/will/model";
import {
  checkWillCap,
  checkWillDraft,
  MAX_NOTE_CHARS,
  MAX_WILL_ITEMS,
  maxNoteCiphertextLength,
  NOTE_TOO_LONG_MESSAGE,
  parseReorder,
  parseWillWrite,
  type WillDraft,
} from "@/lib/will/validation";
import {
  countMissingWish,
  groupByCategory,
  matchesFilter,
  moveWithinCategory,
  type Groupable,
} from "@/lib/will/grouping";
import { SERVICE_SUGGESTIONS, suggestCategory } from "@/lib/will/suggestions";
import { openWillNote, sealWillNote } from "@/lib/will/seal";
import { sendWillDeliveryEmails } from "@/lib/will/deliver";
import { SEALED_WILL_MESSAGE, willWriteError } from "@/lib/will/api-errors";
import { buildWillDeliveredEmail } from "@/lib/email/templates/will-delivered";
import { describeNotice, noticePrefix } from "@/lib/keepers/notifications";
import { decideRelease } from "@/lib/keepers/decision-service";
import { DecryptError } from "@/lib/crypto/decrypt";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_K = "44444444-4444-4444-8444-444444444444";
const OWNER = "33333333-3333-4333-8333-333333333333";
const IV16 = "AAAAAAAAAAAAAAAA";

function draft(over: Partial<WillDraft> = {}): WillDraft {
  return { serviceName: "Gmail", category: "email", wish: "delete", transferKeeperId: null, notes: "", ...over };
}

describe("wish and category enums", () => {
  it("knows exactly the five wishes, each with an icon, label and description", () => {
    expect([...WISHES]).toEqual(["delete", "memorialize", "transfer", "archive", "ignore"]);
    for (const w of WISHES) {
      expect(WISH_META[w].icon.length).toBeGreaterThan(0);
      expect(WISH_META[w].label.length).toBeGreaterThan(0);
    }
  });
  it("isWish accepts the enum only (null is 'unset', not a wish)", () => {
    expect(isWish("transfer")).toBe(true);
    expect(isWish("burn")).toBe(false);
    expect(isWish(null)).toBe(false);
    expect(isWish(undefined)).toBe(false);
  });
  it("every category has a label", () => {
    for (const c of CATEGORIES) expect(CATEGORY_LABELS[c]).toBeTruthy();
    expect(isCategory("finance")).toBe(true);
    expect(isCategory("pets")).toBe(false);
  });
  it("carries the plain-language legal notice verbatim", () => {
    expect(NOT_A_LEGAL_WILL_NOTICE).toBe(
      "This is a record of your wishes, not a legal will. For legal effect, consult a lawyer in your country."
    );
  });
});

describe("draft validation", () => {
  it("accepts every wish, and accepts NO wish (null = unset)", () => {
    for (const w of WISHES.filter((x) => x !== "transfer")) expect(checkWillDraft(draft({ wish: w })).ok).toBe(true);
    expect(checkWillDraft(draft({ wish: null })).ok).toBe(true);
  });
  it("rejects a wish outside the enum", () => {
    expect(checkWillDraft(draft({ wish: "burn" as WillWish })).ok).toBe(false);
  });
  it("transfer requires a keeper", () => {
    const r = checkWillDraft(draft({ wish: "transfer", transferKeeperId: null }));
    expect(r).toEqual({ ok: false, error: "Please choose which keeper this account should go to." });
    expect(checkWillDraft(draft({ wish: "transfer", transferKeeperId: UUID_K })).ok).toBe(true);
  });
  it("a keeper is only allowed with the transfer wish (matches the DB CHECK)", () => {
    expect(checkWillDraft(draft({ wish: "delete", transferKeeperId: UUID_K })).ok).toBe(false);
    expect(checkWillDraft(draft({ wish: null, transferKeeperId: UUID_K })).ok).toBe(false);
  });
  it("needs a non-blank service name within 100 characters", () => {
    expect(checkWillDraft(draft({ serviceName: "   " })).ok).toBe(false);
    expect(checkWillDraft(draft({ serviceName: "x".repeat(100) })).ok).toBe(true);
    expect(checkWillDraft(draft({ serviceName: "x".repeat(101) })).ok).toBe(false);
  });
  it("rejects an unknown category", () => {
    expect(checkWillDraft(draft({ category: "pets" as WillCategory })).ok).toBe(false);
  });
  it("accepts a note of exactly 2,000 characters and refuses 2,001, counting characters not UTF-16 units", () => {
    expect(checkWillDraft(draft({ notes: "a".repeat(MAX_NOTE_CHARS) })).ok).toBe(true);
    expect(checkWillDraft(draft({ notes: "a".repeat(MAX_NOTE_CHARS + 1) }))).toEqual({
      ok: false,
      error: NOTE_TOO_LONG_MESSAGE,
    });
    expect(checkWillDraft(draft({ notes: "🕯".repeat(MAX_NOTE_CHARS) })).ok).toBe(true);
  });
  it("allows the 200th account and blocks the 201st", () => {
    expect(checkWillCap(MAX_WILL_ITEMS - 1).ok).toBe(true);
    expect(checkWillCap(MAX_WILL_ITEMS).ok).toBe(false);
  });
});

describe("API parsing", () => {
  const good = {
    id: UUID_A,
    serviceName: "  Gmail ",
    category: "email",
    wish: "transfer",
    transferToKeeperId: UUID_K,
    notes: { ciphertext: "Q0lQSEVS", iv: IV16 },
  };
  it("accepts a well-formed write and trims the name", () => {
    const r = parseWillWrite(good, { allowKeep: false });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.serviceName).toBe("Gmail");
  });
  it("treats a missing wish as 'no wish yet' and a missing note as none", () => {
    const r = parseWillWrite({ id: UUID_A, serviceName: "X", category: "other" }, { allowKeep: false });
    expect(r).toMatchObject({ ok: true, value: { wish: null, transferToKeeperId: null, notes: null } });
  });
  it("rejects transfer without a keeper at the API too", () => {
    expect(parseWillWrite({ ...good, transferToKeeperId: null }, { allowKeep: false }).ok).toBe(false);
  });
  it("rejects a bad id, wish, category, keeper id or empty name", () => {
    expect(parseWillWrite({ ...good, id: "x" }, { allowKeep: false }).ok).toBe(false);
    expect(parseWillWrite({ ...good, wish: "burn" }, { allowKeep: false }).ok).toBe(false);
    expect(parseWillWrite({ ...good, category: "pets" }, { allowKeep: false }).ok).toBe(false);
    expect(parseWillWrite({ ...good, transferToKeeperId: "nope" }, { allowKeep: false }).ok).toBe(false);
    expect(parseWillWrite({ ...good, serviceName: "  " }, { allowKeep: false }).ok).toBe(false);
    expect(parseWillWrite(null, { allowKeep: false }).ok).toBe(false);
  });
  it("uses the id from the path when given", () => {
    const { id: _id, ...rest } = good;
    void _id;
    expect(parseWillWrite(rest, { idFromPath: UUID_B, allowKeep: true })).toMatchObject({ ok: true, value: { id: UUID_B } });
  });
  it("'keep' is allowed on update only", () => {
    expect(parseWillWrite({ ...good, notes: "keep" }, { allowKeep: true })).toMatchObject({ ok: true, value: { notes: "keep" } });
    expect(parseWillWrite({ ...good, notes: "keep" }, { allowKeep: false }).ok).toBe(false);
  });
  it("bounds the note ciphertext and checks the IV shape", () => {
    const max = maxNoteCiphertextLength();
    const big = { ...good, notes: { ciphertext: "A".repeat(max + 4), iv: IV16 } };
    expect(parseWillWrite(big, { allowKeep: false })).toEqual({ ok: false, error: NOTE_TOO_LONG_MESSAGE });
    const edge = { ...good, notes: { ciphertext: "A".repeat(max), iv: IV16 } };
    expect(parseWillWrite(edge, { allowKeep: false }).ok).toBe(true);
    expect(parseWillWrite({ ...good, notes: { ciphertext: "Q0lQSEVS", iv: "short" } }, { allowKeep: false }).ok).toBe(false);
    expect(parseWillWrite({ ...good, notes: { ciphertext: "not base64!", iv: IV16 } }, { allowKeep: false }).ok).toBe(false);
  });
  it("the largest legal note fits under the database ciphertext ceiling", () => {
    expect(maxNoteCiphertextLength()).toBeLessThanOrEqual(17_000);
  });
  it("parses a reorder body: ids only, no duplicates", () => {
    expect(parseReorder({ ids: [UUID_A, UUID_B] })).toEqual({ ok: true, ids: [UUID_A, UUID_B] });
    expect(parseReorder({ ids: [UUID_A, UUID_A] }).ok).toBe(false);
    expect(parseReorder({ ids: [] }).ok).toBe(false);
    expect(parseReorder({ ids: ["x"] }).ok).toBe(false);
    expect(parseReorder(null).ok).toBe(false);
  });
  it("maps database guard errors to gentle messages", () => {
    expect(willWriteError("will: the release has already happened").message).toBe(SEALED_WILL_MESSAGE);
    expect(willWriteError("will: the transfer target must be one of your accepted keepers").status).toBe(400);
    expect(willWriteError("kaboom").status).toBe(500);
  });
});

describe("suggestions", () => {
  it("offers the common services with a category", () => {
    const names = SERVICE_SUGGESTIONS.map((s) => s.name);
    for (const n of ["Gmail", "Instagram", "Facebook", "WhatsApp"]) expect(names).toContain(n);
    for (const s of SERVICE_SUGGESTIONS) expect(isCategory(s.category)).toBe(true);
  });
  it("maps a typed name to its category, case-insensitively, and nothing for unknown names", () => {
    expect(suggestCategory(" gmail ")).toBe("email");
    expect(suggestCategory("Instagram")).toBe("social");
    expect(suggestCategory("My little blog")).toBeNull();
    expect(suggestCategory("")).toBeNull();
  });
});

function item(id: string, category: WillCategory, wish: WillWish | null, sort_order: number): Groupable {
  return { id, category, wish, sort_order };
}

describe("grouping and filtering", () => {
  const items = [
    item("a", "social", "delete", 0),
    item("b", "email", null, 1),
    item("c", "social", "transfer", 2),
    item("d", "finance", "archive", 3),
  ];
  it("groups by category in the fixed category order, skipping empty groups", () => {
    const g = groupByCategory(items);
    expect(g.map((x) => x.category)).toEqual(["social", "finance", "email"]);
    expect(g[0]?.items.map((i) => i.id)).toEqual(["a", "c"]);
  });
  it("sorts by sort_order inside a group, stably", () => {
    const g = groupByCategory([item("x", "other", null, 5), item("y", "other", null, 1), item("z", "other", null, 1)]);
    expect(g[0]?.items.map((i) => i.id)).toEqual(["y", "z", "x"]);
  });
  it("filters by wish, and 'unset' means no wish", () => {
    expect(groupByCategory(items, "unset").flatMap((g) => g.items.map((i) => i.id))).toEqual(["b"]);
    expect(groupByCategory(items, "transfer").flatMap((g) => g.items.map((i) => i.id))).toEqual(["c"]);
    expect(groupByCategory(items, "ignore")).toEqual([]);
    expect(matchesFilter({ wish: null }, "all")).toBe(true);
  });
  it("counts accounts without a wish (dashboard prompt)", () => {
    expect(countMissingWish(items)).toBe(1);
    expect(countMissingWish([])).toBe(0);
  });
  it("moves an item up or down within its own category only", () => {
    expect(moveWithinCategory(items, "c", "up")).toEqual(["c", "b", "a", "d"]);
    expect(moveWithinCategory(items, "a", "down")).toEqual(["c", "b", "a", "d"]);
  });
  it("leaves the order alone at the edges and for unknown ids", () => {
    expect(moveWithinCategory(items, "a", "up")).toEqual(["a", "b", "c", "d"]);
    expect(moveWithinCategory(items, "c", "down")).toEqual(["a", "b", "c", "d"]);
    expect(moveWithinCategory(items, "b", "up")).toEqual(["a", "b", "c", "d"]);
    expect(moveWithinCategory(items, "nope", "up")).toEqual(["a", "b", "c", "d"]);
  });
});

describe("sealing a note (one ciphertext, one fresh IV)", () => {
  async function dek(): Promise<CryptoKey> {
    return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  }
  it("round-trips a note", async () => {
    const k = await dek();
    const sealed = await sealWillNote(k, OWNER, UUID_A, "The hint is in the safe.");
    expect(await openWillNote(k, OWNER, UUID_A, sealed.ciphertext, sealed.iv)).toBe("The hint is in the safe.");
    expect(sealed.ciphertext).not.toContain("safe");
  });
  it("an edit re-encrypts the whole note with a fresh IV", async () => {
    const k = await dek();
    const first = await sealWillNote(k, OWNER, UUID_A, "Same text");
    const ivs = new Set([first.iv]);
    for (let i = 0; i < 20; i++) {
      const again = await sealWillNote(k, OWNER, UUID_A, "Same text");
      expect(again.ciphertext).not.toBe(first.ciphertext);
      ivs.add(again.iv);
    }
    expect(ivs.size).toBe(21);
    expect(atob(first.iv).length).toBe(12);
  });
  it("is bound to the owner and item id (AAD) and to the key", async () => {
    const k = await dek();
    const sealed = await sealWillNote(k, OWNER, UUID_A, "n");
    await expect(openWillNote(k, OWNER, UUID_B, sealed.ciphertext, sealed.iv)).rejects.toBeInstanceOf(DecryptError);
    await expect(openWillNote(await dek(), OWNER, UUID_A, sealed.ciphertext, sealed.iv)).rejects.toBeInstanceOf(DecryptError);
  });
});

describe("will-delivered email", () => {
  const msg = buildWillDeliveredEmail({
    to: "k@example.com",
    keeperName: "Sari",
    ownerName: "Ayu",
    willUrl: "https://app.example/keeper/release/r1/will",
  });
  it("is link only, with a plain-text version and an HTML version", () => {
    expect(msg.text).toContain("https://app.example/keeper/release/r1/will");
    expect(msg.html).toContain("https://app.example/keeper/release/r1/will");
    expect(msg.text).toContain("not in this email");
    expect(msg.tag).toBe("will_delivered");
  });
  it("carries no will content and stays calm", () => {
    const all = `${msg.subject} ${msg.text} ${msg.html}`;
    expect(all).not.toMatch(/gmail|instagram|delete|memorializ|transfer|archive|password/i);
    expect(all).not.toMatch(/urgent|immediately|death|died|dead/i);
  });
  it("describes the in-app notice, pointing at the will page", () => {
    expect(noticePrefix("will_delivered_abc123")).toBe("will_delivered");
    expect(describeNotice("will_delivered_abc", { release_id: "r1" }, "keeper")?.href).toBe("/keeper/release/r1/will");
    expect(noticePrefix("letter_delivered_abc")).toBe("letter_delivered");
  });
});

type Pending = { keeper_id: string; keeper_name: string; keeper_email: string }[];

function stubDb(pending: Pending, opts: { pendingFails?: boolean } = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === "pending_will_emails") {
        return opts.pendingFails ? { data: null, error: { message: "boom" } } : { data: pending, error: null };
      }
      if (fn === "record_will_email_attempt") return { data: null, error: null };
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

describe("sendWillDeliveryEmails", () => {
  const pending: Pending = [
    { keeper_id: "k1", keeper_name: "Sari", keeper_email: "sari@example.com" },
    { keeper_id: "k2", keeper_name: "Budi", keeper_email: "budi@example.com" },
  ];
  const args = { releaseId: UUID_A, ownerName: "Ayu", appUrl: "https://app.example/" };

  it("emails each pending keeper a link to the will page and records every attempt", async () => {
    const { db, calls } = stubDb(pending);
    const mailer = mailerThatReturns(true);
    expect(await sendWillDeliveryEmails(db, mailer, args)).toEqual({ sent: 2, failed: 0 });
    expect(mailer.sent[0]).toContain(`https://app.example/keeper/release/${UUID_A}/will`);
    const rec = calls.filter((c) => c.fn === "record_will_email_attempt");
    expect(rec).toHaveLength(2);
    expect(rec[0]?.args).toMatchObject({ p_keeper_id: "k1", p_ok: true });
  });
  it("records a failed send (so it can be retried) and does not throw", async () => {
    const { db, calls } = stubDb(pending);
    expect(await sendWillDeliveryEmails(db, mailerThatReturns(false), args)).toEqual({ sent: 0, failed: 2 });
    expect(calls.find((c) => c.fn === "record_will_email_attempt")?.args).toMatchObject({ p_ok: false });
  });
  it("sends nothing when nobody is pending, and swallows a lookup error", async () => {
    const mailer = mailerThatReturns(true);
    expect(await sendWillDeliveryEmails(stubDb([]).db, mailer, args)).toEqual({ sent: 0, failed: 0 });
    expect(await sendWillDeliveryEmails(stubDb([], { pendingFails: true }).db, mailer, args)).toEqual({ sent: 0, failed: 0 });
    expect(mailer.sent).toHaveLength(0);
  });
});

describe("decideRelease wiring: will delivery only on a released outcome", () => {
  function decisionDb(outcome: string) {
    const calls: string[] = [];
    const client = {
      rpc: vi.fn(async (fn: string) => {
        calls.push(fn);
        if (fn === "get_release_context") return { data: [{ owner_name: "Ayu", keeper_id: "k1" }], error: null };
        if (fn === "record_keeper_decision") {
          return { data: [{ outcome, release_state: "x", confirmations: 1, required_confirmations: 2 }], error: null };
        }
        return { data: [], error: null };
      }),
    };
    return { db: client as unknown as SupabaseClient<Database>, calls };
  }
  const mailer: Mailer = { provider: "log", send: async () => ({ ok: true, delivery: "logged" }) };

  it.each([["recorded"], ["cancelled"], ["already_decided"], ["not_open"]])(
    "does not look for will emails on %s",
    async (outcome) => {
      const { db, calls } = decisionDb(outcome);
      await decideRelease(db, UUID_A, "confirm", null, "https://x", mailer);
      expect(calls).not.toContain("pending_will_emails");
    }
  );
  it("sends will emails (after the letters) on released", async () => {
    const { db, calls } = decisionDb("released");
    await decideRelease(db, UUID_A, "confirm", null, "https://x", mailer);
    expect(calls).toContain("pending_will_emails");
    expect(calls.indexOf("pending_letter_emails")).toBeLessThan(calls.indexOf("pending_will_emails"));
  });
});
