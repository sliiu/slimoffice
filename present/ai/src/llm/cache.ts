import type { ModelMessage, Tool } from "ai";
import type { TextProviderKind } from "../config/types";

const ANTHROPIC_CACHE = { anthropic: { cacheControl: { type: "ephemeral" as const } } };

export function llmProviderOptions(
  provider: TextProviderKind,
  cacheKey: string,
): Record<string, Record<string, string>> | undefined {
  if (provider === "openai" || provider === "openrouter") {
    return { openai: { promptCacheKey: cacheKey } };
  }
  return undefined;
}

export function cachedSystemMessage(text: string): ModelMessage {
  return {
    role: "system",
    content: text,
    providerOptions: ANTHROPIC_CACHE,
  };
}

export function stampToolCache(tools: Record<string, Tool>): Record<string, Tool> {
  const keys = Object.keys(tools);
  const last = keys[keys.length - 1];
  if (!last) return tools;
  const prev = tools[last] as Tool & { providerOptions?: Record<string, unknown> };
  return {
    ...tools,
    [last]: Object.assign({}, prev, {
      providerOptions: { ...prev.providerOptions, ...ANTHROPIC_CACHE },
    }),
  };
}
