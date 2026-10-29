// AI 配置层：类型 + zod schema。
//
// v2 设计：
//   1. 配置分三段 —— text（文本 LLM）/ image（AI 生图）/ imagery（图库检索 key）。
//      三段完全解耦：模型、key、endpoint 都可独立 BYO。
//   2. 持久化通过 ConfigStore 抽象（见 store.ts）注入：浏览器用 localStorage、
//      Node（MCP server / gateway / 测试）用环境变量。@ppt/ai 内部不直读任何存储。
//   3. zod schema 负责解析未知输入（localStorage JSON / env）并补默认值，
//      调用方拿到的 AiConfig 永远是完整结构。

import { z } from "zod";

export const TEXT_PROVIDER_KINDS = [
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
] as const;
export type TextProviderKind = (typeof TEXT_PROVIDER_KINDS)[number];

export const IMAGE_PROVIDER_KINDS = [
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
] as const;
export type ImageProviderKind = (typeof IMAGE_PROVIDER_KINDS)[number];

export const IMAGE_GEN_CONCURRENCY_MIN = 1;
export const IMAGE_GEN_CONCURRENCY_MAX = 8;
export const IMAGE_GEN_CONCURRENCY_DEFAULT = 2;

export const TEXT_REQUEST_CONCURRENCY_MIN = 1;
export const TEXT_REQUEST_CONCURRENCY_MAX = 8;
export const TEXT_REQUEST_CONCURRENCY_DEFAULT = 4;

/** 文本 LLM 配置段。 */
export const TextConfigSchema = z.object({
  provider: z.enum(TEXT_PROVIDER_KINDS).default("openai").catch("openai"),
  /** 空字符串 = 使用 provider preset 的 defaultModel（resolve 时兜底）。 */
  model: z.string().default(""),
  apiKey: z.string().default(""),
  /** 空 = 使用 provider preset 的官方 endpoint。 */
  baseURL: z.string().default(""),
  /**
   * 统一反代前缀。非空时所有请求以 `${proxyUrl}/${baseURL}` 形式中转，
   * 解决浏览器直连 OpenAI/Anthropic 的 CORS 问题（社区常见 5 行 Worker 约定）。
   */
  proxyUrl: z.string().default(""),
  /** 追加到生成/对话 system prompt 前的自定义前缀。 */
  systemPrefix: z.string().default(""),
  /** 自定义 HTTP header（JSON object 字符串）；私有云需要的额外 Bearer / X-* 头。 */
  customHeaders: z.string().default(""),
  /** 文本 LLM 请求并发上限（1–8）。一键生成逐页调用时生效；429 会再按服务商返回值下调。 */
  concurrency: z
    .number()
    .int()
    .min(TEXT_REQUEST_CONCURRENCY_MIN)
    .max(TEXT_REQUEST_CONCURRENCY_MAX)
    .catch(TEXT_REQUEST_CONCURRENCY_DEFAULT)
    .default(TEXT_REQUEST_CONCURRENCY_DEFAULT),
});
export type TextConfig = z.infer<typeof TextConfigSchema>;

/** AI 生图配置段（与文本 LLM 解耦）。 */
export const ImageConfigSchema = z.object({
  /** 空字符串 = 禁用 generateImage 工具（AI 调用得到"未配置"提示）。 */
  provider: z.enum(IMAGE_PROVIDER_KINDS).default("").catch(""),
  /** 空则 fallback 用 text.apiKey。 */
  apiKey: z.string().default(""),
  /** 空 = 使用 image provider preset 的官方 endpoint。 */
  baseURL: z.string().default(""),
  /** 空 = 使用 image provider preset 的 defaultModel。 */
  model: z.string().default(""),
  /**
   * 生图尺寸（Images API `size`）。留空 = 按 provider 自动（OpenAI vs 火山 Seedream 等）；
   * 填写后直接用该尺寸（如火山方舟 `2K`）。
   */
  size: z.string().default(""),
  /** enrich pipeline 中 AI 生图路径的并发上限（1–8）。 */
  concurrency: z
    .number()
    .int()
    .min(IMAGE_GEN_CONCURRENCY_MIN)
    .max(IMAGE_GEN_CONCURRENCY_MAX)
    .catch(IMAGE_GEN_CONCURRENCY_DEFAULT)
    .default(IMAGE_GEN_CONCURRENCY_DEFAULT),
});
export type ImageConfig = z.infer<typeof ImageConfigSchema>;

/** 可商用图库检索配置段（填任一 key 即开启对应来源）。 */
export const ImageryConfigSchema = z.object({
  /** Unsplash Access Key（开发者 Demo Key 限额 50/h）。 */
  unsplashKey: z.string().default(""),
  /** Pexels API Key。 */
  pexelsKey: z.string().default(""),
});
export type ImageryConfig = z.infer<typeof ImageryConfigSchema>;

export const AiConfigSchema = z.object({
  text: TextConfigSchema.prefault({}),
  image: ImageConfigSchema.prefault({}),
  imagery: ImageryConfigSchema.prefault({}),
  lockLayouts: z.boolean().default(true).catch(true),
});
export type AiConfig = z.infer<typeof AiConfigSchema>;

/** 完整默认配置（所有字段都有值；provider = openai）。 */
export function defaultConfig(): AiConfig {
  return AiConfigSchema.parse({});
}

/**
 * 从未知输入（localStorage JSON / env 拼装对象）解析出完整 AiConfig。
 * 解析失败或缺段一律回退默认值 —— 配置永远可用，不抛错。
 */
export function parseConfig(raw: unknown): AiConfig {
  const result = AiConfigSchema.safeParse(raw ?? {});
  if (result.success) return result.data;
  return defaultConfig();
}

/**
 * 解析 customHeaders（JSON 字符串）。失败时返回空对象 + error 信息，
 * 不抛错 —— 设置面板侧需要友好提示。
 */
export function parseCustomHeaders(raw: string | undefined): {
  headers: Record<string, string>;
  error?: string;
} {
  if (!raw || !raw.trim()) return { headers: {} };
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      return { headers: {}, error: "headers must be a JSON object" };
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = typeof v === "string" ? v : String(v);
    }
    return { headers: out };
  } catch (e) {
    return { headers: {}, error: (e as Error).message };
  }
}
