/**
 * Echo draft orchestration, kept free of Next.js and Supabase so it can be
 * unit-tested. It receives ONLY notes + recipient name; it has no database
 * access of any kind (privacy boundary, Spec 7 task 2.2).
 */

import { buildEchoMessages, checkEchoInput, sanitizeDraft } from "@/lib/echo/prompt";
import type { EchoProvider } from "@/lib/echo/provider";
import type { RateLimiter } from "@/lib/echo/rate-limit";

export type DraftResult =
  | { ok: true; draft: string; truncated: boolean }
  | { ok: false; status: 400 | 429 | 502 | 503; error: string };

export const UNAVAILABLE_MESSAGE = "AI drafting isn't configured yet. You can still write your letter by hand.";
export const RATE_LIMIT_MESSAGE = "You've used today's five drafts. Please try again tomorrow, or write by hand.";
export const PROVIDER_FAILED_MESSAGE =
  "Echo couldn't write a draft just now. Your notes are still here. Please try again in a little while.";

export async function runEchoDraft(args: {
  ownerId: string;
  notes: unknown;
  recipientName: unknown;
  provider: EchoProvider | null;
  limiter: RateLimiter;
  now?: Date;
}): Promise<DraftResult> {
  if (!args.provider) return { ok: false, status: 503, error: UNAVAILABLE_MESSAGE };
  const check = checkEchoInput(args.notes, args.recipientName);
  if (!check.ok) return { ok: false, status: 400, error: check.error };
  // Consume only after validation, so a rejected request costs no quota.
  if (!args.limiter.tryConsume(args.ownerId, args.now)) {
    return { ok: false, status: 429, error: RATE_LIMIT_MESSAGE };
  }
  try {
    const raw = await args.provider.complete(
      buildEchoMessages({ notes: args.notes as string, recipientName: args.recipientName as string })
    );
    const { text, truncated } = sanitizeDraft(raw);
    if (!text) return { ok: false, status: 502, error: PROVIDER_FAILED_MESSAGE };
    return { ok: true, draft: text, truncated };
  } catch {
    // Technical detail is deliberately not logged with request content.
    console.error("[echo/draft] provider call failed");
    return { ok: false, status: 502, error: PROVIDER_FAILED_MESSAGE };
  }
}
