// 主流 provider 的默认配置 + 候选模型清单。
//
// 设计要点：
//   1. 每个 provider 给出 baseURL（官方 endpoint）+ defaultModel + models（下拉候选）。
//      UI 切换 provider 时自动套用，用户也可以手动改成任何值。
//   2. baseURL 全部是官方公网 endpoint；浏览器直连大多会被 CORS 拦截，配合
//      text.proxyUrl 自部署反代使用（llm/client.ts 会拼 `${proxyUrl}/${baseURL}`）。
//   3. 除 openai / anthropic / google 走官方 SDK 外，其余文本供应商一律 OpenAI-Compatible。
//   4. 图像供应商：多数走 /v1/images/generations；OpenRouter / HF / Stability / Fal 走各自协议。
import { isSystemTextRouteActive } from "../llm/offline-route.js";
import { IMAGE_GEN_CONCURRENCY_DEFAULT, IMAGE_GEN_CONCURRENCY_MAX, IMAGE_GEN_CONCURRENCY_MIN, TEXT_REQUEST_CONCURRENCY_DEFAULT, TEXT_REQUEST_CONCURRENCY_MAX, TEXT_REQUEST_CONCURRENCY_MIN, } from "./types.js";
export const PROVIDER_PRESETS = {
    openai: {
        label: "OpenAI",
        baseURL: "https://api.openai.com/v1",
        defaultModel: "gpt-4o-mini",
        models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1", "gpt-4.1-mini", "o3-mini", "o4-mini"],
        group: "international",
        keyPlaceholder: "sk-…",
    },
    anthropic: {
        label: "Anthropic Claude",
        baseURL: "https://api.anthropic.com/v1",
        defaultModel: "claude-sonnet-4-5",
        models: ["claude-sonnet-4-5", "claude-opus-4-5", "claude-haiku-4-5", "claude-3-5-sonnet-latest"],
        group: "international",
        keyPlaceholder: "sk-ant-…",
    },
    google: {
        label: "Google Gemini",
        baseURL: "https://generativelanguage.googleapis.com/v1beta",
        defaultModel: "gemini-2.5-flash",
        models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
        group: "international",
        keyPlaceholder: "AIza…",
    },
    openrouter: {
        label: "OpenRouter",
        baseURL: "https://openrouter.ai/api/v1",
        defaultModel: "openai/gpt-4o-mini",
        models: [
            "openai/gpt-4o-mini",
            "anthropic/claude-sonnet-4.5",
            "google/gemini-2.5-flash",
            "deepseek/deepseek-chat",
            "moonshotai/kimi-k2",
        ],
        group: "international",
        keyPlaceholder: "sk-or-…",
    },
    huggingface: {
        label: "Hugging Face",
        baseURL: "https://router.huggingface.co/v1",
        defaultModel: "moonshotai/Kimi-K2.5",
        models: [
            "moonshotai/Kimi-K2.5",
            "deepseek-ai/DeepSeek-V3-0324",
            "Qwen/Qwen2.5-72B-Instruct",
            "meta-llama/Llama-3.3-70B-Instruct",
        ],
        group: "international",
        keyPlaceholder: "hf_…",
    },
    groq: {
        label: "Groq",
        baseURL: "https://api.groq.com/openai/v1",
        defaultModel: "llama-3.3-70b-versatile",
        models: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "qwen/qwen3-32b", "moonshotai/kimi-k2-instruct"],
        group: "international",
        keyPlaceholder: "gsk_…",
    },
    xai: {
        label: "xAI Grok",
        baseURL: "https://api.x.ai/v1",
        defaultModel: "grok-3-mini",
        models: ["grok-3-mini", "grok-3", "grok-2-1212"],
        group: "international",
        keyPlaceholder: "xai-…",
    },
    mistral: {
        label: "Mistral",
        baseURL: "https://api.mistral.ai/v1",
        defaultModel: "mistral-small-latest",
        models: ["mistral-small-latest", "mistral-large-latest", "pixtral-large-latest"],
        group: "international",
    },
    together: {
        label: "Together AI",
        baseURL: "https://api.together.xyz/v1",
        defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        models: [
            "meta-llama/Llama-3.3-70B-Instruct-Turbo",
            "Qwen/Qwen2.5-72B-Instruct-Turbo",
            "deepseek-ai/DeepSeek-V3",
        ],
        group: "international",
    },
    deepseek: {
        label: "DeepSeek",
        baseURL: "https://api.deepseek.com",
        defaultModel: "deepseek-v4-flash",
        models: ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-v4-flash-vision-exp"],
        group: "china",
        keyPlaceholder: "sk-…",
    },
    moonshot: {
        label: "Kimi (Moonshot)",
        // 国内默认 .cn；国际站可改成 https://api.moonshot.ai/v1
        baseURL: "https://api.moonshot.cn/v1",
        defaultModel: "kimi-k2.5",
        models: ["kimi-k2.5", "kimi-k3", "moonshot-v1-auto", "moonshot-v1-128k"],
        group: "china",
        keyPlaceholder: "sk-…",
    },
    dashscope: {
        label: "通义千问 (DashScope)",
        baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        defaultModel: "qwen-plus",
        models: ["qwen-plus", "qwen-max", "qwen-turbo", "qwen3-max"],
        group: "china",
        keyPlaceholder: "sk-…",
    },
    siliconflow: {
        label: "硅基流动 SiliconFlow",
        baseURL: "https://api.siliconflow.cn/v1",
        defaultModel: "deepseek-ai/DeepSeek-V3",
        models: [
            "deepseek-ai/DeepSeek-V3",
            "Qwen/Qwen2.5-72B-Instruct",
            "moonshotai/Kimi-K2-Instruct",
            "Pro/deepseek-ai/DeepSeek-V3",
        ],
        group: "china",
        keyPlaceholder: "sk-…",
    },
    zhipu: {
        label: "智谱 GLM",
        baseURL: "https://open.bigmodel.cn/api/paas/v4",
        defaultModel: "glm-4-flash",
        models: ["glm-4-flash", "glm-4.5", "glm-4-plus", "glm-4-long"],
        group: "china",
    },
    volcengine: {
        label: "豆包 / 火山方舟",
        baseURL: "https://ark.cn-beijing.volces.com/api/v3",
        defaultModel: "doubao-seed-1-6-251015",
        models: ["doubao-seed-1-6-251015", "doubao-1.5-pro-32k", "doubao-pro-32k"],
        group: "china",
    },
    ollama: {
        label: "Ollama (local)",
        baseURL: "http://localhost:11434/v1",
        defaultModel: "llama3.2",
        models: ["llama3.2", "qwen2.5", "deepseek-r1", "llava"],
        group: "local",
        requiresApiKey: false,
    },
    custom: {
        label: "Custom / llama.cpp (OpenAI-compatible)",
        baseURL: "http://127.0.0.1:8080/v1",
        defaultModel: "local",
        models: [],
        group: "local",
        requiresApiKey: false,
    },
};
export const IMAGE_PROVIDER_PRESETS = {
    "openai-image": {
        label: "OpenAI Images (gpt-image-1 / DALL·E)",
        baseURL: "https://api.openai.com/v1/images/generations",
        defaultModel: "gpt-image-1",
        models: ["gpt-image-1", "dall-e-3", "dall-e-2"],
        group: "international",
        api: "openai",
    },
    openrouter: {
        label: "OpenRouter Images",
        baseURL: "https://openrouter.ai/api/v1/images",
        defaultModel: "black-forest-labs/flux.2-pro",
        models: [
            "black-forest-labs/flux.2-pro",
            "openai/gpt-image-1",
            "google/gemini-2.5-flash-image",
            "bytedance-seed/seedream-4.5",
            "x-ai/grok-2-image",
        ],
        group: "international",
        api: "openrouter",
        keyPlaceholder: "sk-or-…",
    },
    xai: {
        label: "xAI Grok Image",
        baseURL: "https://api.x.ai/v1/images/generations",
        defaultModel: "grok-2-image",
        models: ["grok-2-image"],
        group: "international",
        api: "openai",
    },
    together: {
        label: "Together (FLUX)",
        baseURL: "https://api.together.xyz/v1/images/generations",
        defaultModel: "black-forest-labs/FLUX.1-schnell",
        models: ["black-forest-labs/FLUX.1-schnell", "black-forest-labs/FLUX.1-dev"],
        group: "international",
        api: "openai",
    },
    huggingface: {
        label: "Hugging Face (FLUX / SD)",
        baseURL: "https://router.huggingface.co/hf-inference/models",
        defaultModel: "black-forest-labs/FLUX.1-schnell",
        models: [
            "black-forest-labs/FLUX.1-schnell",
            "black-forest-labs/FLUX.1-dev",
            "stabilityai/stable-diffusion-xl-base-1.0",
        ],
        group: "international",
        api: "huggingface",
        keyPlaceholder: "hf_…",
    },
    recraft: {
        label: "Recraft",
        baseURL: "https://external.api.recraft.ai/v1/images/generations",
        defaultModel: "recraftv3",
        models: ["recraftv3", "recraftv2"],
        group: "international",
        api: "openai",
    },
    stability: {
        label: "Stability AI",
        baseURL: "https://api.stability.ai/v2beta/stable-image/generate/core",
        defaultModel: "core",
        models: ["core", "ultra", "sd3"],
        group: "international",
        api: "stability",
        keyPlaceholder: "sk-…",
    },
    fal: {
        label: "Fal.ai (FLUX)",
        baseURL: "https://fal.run",
        defaultModel: "fal-ai/flux/schnell",
        models: ["fal-ai/flux/schnell", "fal-ai/flux/dev", "fal-ai/flux-pro/v1.1", "fal-ai/recraft-v3"],
        group: "international",
        api: "fal",
    },
    siliconflow: {
        label: "硅基流动 (FLUX / Kolors)",
        baseURL: "https://api.siliconflow.cn/v1/images/generations",
        defaultModel: "black-forest-labs/FLUX.1-schnell",
        models: ["black-forest-labs/FLUX.1-schnell", "Kwai-Kolors/Kolors"],
        group: "china",
        api: "openai",
    },
    volcengine: {
        label: "豆包 Seedream / 火山方舟",
        baseURL: "https://ark.cn-beijing.volces.com/api/v3/images/generations",
        defaultModel: "doubao-seedream-4-0-250828",
        models: ["doubao-seedream-4-0-250828", "doubao-seedream-4.5"],
        group: "china",
        api: "openai",
    },
    dashscope: {
        label: "通义万相 / Qwen-Image",
        baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1/images/generations",
        defaultModel: "qwen-image-plus",
        models: ["qwen-image-plus", "wanx2.1-t2i-plus", "wanx-v1"],
        group: "china",
        api: "openai",
    },
    "openai-compatible": {
        label: "Custom (OpenAI-compatible images)",
        baseURL: "https://api.openai.com/v1/images/generations",
        defaultModel: "gpt-image-1",
        models: [],
        group: "local",
        api: "openai",
    },
};
export function getProviderPreset(kind) {
    return PROVIDER_PRESETS[kind] ?? PROVIDER_PRESETS.custom;
}
export function getImageProviderPreset(kind) {
    if (!kind)
        return null;
    return IMAGE_PROVIDER_PRESETS[kind] ?? IMAGE_PROVIDER_PRESETS["openai-compatible"];
}
/**
 * 把 text 段的空字段（model / baseURL）按 provider preset 补齐。
 * 不改写用户已填内容；llm/client.ts 发请求前调用，UI 也可用来预览实际生效配置。
 */
