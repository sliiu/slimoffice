const ANTHROPIC_CACHE = { anthropic: { cacheControl: { type: "ephemeral" } } };
export function llmProviderOptions(provider, cacheKey) {
    if (provider === "openai" || provider === "openrouter") {
        return { openai: { promptCacheKey: cacheKey } };
    }
    return undefined;
}
export function cachedSystemMessage(text) {
    return {
        role: "system",
        content: text,
        providerOptions: ANTHROPIC_CACHE,
    };
}
export function stampToolCache(tools) {
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
