import { describe, expect, it } from "vitest";
import {
  INVITE_TTL_DAYS,
  generateInviteToken,
  hashInviteToken,
  inviteExpiry,
  inviteUrl,
  isInviteExpired,
  looksLikeInviteToken,
} from "@/lib/keepers/token";
import {
  normalizeNote,
  validateInvite,
  validateKeeperPassword,
} from "@/lib/keepers/validation";
import { isProtectedPath } from "@/lib/auth/protected-paths";

describe("invite tokens", () => {
  it("generates unguessable, URL-safe, unique tokens", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).not.toBe(b);
    expect(looksLikeInviteToken(a)).toBe(true);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hashes with SHA-256 (known vector) and never stores the raw token", () => {
    expect(hashInviteToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    const t = generateInviteToken();
    expect(hashInviteToken(t)).not.toContain(t);
    expect(hashInviteToken(t)).toBe(hashInviteToken(t));
    expect(hashInviteToken(t)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects malformed tokens before any database lookup", () => {
    expect(looksLikeInviteToken("")).toBe(false);
    expect(looksLikeInviteToken("short")).toBe(false);
    expect(looksLikeInviteToken("a".repeat(43) + "!")).toBe(false);
    expect(looksLikeInviteToken("a".repeat(43))).toBe(true);
  });

  it("expires after 7 days", () => {
    const now = new Date("2026-11-20T10:00:00Z");
    const exp = inviteExpiry(now);
    expect(INVITE_TTL_DAYS).toBe(7);
    expect(exp.toISOString()).toBe("2026-11-27T10:00:00.000Z");
    expect(isInviteExpired(exp, new Date("2026-11-27T09:59:59Z"))).toBe(false);
    expect(isInviteExpired(exp, new Date("2026-11-27T10:00:01Z"))).toBe(true);
    expect(isInviteExpired(null, now)).toBe(true);
  });

  it("builds the invite link", () => {
    expect(inviteUrl("https://x.test/", "tok")).toBe("https://x.test/keeper/invite/tok");
  });
});

describe("invite validation", () => {
  it("accepts a normal invite and normalises it", () => {
    const r = validateInvite({ name: "  Sari ", email: " Sari@Example.COM ", relationship: " sister " });
    expect(r).toEqual({
      ok: true,
      value: { name: "Sari", email: "sari@example.com", relationship: "sister" },
    });
  });

  it("treats an empty relationship as none", () => {
    const r = validateInvite({ name: "A", email: "a@b.co", relationship: "  " });
    expect(r.ok && r.value.relationship).toBe(null);
  });

  it("rejects a missing name, bad email and over-long fields with gentle copy", () => {
    for (const bad of [
      { name: "", email: "a@b.co" },
      { name: "x".repeat(101), email: "a@b.co" },
      { name: "A", email: "not-an-email" },
      { name: "A", email: "a@b" },
      { name: "A", email: "a@b.co", relationship: "r".repeat(101) },
      { name: 5, email: null },
    ]) {
      const r = validateInvite(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
    }
  });

  it("validates keeper passwords and decision notes", () => {
    expect(validateKeeperPassword("short")).not.toBeNull();
    expect(validateKeeperPassword(undefined)).not.toBeNull();
    expect(validateKeeperPassword("long-enough-1")).toBeNull();
    expect(normalizeNote("  Spoke to her yesterday  ")).toBe("Spoke to her yesterday");
    expect(normalizeNote("   ")).toBeNull();
    expect(normalizeNote(42)).toBeNull();
    expect(normalizeNote("x".repeat(900))).toHaveLength(500);
  });
});

describe("middleware path protection", () => {
  it("keeps /app and /keeper behind sign-in", () => {
    expect(isProtectedPath("/app")).toBe(true);
    expect(isProtectedPath("/app/keepers")).toBe(true);
    expect(isProtectedPath("/keeper")).toBe(true);
    expect(isProtectedPath("/keeper/release/abc")).toBe(true);
    expect(isProtectedPath("/keeper/release/abc/vault")).toBe(true);
  });

  it("leaves the invite landing page, auth and marketing public", () => {
    expect(isProtectedPath("/keeper/invite/sometoken")).toBe(false);
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/auth/sign-in")).toBe(false);
    expect(isProtectedPath("/api/keepers/accept")).toBe(false);
  });

  it("does not treat look-alike prefixes as protected paths by accident", () => {
    expect(isProtectedPath("/application")).toBe(false);
    expect(isProtectedPath("/keepers")).toBe(false);
  });
});