export function resolveTextConfig(text) {
    const preset = getProviderPreset(text.provider);
    return {
        ...text,
        model: text.model.trim() ? text.model : preset.defaultModel,
        baseURL: text.baseURL.trim() ? text.baseURL : preset.baseURL,
    };
}
/** 把 image 段的空字段按 provider preset 补齐。provider 为空（禁用）时原样返回。 */
export function resolveImageConfig(image) {
    const preset = getImageProviderPreset(image.provider);
    if (!preset)
        return image;
    return {
        ...image,
        model: image.model.trim() ? image.model : preset.defaultModel,
        baseURL: image.baseURL.trim() ? image.baseURL : preset.baseURL,
    };
}
/**
 * 反代约定（示例 worker）：
 *   GET https://my-proxy.example.com/https://api.openai.com/v1/chat/completions
 *   → 反代取 path = "https://api.openai.com/v1/chat/completions"，原样请求。
 */
export function applyProxyUrl(baseURL, proxyUrl) {
    const proxy = proxyUrl.trim();
    if (!proxy)
        return baseURL;
    return `${proxy.replace(/\/$/, "")}/${baseURL}`;
}
export function clampImageGenConcurrency(n) {
    const v = typeof n === "number" ? n : Number.parseInt(String(n ?? ""), 10);
    if (!Number.isFinite(v))
        return IMAGE_GEN_CONCURRENCY_DEFAULT;
    return Math.min(IMAGE_GEN_CONCURRENCY_MAX, Math.max(IMAGE_GEN_CONCURRENCY_MIN, Math.floor(v)));
}
export function clampTextRequestConcurrency(n) {
    const v = typeof n === "number" ? n : Number.parseInt(String(n ?? ""), 10);
    if (!Number.isFinite(v))
        return TEXT_REQUEST_CONCURRENCY_DEFAULT;
    return Math.min(TEXT_REQUEST_CONCURRENCY_MAX, Math.max(TEXT_REQUEST_CONCURRENCY_MIN, Math.floor(v)));
}
export function isLocalLlmEndpoint(url) {
    const raw = url.trim();
    if (!raw)
        return false;
    let host = "";
    try {
        host = new URL(raw).hostname.toLowerCase();
    }
    catch {
        return /localhost|127\.0\.0\.1|\[::1\]/i.test(raw);
    }
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local"))
        return true;
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (!m)
        return false;
    const a = Number(m[1]);
    const b = Number(m[2]);
    return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}
