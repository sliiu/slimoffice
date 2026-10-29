import { z } from "zod";
export declare const TEXT_PROVIDER_KINDS: readonly ["openai", "anthropic", "google", "deepseek", "moonshot", "huggingface", "openrouter", "groq", "xai", "mistral", "together", "dashscope", "siliconflow", "zhipu", "volcengine", "ollama", "custom"];
export type TextProviderKind = (typeof TEXT_PROVIDER_KINDS)[number];
export declare const IMAGE_PROVIDER_KINDS: readonly ["", "openai-image", "openrouter", "xai", "together", "huggingface", "recraft", "stability", "fal", "siliconflow", "volcengine", "dashscope", "openai-compatible"];
export type ImageProviderKind = (typeof IMAGE_PROVIDER_KINDS)[number];
export declare const IMAGE_GEN_CONCURRENCY_MIN = 1;
export declare const IMAGE_GEN_CONCURRENCY_MAX = 8;
export declare const IMAGE_GEN_CONCURRENCY_DEFAULT = 2;
export declare const TEXT_REQUEST_CONCURRENCY_MIN = 1;
export declare const TEXT_REQUEST_CONCURRENCY_MAX = 8;
export declare const TEXT_REQUEST_CONCURRENCY_DEFAULT = 4;
/** 文本 LLM 配置段。 */
export declare const TextConfigSchema: z.ZodObject<{
    provider: z.ZodCatch<z.ZodDefault<z.ZodEnum<{
        anthropic: "anthropic";
        custom: "custom";
        dashscope: "dashscope";
        deepseek: "deepseek";
        google: "google";
        groq: "groq";
        huggingface: "huggingface";
        mistral: "mistral";
        moonshot: "moonshot";
        ollama: "ollama";
        openai: "openai";
        openrouter: "openrouter";
        siliconflow: "siliconflow";
        together: "together";
        volcengine: "volcengine";
        xai: "xai";
        zhipu: "zhipu";
    }>>>;
    model: z.ZodDefault<z.ZodString>;
    apiKey: z.ZodDefault<z.ZodString>;
    baseURL: z.ZodDefault<z.ZodString>;
    proxyUrl: z.ZodDefault<z.ZodString>;
    systemPrefix: z.ZodDefault<z.ZodString>;
    customHeaders: z.ZodDefault<z.ZodString>;
    concurrency: z.ZodDefault<z.ZodCatch<z.ZodNumber>>;
}, z.core.$strip>;
export type TextConfig = z.infer<typeof TextConfigSchema>;
/** AI 生图配置段（与文本 LLM 解耦）。 */
export declare const ImageConfigSchema: z.ZodObject<{
    provider: z.ZodCatch<z.ZodDefault<z.ZodEnum<{
        "": "";
        dashscope: "dashscope";
        fal: "fal";
        huggingface: "huggingface";
        "openai-compatible": "openai-compatible";
        "openai-image": "openai-image";
        openrouter: "openrouter";
        recraft: "recraft";
        siliconflow: "siliconflow";
        stability: "stability";
        together: "together";
        volcengine: "volcengine";
        xai: "xai";
    }>>>;
    apiKey: z.ZodDefault<z.ZodString>;
    baseURL: z.ZodDefault<z.ZodString>;
    model: z.ZodDefault<z.ZodString>;
    size: z.ZodDefault<z.ZodString>;
    concurrency: z.ZodDefault<z.ZodCatch<z.ZodNumber>>;
}, z.core.$strip>;
export type ImageConfig = z.infer<typeof ImageConfigSchema>;
/** 可商用图库检索配置段（填任一 key 即开启对应来源）。 */
export declare const ImageryConfigSchema: z.ZodObject<{
    unsplashKey: z.ZodDefault<z.ZodString>;
    pexelsKey: z.ZodDefault<z.ZodString>;
}, z.core.$strip>;
export type ImageryConfig = z.infer<typeof ImageryConfigSchema>;
export declare const AiConfigSchema: z.ZodObject<{
    text: z.ZodPrefault<z.ZodObject<{
        provider: z.ZodCatch<z.ZodDefault<z.ZodEnum<{
            anthropic: "anthropic";
            custom: "custom";
            dashscope: "dashscope";
            deepseek: "deepseek";
            google: "google";
            groq: "groq";
            huggingface: "huggingface";
            mistral: "mistral";
            moonshot: "moonshot";
            ollama: "ollama";
            openai: "openai";
            openrouter: "openrouter";
            siliconflow: "siliconflow";
            together: "together";
            volcengine: "volcengine";
            xai: "xai";
            zhipu: "zhipu";
        }>>>;
        model: z.ZodDefault<z.ZodString>;
        apiKey: z.ZodDefault<z.ZodString>;
        baseURL: z.ZodDefault<z.ZodString>;
        proxyUrl: z.ZodDefault<z.ZodString>;
        systemPrefix: z.ZodDefault<z.ZodString>;
        customHeaders: z.ZodDefault<z.ZodString>;
        concurrency: z.ZodDefault<z.ZodCatch<z.ZodNumber>>;
    }, z.core.$strip>>;
    image: z.ZodPrefault<z.ZodObject<{
        provider: z.ZodCatch<z.ZodDefault<z.ZodEnum<{
            "": "";
            dashscope: "dashscope";
            fal: "fal";
            huggingface: "huggingface";
            "openai-compatible": "openai-compatible";
            "openai-image": "openai-image";
            openrouter: "openrouter";
            recraft: "recraft";
            siliconflow: "siliconflow";
            stability: "stability";
            together: "together";
            volcengine: "volcengine";
            xai: "xai";
        }>>>;
        apiKey: z.ZodDefault<z.ZodString>;
        baseURL: z.ZodDefault<z.ZodString>;
        model: z.ZodDefault<z.ZodString>;
        size: z.ZodDefault<z.ZodString>;
        concurrency: z.ZodDefault<z.ZodCatch<z.ZodNumber>>;
    }, z.core.$strip>>;
    imagery: z.ZodPrefault<z.ZodObject<{
        unsplashKey: z.ZodDefault<z.ZodString>;
        pexelsKey: z.ZodDefault<z.ZodString>;
    }, z.core.$strip>>;
    lockLayouts: z.ZodCatch<z.ZodDefault<z.ZodBoolean>>;
}, z.core.$strip>;
export type AiConfig = z.infer<typeof AiConfigSchema>;
/** 完整默认配置（所有字段都有值；provider = openai）。 */
export declare function defaultConfig(): AiConfig;
/**
 * 从未知输入（localStorage JSON / env 拼装对象）解析出完整 AiConfig。
 * 解析失败或缺段一律回退默认值 —— 配置永远可用，不抛错。
 */
export declare function parseConfig(raw: unknown): AiConfig;
/**
 * 解析 customHeaders（JSON 字符串）。失败时返回空对象 + error 信息，
 * 不抛错 —— 设置面板侧需要友好提示。
 */
export declare function parseCustomHeaders(raw: string | undefined): {
    headers: Record<string, string>;
    error?: string;
};
