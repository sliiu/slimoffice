import type { AiConfig, ImageConfig, ImageProviderKind, TextConfig, TextProviderKind } from "./types.js";
export type ProviderGroup = "international" | "china" | "local";
export interface ProviderPreset {
    label: string;
    /** 官方 / 默认 endpoint。custom 时给最常见的兼容地址作占位。 */
    baseURL: string;
    /** 切换到该 provider 时建议使用的默认模型。 */
    defaultModel: string;
    /** 下拉候选清单（不限制用户自由输入）。 */
    models: string[];
    /** 设置页 <optgroup>。 */
    group: ProviderGroup;
    /** API Key 输入框 placeholder。 */
    keyPlaceholder?: string;
    /** false = 本地 / 无需 key（如 Ollama）。缺省 true。 */
    requiresApiKey?: boolean;
}
/** 图像 API 协议。openai = OpenAI Images / 兼容 /v1/images/generations。 */
export type ImageApiKind = "openai" | "openrouter" | "stability" | "fal" | "huggingface";
export interface ImageProviderPreset {
    label: string;
    baseURL: string;
    defaultModel: string;
    models: string[];
    group: ProviderGroup;
    api: ImageApiKind;
    keyPlaceholder?: string;
}
export declare const PROVIDER_PRESETS: Record<TextProviderKind, ProviderPreset>;
export declare const IMAGE_PROVIDER_PRESETS: Record<Exclude<ImageProviderKind, "">, ImageProviderPreset>;
export declare function getProviderPreset(kind: TextProviderKind): ProviderPreset;
export declare function getImageProviderPreset(kind: ImageProviderKind): ImageProviderPreset | null;
/**
 * 把 text 段的空字段（model / baseURL）按 provider preset 补齐。
 * 不改写用户已填内容；llm/client.ts 发请求前调用，UI 也可用来预览实际生效配置。
 */
export declare function resolveTextConfig(text: TextConfig): TextConfig;
/** 把 image 段的空字段按 provider preset 补齐。provider 为空（禁用）时原样返回。 */
export declare function resolveImageConfig(image: ImageConfig): ImageConfig;
/**
 * 反代约定（示例 worker）：
 *   GET https://my-proxy.example.com/https://api.openai.com/v1/chat/completions
 *   → 反代取 path = "https://api.openai.com/v1/chat/completions"，原样请求。
 */
export declare function applyProxyUrl(baseURL: string, proxyUrl: string): string;
export declare function clampImageGenConcurrency(n: unknown): number;
export declare function clampTextRequestConcurrency(n: unknown): number;
export declare function isLocalLlmEndpoint(url: string): boolean;
/**
 * 文本 LLM 配置是否可用（UI 禁用生成按钮的依据）。不验证 key 真伪。
 * model / baseURL 缺失会被 preset 兜底；Ollama / llama.cpp / 局域网 endpoint 不强制 key。
 */
export declare function isConfigUsable(config: AiConfig): boolean;
/**
 * Whether the text LLM can accept image parts (handwriting OCR).
 * DeepSeek chat/reasoner and other text-only OpenAI-compatible models return 400
 * if we send a vision payload — skip those and fall back to on-device OCR.
 */
export declare function textModelSupportsVision(text: TextConfig): boolean;
