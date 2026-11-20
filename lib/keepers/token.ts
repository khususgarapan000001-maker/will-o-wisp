/**
 * Invite tokens (design: "Invite tokens are hashed").
 *
 * The raw token exists only in the emailed link. The database stores its
 * SHA-256 hash, so a database leak cannot be turned into valid invite links.
 * Server-only (uses node:crypto); this is hashing, not vault crypto, so it
 * does not touch the lib/crypto rule about crypto.subtle.
 */

import { createHash, randomBytes } from "node:crypto";

export const INVITE_TTL_DAYS = 7;
const DAY_MS = 86_400_000;

/** 256 bits of randomness, URL-safe. */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Tokens we generate are 43 base64url chars; reject anything else early. */
export function looksLikeInviteToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function inviteExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * DAY_MS);
}

export function isInviteExpired(expiresAt: Date | string | null, now: Date): boolean {
  if (expiresAt === null) return true;
  return new Date(expiresAt).getTime() < now.getTime();
}

export function inviteUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/$/, "")}/keeper/invite/${token}`;
}