/**
 * 文本 LLM 配置是否可用（UI 禁用生成按钮的依据）。不验证 key 真伪。
 * model / baseURL 缺失会被 preset 兜底；Ollama / llama.cpp / 局域网 endpoint 不强制 key。
 */
export function isConfigUsable(config) {
    if (isSystemTextRouteActive())
        return true;
    const text = resolveTextConfig(config.text);
    if (!text.model)
        return false;
    const preset = getProviderPreset(text.provider);
    if (preset.requiresApiKey === false)
        return true;
    if (isLocalLlmEndpoint(text.baseURL))
        return true;
    return !!text.apiKey;
}
/**
 * Whether the text LLM can accept image parts (handwriting OCR).
 * DeepSeek chat/reasoner and other text-only OpenAI-compatible models return 400
 * if we send a vision payload — skip those and fall back to on-device OCR.
 */
export function textModelSupportsVision(text) {
    if (isSystemTextRouteActive())
        return true;
    const resolved = resolveTextConfig(text);
    const model = resolved.model.trim().toLowerCase();
    const base = resolved.baseURL.trim().toLowerCase();
    const hay = `${model} ${base}`;
    if (resolved.provider === "deepseek" || /deepseek\.com/.test(base) || /deepseek-(chat|reasoner|v3|r1)\b/.test(model)) {
        return /vl|vision/.test(model);
    }
    if (/\b(gpt-3\.5|o1-mini|o3-mini|o4-mini)\b/.test(model))
        return false;
    if (resolved.provider === "anthropic" || resolved.provider === "google")
        return true;
    if (resolved.provider === "openai") {
        return /gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-4-vision|gpt-5/.test(model);
    }
    if (resolved.provider === "ollama")
        return /llava|vision|vl/.test(model);
    return /vl|vision|gpt-4o|gpt-4\.1|gpt-4-turbo|claude|gemini|pixtral|llava|kimi-k3/.test(hay);
}
