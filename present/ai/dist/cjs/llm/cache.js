"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmProviderOptions = llmProviderOptions;
exports.cachedSystemMessage = cachedSystemMessage;
exports.stampToolCache = stampToolCache;
const ANTHROPIC_CACHE = { anthropic: { cacheControl: { type: "ephemeral" } } };
function llmProviderOptions(provider, cacheKey) {
    if (provider === "openai" || provider === "openrouter") {
        return { openai: { promptCacheKey: cacheKey } };
    }
    return undefined;
}
function cachedSystemMessage(text) {
    return {
        role: "system",
        content: text,
        providerOptions: ANTHROPIC_CACHE,
    };
}
function stampToolCache(tools) {
    const keys = Object.keys(tools);
    const last = keys[keys.length - 1];
    if (!last)
        return tools;
    const prev = tools[last];
    return {
        ...tools,
        [last]: Object.assign({}, prev, {
            providerOptions: { ...prev.providerOptions, ...ANTHROPIC_CACHE },
        }),
    };
}
