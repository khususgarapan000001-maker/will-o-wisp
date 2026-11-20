import { createHash } from "node:crypto";

/**
 * SHA-256 of the client IP, for the check-in audit trail only. Server-only
 * (Node runtime). Uses node:crypto hashing, not WebCrypto, so the "crypto.subtle
 * only in lib/crypto" rule stays intact.
 */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip.trim()).digest("hex");
}
