"use strict";
// LLM 客户端工厂：根据 TextConfig 构造 Vercel AI SDK 的 LanguageModel 实例。
//
// 关键设计：
//   1. 所有 provider 通过同一个 createLlm(text) 入口暴露 —— 调用方（chat / generate）
//      只关心 LanguageModel，不关心后面是哪家。
//   2. 浏览器直连 OpenAI / Anthropic / Google 官方 endpoint 通常被 CORS 拦截：
//        a) 默认把 text.baseURL 作为 baseURL；
//        b) text.proxyUrl 非空时包成 `${proxyUrl}/${baseURL}`，走用户自部署反代
//           （path-prefix 约定，与社区常见 Cloudflare Worker / Vercel Edge 一致）。
//   3. Node 宿主（MCP server / gateway）直连官方 endpoint，无需反代。
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLlm = createLlm;
const anthropic_1 = require("@ai-sdk/anthropic");
const google_1 = require("@ai-sdk/google");
const openai_1 = require("@ai-sdk/openai");
const openai_compatible_1 = require("@ai-sdk/openai-compatible");
const types_1 = require("../config/types");
const presets_1 = require("../config/presets");
const limit_1 = require("./limit");
const offline_route_1 = require("./offline-route");
function createLlm(text) {
    const system = (0, offline_route_1.systemTextRoute)();
    if (system) {
        (0, limit_1.setGenerateJsonConcurrency)((0, presets_1.clampTextRequestConcurrency)(text.concurrency));
        const provider = (0, openai_compatible_1.createOpenAICompatible)({
            name: "slimppt-system",
            apiKey: "session",
            baseURL: system.baseURL,
            fetch: system.fetchImpl,
        });
        const model = system.model || "auto";
        return { model: provider(model), label: model === "auto" ? "Auto" : model };
    }
    // 先按 provider preset 兜底空字段 —— UI 显示 / 日志 / 标签都拿到实际生效配置。
    const resolved = (0, presets_1.resolveTextConfig)(text);
    (0, limit_1.setGenerateJsonConcurrency)((0, presets_1.clampTextRequestConcurrency)(resolved.concurrency));
    const preset = (0, presets_1.getProviderPreset)(resolved.provider);
    const { headers, error } = (0, types_1.parseCustomHeaders)(resolved.customHeaders);
    if (error) {
        // 不抛 —— 让调用方在 UI 状态栏看到原因，避免一个 JSON 输错就完全用不了。
        console.warn("[ai] customHeaders parse error:", error);
    }
    const extraHeaders = mergeProviderHeaders(resolved.provider, headers);
    const finalBaseURL = (0, presets_1.applyProxyUrl)(resolved.baseURL, resolved.proxyUrl);
    const apiKey = resolved.apiKey ||
        (preset.requiresApiKey === false || (0, presets_1.isLocalLlmEndpoint)(resolved.baseURL) ? "local" : resolved.apiKey);
    if (resolved.provider === "openai") {
        const provider = (0, openai_1.createOpenAI)({ apiKey, baseURL: finalBaseURL, headers: extraHeaders });
        return { model: provider(resolved.model), label: `${preset.label} · ${resolved.model}` };
    }
    if (resolved.provider === "anthropic") {
        const provider = (0, anthropic_1.createAnthropic)({ apiKey, baseURL: finalBaseURL, headers: extraHeaders });
        return { model: provider(resolved.model), label: `${preset.label} · ${resolved.model}` };
    }
    if (resolved.provider === "google") {
        const provider = (0, google_1.createGoogleGenerativeAI)({ apiKey, baseURL: finalBaseURL, headers: extraHeaders });
        return { model: provider(resolved.model), label: `${preset.label} · ${resolved.model}` };
    }
    // 其余一律 OpenAI-Compatible：DeepSeek / Kimi / HF / OpenRouter / Groq / 通义 / 硅基 / Ollama…
    const provider = (0, openai_compatible_1.createOpenAICompatible)({
        name: resolved.provider,
        apiKey,
        baseURL: finalBaseURL,
        headers: extraHeaders,
    });
    return { model: provider(resolved.model), label: `${preset.label} · ${resolved.model}` };
}
function mergeProviderHeaders(kind, user) {
    const defaults = kind === "openrouter"
        ? { "HTTP-Referer": "https://slimppt.app", "X-Title": "SlimPPT" }
        : {};
    const merged = { ...defaults, ...user };
    return Object.keys(merged).length > 0 ? merged : undefined;
}
