import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildEchoMessages,
  checkEchoInput,
  ECHO_SYSTEM_PROMPT,
  MAX_DRAFT_CHARS,
  MAX_NOTES_CHARS,
  sanitizeDraft,
  TRUNCATION_NOTE,
} from "@/lib/echo/prompt";
import {
  createEchoProvider,
  createOpenRouterProvider,
  EchoProviderError,
  type EchoProvider,
} from "@/lib/echo/provider";
import { createRateLimiter, DAILY_DRAFT_LIMIT } from "@/lib/echo/rate-limit";
import { runEchoDraft, UNAVAILABLE_MESSAGE } from "@/lib/echo/draft-service";
import { parseLetterWrite } from "@/lib/letters/validation";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

describe("prompt construction (privacy boundary)", () => {
  it("contains the fixed system prompt, the notes and the recipient name, and nothing else", () => {
    const msgs = buildEchoMessages({ notes: "thank her for the garden", recipientName: "Ayu" });
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual({ role: "system", content: ECHO_SYSTEM_PROMPT });
    expect(msgs[1]?.role).toBe("user");
    expect(msgs[1]?.content).toBe("Recipient: Ayu\n\nNotes from the letter-writer:\nthank her for the garden");
  });
  it("accepts exactly two inputs: extra fields passed at runtime never reach the prompt", () => {
    const sneaky = { notes: "n", recipientName: "Ayu", vaultItem: "SECRET-VAULT", ownerId: "SECRET-OWNER" };
    const text = JSON.stringify(buildEchoMessages(sneaky));
    expect(text).not.toContain("SECRET");
  });
  it("the echo code imports nothing from the vault, letters, will or Supabase layers", () => {
    const files = [
      "lib/echo/prompt.ts",
      "lib/echo/provider.ts",
      "lib/echo/draft-service.ts",
      "lib/echo/rate-limit.ts",
      "app/api/echo/draft/route.ts",
    ];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const imports = src.split("\n").filter((l) => /^\s*import\b/.test(l)).join("\n");
      expect(imports, f).not.toMatch(/supabase|lib\/crypto|lib\/letters|lib\/will|lib\/vault/);
      expect(src, f).not.toMatch(/\.from\(\s*["'](vault|letters|will_items)/);
    }
  });
});

describe("input validation", () => {
  it("rejects empty and over-long notes and bad names", () => {
    expect(checkEchoInput("  ", "Ayu").ok).toBe(false);
    expect(checkEchoInput(undefined, "Ayu").ok).toBe(false);
    expect(checkEchoInput("x".repeat(MAX_NOTES_CHARS), "Ayu").ok).toBe(true);
    expect(checkEchoInput("x".repeat(MAX_NOTES_CHARS + 1), "Ayu").ok).toBe(false);
    expect(checkEchoInput("notes", "").ok).toBe(false);
    expect(checkEchoInput("notes", 5).ok).toBe(false);
  });
});

describe("output sanitisation", () => {
  it("strips html, links, markdown and control characters", () => {
    const { text } = sanitizeDraft(
      "# Title\n<script>alert(1)</script>Dear **Ayu**, see [here](http://evil.test) or https://evil.test/x\u0000 ok"
    );
    expect(text).not.toMatch(/<|>|http|\*\*|\]\(|#|\u0000/);
    expect(text).toContain("Dear Ayu");
    expect(text).toContain("here");
  });
  it("truncates over 2,000 characters and says so", () => {
    const r = sanitizeDraft("a".repeat(MAX_DRAFT_CHARS + 500));
    expect(r.truncated).toBe(true);
    expect([...r.text].length).toBeLessThanOrEqual(MAX_DRAFT_CHARS);
    expect(r.text.endsWith(TRUNCATION_NOTE)).toBe(true);
  });
  it("leaves a draft within the limit untouched", () => {
    expect(sanitizeDraft("Dear Ayu,\n\nThank you.")).toEqual({ text: "Dear Ayu,\n\nThank you.", truncated: false });
  });
});

describe("rate limit", () => {
  it("allows 5 per owner per UTC day, then refuses; other owners unaffected", () => {
    const rl = createRateLimiter();
    const t = new Date("2026-11-21T10:00:00Z");
    for (let i = 0; i < DAILY_DRAFT_LIMIT; i++) expect(rl.tryConsume("a", t)).toBe(true);
    expect(rl.tryConsume("a", t)).toBe(false);
    expect(rl.remaining("a", t)).toBe(0);
    expect(rl.tryConsume("b", t)).toBe(true);
  });
  it("resets on the next day", () => {
    const rl = createRateLimiter(1);
    expect(rl.tryConsume("a", new Date("2026-11-21T23:59:00Z"))).toBe(true);
    expect(rl.tryConsume("a", new Date("2026-11-21T23:59:30Z"))).toBe(false);
    expect(rl.tryConsume("a", new Date("2026-11-22T00:00:01Z"))).toBe(true);
  });
});

describe("provider (graceful degradation)", () => {
  it("is null without a key, and for the .env.example placeholder", () => {
    expect(createEchoProvider({})).toBeNull();
    expect(createEchoProvider({ OPENROUTER_API_KEY: "  " })).toBeNull();
    expect(createEchoProvider({ OPENROUTER_API_KEY: "YOUR_OPENROUTER_API_KEY" })).toBeNull();
    expect(createEchoProvider({ OPENROUTER_API_KEY: "k" })?.name).toBe("openrouter");
  });
  it("posts the messages with a bearer key and returns the content", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "Dear Ayu" } }] })));
    const p = createOpenRouterProvider("k", "m", f as unknown as typeof fetch);
    expect(await p.complete([{ role: "user", content: "hi" }])).toBe("Dear Ayu");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("openrouter.ai");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
  });
  it("throws EchoProviderError on a non-OK status or empty content", async () => {
    const bad = createOpenRouterProvider("k", "m", (async () => new Response("no", { status: 429 })) as typeof fetch);
    await expect(bad.complete([])).rejects.toBeInstanceOf(EchoProviderError);
    const empty = createOpenRouterProvider("k", "m", (async () => new Response(JSON.stringify({ choices: [] }))) as typeof fetch);
    await expect(empty.complete([])).rejects.toBeInstanceOf(EchoProviderError);
  });
});

