"use strict";
// AI 配置层：类型 + zod schema。
//
// v2 设计：
//   1. 配置分三段 —— text（文本 LLM）/ image（AI 生图）/ imagery（图库检索 key）。
//      三段完全解耦：模型、key、endpoint 都可独立 BYO。
//   2. 持久化通过 ConfigStore 抽象（见 store.ts）注入：浏览器用 localStorage、
//      Node（MCP server / gateway / 测试）用环境变量。@sliiu/present-ai 内部不直读任何存储。
//   3. zod schema 负责解析未知输入（localStorage JSON / env）并补默认值，
//      调用方拿到的 AiConfig 永远是完整结构。
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiConfigSchema = exports.ImageryConfigSchema = exports.ImageConfigSchema = exports.TextConfigSchema = exports.TEXT_REQUEST_CONCURRENCY_DEFAULT = exports.TEXT_REQUEST_CONCURRENCY_MAX = exports.TEXT_REQUEST_CONCURRENCY_MIN = exports.IMAGE_GEN_CONCURRENCY_DEFAULT = exports.IMAGE_GEN_CONCURRENCY_MAX = exports.IMAGE_GEN_CONCURRENCY_MIN = exports.IMAGE_PROVIDER_KINDS = exports.TEXT_PROVIDER_KINDS = void 0;
exports.defaultConfig = defaultConfig;
exports.parseConfig = parseConfig;
exports.parseCustomHeaders = parseCustomHeaders;
const zod_1 = require("zod");
exports.TEXT_PROVIDER_KINDS = [
    "openai",
    "anthropic",
    "google",
    "deepseek",
    "moonshot",
    "huggingface",
    "openrouter",
    "groq",
    "xai",
    "mistral",
    "together",
    "dashscope",
    "siliconflow",
    "zhipu",
    "volcengine",
    "ollama",
    "custom",
];
exports.IMAGE_PROVIDER_KINDS = [
    "",
    "openai-image",
    "openrouter",
    "xai",
    "together",
    "huggingface",
    "recraft",
    "stability",
    "fal",
    "siliconflow",
    "volcengine",
    "dashscope",
    "openai-compatible",
];
exports.IMAGE_GEN_CONCURRENCY_MIN = 1;
exports.IMAGE_GEN_CONCURRENCY_MAX = 8;
exports.IMAGE_GEN_CONCURRENCY_DEFAULT = 2;
exports.TEXT_REQUEST_CONCURRENCY_MIN = 1;
exports.TEXT_REQUEST_CONCURRENCY_MAX = 8;
exports.TEXT_REQUEST_CONCURRENCY_DEFAULT = 4;
/** 文本 LLM 配置段。 */
exports.TextConfigSchema = zod_1.z.object({
    provider: zod_1.z.enum(exports.TEXT_PROVIDER_KINDS).default("openai").catch("openai"),
    /** 空字符串 = 使用 provider preset 的 defaultModel（resolve 时兜底）。 */
    model: zod_1.z.string().default(""),
    apiKey: zod_1.z.string().default(""),
    /** 空 = 使用 provider preset 的官方 endpoint。 */
    baseURL: zod_1.z.string().default(""),
    /**
     * 统一反代前缀。非空时所有请求以 `${proxyUrl}/${baseURL}` 形式中转，
     * 解决浏览器直连 OpenAI/Anthropic 的 CORS 问题（社区常见 5 行 Worker 约定）。
     */
    proxyUrl: zod_1.z.string().default(""),
    /** 追加到生成/对话 system prompt 前的自定义前缀。 */
    systemPrefix: zod_1.z.string().default(""),
    /** 自定义 HTTP header（JSON object 字符串）；私有云需要的额外 Bearer / X-* 头。 */
    customHeaders: zod_1.z.string().default(""),
    /** 文本 LLM 请求并发上限（1–8）。一键生成逐页调用时生效；429 会再按服务商返回值下调。 */
    concurrency: zod_1.z
        .number()
        .int()
        .min(exports.TEXT_REQUEST_CONCURRENCY_MIN)
        .max(exports.TEXT_REQUEST_CONCURRENCY_MAX)
        .catch(exports.TEXT_REQUEST_CONCURRENCY_DEFAULT)
        .default(exports.TEXT_REQUEST_CONCURRENCY_DEFAULT),
});
/** AI 生图配置段（与文本 LLM 解耦）。 */
exports.ImageConfigSchema = zod_1.z.object({
    /** 空字符串 = 禁用 generateImage 工具（AI 调用得到"未配置"提示）。 */
    provider: zod_1.z.enum(exports.IMAGE_PROVIDER_KINDS).default("").catch(""),
    /** 空则 fallback 用 text.apiKey。 */
    apiKey: zod_1.z.string().default(""),
    /** 空 = 使用 image provider preset 的官方 endpoint。 */
    baseURL: zod_1.z.string().default(""),
    /** 空 = 使用 image provider preset 的 defaultModel。 */
    model: zod_1.z.string().default(""),
    /**
     * 生图尺寸（Images API `size`）。留空 = 按 provider 自动（OpenAI vs 火山 Seedream 等）；
     * 填写后直接用该尺寸（如火山方舟 `2K`）。
     */
    size: zod_1.z.string().default(""),
    /** enrich pipeline 中 AI 生图路径的并发上限（1–8）。 */
    concurrency: zod_1.z
        .number()
        .int()
        .min(exports.IMAGE_GEN_CONCURRENCY_MIN)
        .max(exports.IMAGE_GEN_CONCURRENCY_MAX)
        .catch(exports.IMAGE_GEN_CONCURRENCY_DEFAULT)
        .default(exports.IMAGE_GEN_CONCURRENCY_DEFAULT),
});
/** 可商用图库检索配置段（填任一 key 即开启对应来源）。 */
exports.ImageryConfigSchema = zod_1.z.object({
    /** Unsplash Access Key（开发者 Demo Key 限额 50/h）。 */
    unsplashKey: zod_1.z.string().default(""),
    /** Pexels API Key。 */
    pexelsKey: zod_1.z.string().default(""),
});
exports.AiConfigSchema = zod_1.z.object({
    text: exports.TextConfigSchema.prefault({}),
    image: exports.ImageConfigSchema.prefault({}),
    imagery: exports.ImageryConfigSchema.prefault({}),
    lockLayouts: zod_1.z.boolean().default(true).catch(true),
});
/** 完整默认配置（所有字段都有值；provider = openai）。 */
function defaultConfig() {
    return exports.AiConfigSchema.parse({});
}
/**
 * 从未知输入（localStorage JSON / env 拼装对象）解析出完整 AiConfig。
 * 解析失败或缺段一律回退默认值 —— 配置永远可用，不抛错。
 */
function parseConfig(raw) {
    const result = exports.AiConfigSchema.safeParse(raw ?? {});
    if (result.success)
        return result.data;
    return defaultConfig();
}
/**
 * 解析 customHeaders（JSON 字符串）。失败时返回空对象 + error 信息，
 * 不抛错 —— 设置面板侧需要友好提示。
 */
function parseCustomHeaders(raw) {
    if (!raw || !raw.trim())
        return { headers: {} };
    try {
        const obj = JSON.parse(raw);
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
            return { headers: {}, error: "headers must be a JSON object" };
        }
        const out = {};
        for (const [k, v] of Object.entries(obj)) {
            out[k] = typeof v === "string" ? v : String(v);
        }
        return { headers: out };
    }
    catch (e) {
        return { headers: {}, error: e.message };
    }
}
