import type { ModelMessage, Tool } from "ai";
import type { TextProviderKind } from "../config/types.js";
export declare function llmProviderOptions(provider: TextProviderKind, cacheKey: string): Record<string, Record<string, string>> | undefined;
export declare function cachedSystemMessage(text: string): ModelMessage;
export declare function stampToolCache(tools: Record<string, Tool>): Record<string, Tool>;