describe("runEchoDraft", () => {
  const ok: EchoProvider = { name: "t", complete: async () => "Dear Ayu,\n\nThank you for the garden." };
  const base = { ownerId: "o", notes: "garden", recipientName: "Ayu" };

  it("reports unavailable (503) without a provider and never fabricates a draft", async () => {
    const r = await runEchoDraft({ ...base, provider: null, limiter: createRateLimiter() });
    expect(r).toEqual({ ok: false, status: 503, error: UNAVAILABLE_MESSAGE });
  });
  it("returns a sanitised draft", async () => {
    const r = await runEchoDraft({ ...base, provider: ok, limiter: createRateLimiter() });
    expect(r).toEqual({ ok: true, draft: "Dear Ayu,\n\nThank you for the garden.", truncated: false });
  });
  it("invalid input costs no quota", async () => {
    const limiter = createRateLimiter(1);
    expect((await runEchoDraft({ ...base, notes: "", provider: ok, limiter })).ok).toBe(false);
    expect((await runEchoDraft({ ...base, provider: ok, limiter })).ok).toBe(true);
  });
  it("429 after the daily limit", async () => {
    const limiter = createRateLimiter(1);
    await runEchoDraft({ ...base, provider: ok, limiter });
    const r = await runEchoDraft({ ...base, provider: ok, limiter });
    expect(r).toMatchObject({ ok: false, status: 429 });
  });
  it("502 with a gentle message when the provider fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const bad: EchoProvider = { name: "t", complete: async () => { throw new EchoProviderError("boom"); } };
    const r = await runEchoDraft({ ...base, provider: bad, limiter: createRateLimiter() });
    expect(r).toMatchObject({ ok: false, status: 502 });
    expect(JSON.stringify(spy.mock.calls)).not.toContain("garden");
    spy.mockRestore();
  });
});

describe("ai_assisted on letter writes", () => {
  const body = (extra: object) => ({
    id: UUID_A,
    recipientKeeperId: UUID_B,
    payloadCiphertext: "Q0lQSEVS",
    iv: "AAAAAAAAAAAAAAAA",
    status: "draft",
    ...extra,
  });
  it("defaults to false and only true for a literal true", () => {
    const flag = (e: object) => {
      const r = parseLetterWrite(body(e));
      return r.ok ? r.value.aiAssisted : null;
    };
    expect(flag({})).toBe(false);
    expect(flag({ aiAssisted: true })).toBe(true);
    expect(flag({ aiAssisted: "true" })).toBe(false);
    expect(flag({ aiAssisted: false })).toBe(false);
  });
  it("the update route never writes ai_assisted=false (sticky)", () => {
    const src = readFileSync("app/api/letters/[id]/route.ts", "utf8");
    expect(src).toContain("...(v.aiAssisted ? { ai_assisted: true } : {})");
    expect(src).not.toMatch(/ai_assisted:\s*v\.aiAssisted/);
  });
});
