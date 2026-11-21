/**
 * Echo provider adapter (Spec 7). Provider-agnostic interface plus an
 * OpenRouter implementation. Same graceful-degradation pattern as the mailer:
 * with no key configured, `createEchoProvider` returns null and Echo reports
 * itself unavailable. It never fabricates output.
 */

import type { EchoMessage } from "@/lib/echo/prompt";

export interface EchoProvider {
  readonly name: string;
  complete(messages: EchoMessage[], signal?: AbortSignal): Promise<string>;
}

export class EchoProviderError extends Error {}

export interface EchoEnv {
  OPENROUTER_API_KEY?: string | undefined;
  OPENROUTER_MODEL?: string | undefined;
}

/**
 * Free-tier default, verified live 21 Nov 2026 (key "will-o-wisp-echo",
 * OpenRouter free tier, 50 free requests/day). The previous default
 * (meta-llama/llama-3.3-70b-instruct:free) is no longer free — OpenRouter
 * returns 404 for it. Override with OPENROUTER_MODEL as availability
 * changes; free models rotate and upstream shared pools rate-limit.
 */
export const DEFAULT_OPENROUTER_MODEL = "nvidia/nemotron-3.5-lightning:free";

/** Token budget per draft. This model reasons (~1,500 tokens) before it
 * writes, so 700 starves it to an empty reply; 2,000 leaves room for a
 * ~300-char letter. Harmless for non-reasoning models (a cap, not a target). */
const ECHO_MAX_TOKENS = 2000;

export function createOpenRouterProvider(
  apiKey: string,
  model: string = DEFAULT_OPENROUTER_MODEL,
  fetchImpl: typeof fetch = fetch
): EchoProvider {
  return {
    name: "openrouter",
    async complete(messages, signal) {
      let res: Response;
      try {
        res = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages, max_tokens: ECHO_MAX_TOKENS, temperature: 0.7 }),
          signal,
        });
      } catch (err) {
        throw new EchoProviderError(err instanceof Error ? err.message : "network error");
      }
      if (!res.ok) throw new EchoProviderError(`provider status ${res.status}`);
      const data = (await res.json().catch(() => null)) as {
        choices?: { message?: { content?: unknown } }[];
      } | null;
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim().length === 0) {
        throw new EchoProviderError("empty response");
      }
      return content;
    },
  };
}

/** Returns null when no usable key is configured. */
export function createEchoProvider(env: EchoEnv, fetchImpl?: typeof fetch): EchoProvider | null {
  const key = env.OPENROUTER_API_KEY?.trim();
  // The .env.example placeholder must not count as a real key.
  if (!key || key.startsWith("YOUR_")) return null;
  return createOpenRouterProvider(key, env.OPENROUTER_MODEL?.trim() || undefined, fetchImpl);
}

export function createEchoProviderFromEnv(
  env: Record<string, string | undefined>,
  fetchImpl?: typeof fetch
): EchoProvider | null {
  return createEchoProvider(
    { OPENROUTER_API_KEY: env.OPENROUTER_API_KEY, OPENROUTER_MODEL: env.OPENROUTER_MODEL },
    fetchImpl
  );
}
