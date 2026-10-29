import type { AiConfig } from "../../config/types.js";
import { type StockImageFetchResult } from "./fetch-stock.js";
export type EnrichmentImageKind = "bg" | "hero" | "inline";
export type ImageEnrichmentPriority = "stock-first" | "ai-first";
/**
 * 双源都配了时的默认顺序。
 *
 * 选 ai-first 而不是 stock-first：图库只能按关键词检索既有照片，命中的是"和标题
 * 沾点边"的通用素材，且完全吃不到主题色 / 风格族 / 本页内容这些上下文（tryStock
 * 根本不消费 promptContext）。生图拿得到完整的 ImagePromptContext，出来的画面
 * 跟这一篇的主题与配色是一路的。图库退居兜底：生图失败 / 限流时仍然有图可用。
 */
export declare const DEFAULT_IMAGE_ENRICHMENT_PRIORITY: ImageEnrichmentPriority;
export interface EnrichmentImageFetchResult extends StockImageFetchResult {
    source: "unsplash" | "pexels" | "ai";
}
export declare function imageEnrichmentSources(config: AiConfig): {
    stock: boolean;
    ai: boolean;
};
export declare function imageEnrichmentAvailable(config: AiConfig): boolean;
export declare function resolveImageGenConcurrency(config: AiConfig): number;
/** 429 / 账户额度耗尽：继续重试只会烧配额，应熔断本轮 AI 生图。 */
export declare function isImageRateLimitError(err: unknown): boolean;
/**
 * 主题 / 风格上下文，用来把 AI 图像 prompt 从通用模板升级为"贴合主题"。
 * 由 enrich 层（images.ts）从 realized theme + guidance 解析后透传下来。
 */
export interface ImagePromptContext {
    /** 风格族 id（ppt_style_systems），仅用于调试 / 追溯。 */
    styleFamily?: string;
    /** 主题明暗（由 palette.bg 亮度推导），决定底色倾向。 */
    themeMode?: "light" | "dark";
    /** 主题强调色 hex，引导生图色调。 */
    accent?: string;
    /** deck 语言（暂不改 query 语义，仅备用）。 */
    language?: string;
    /** 该族的 imageVibe 关键词（来自 STYLE_FAMILY_IMAGERY）。 */
    vibe?: string;
    /** deck 的实际主题（用户 brief 的 topic 或大纲标题）——生图内容锚定的核心。 */
    deckTopic?: string;
    /** 本页标题：把"这页在讲什么"直接告诉生图模型。 */
    slideTitle?: string;
    /** 本页内容摘要（要点/卡片/步骤压缩）：内容配图（hero/inline）按它具体作画。 */
    slideContent?: string;
}
/**
 * 按图的角色分化生图 prompt。共同原则：**内容主体优先** —— prompt 的第一句就是
 * "画什么"（deck 主题 / 本页内容），slide LLM 给的 query 降级为风格/取景修饰词；
 * 并显式禁止抽象虚幻画面（此前内容锚点放在句尾、query 当主体，生成结果普遍
 * 偏"梦幻抽象光影"，与内容无关）。
 *   - bg（全屏底图）：真实环境/场景承载主题氛围，主体偏移留负空间给文字。
 *   - hero/inline（内容配图）：单一清晰主体，具体描绘这一页实际在讲的东西。
 */
export declare function toAiPrompt(query: string, kind: EnrichmentImageKind, ctx?: ImagePromptContext): string;
/**
 * 为生成 pipeline / 占位补全拉图。`priority` 决定双源时的尝试顺序，单源时忽略。
 */
export declare function fetchEnrichmentImageDataUrl(query: string, config: AiConfig, opts?: {
    kind?: EnrichmentImageKind;
    priority?: ImageEnrichmentPriority;
    signal?: AbortSignal;
    stockTimeoutMs?: number;
    aiTimeoutMs?: number;
    /** 目标 slot 宽高比（w/h），用于 stock 选优时匹配比例。 */
    targetAspect?: number;
    /** deck 级去重集合，避免同一张照片在多页重复出现。 */
    usedUrls?: Set<string>;
    /** deck 级明暗基调；stock 选优时在比例相当的候选里偏向贴合基调的照片。 */
    tone?: "dark" | "light";
    /** 主题 / 风格上下文，用于 AI 生图 prompt 贴合主题（stock 路径暂不消费）。 */
    promptContext?: ImagePromptContext;
    /**
     * 共享熔断门闩：AI 一旦 429/额度耗尽，置 `aiPaused=true`，后续任务跳过 AI
     *（仍可走 stock）。由 enrichImagesInPresentation 传入同一对象。
     */
    aiGate?: {
        aiPaused: boolean;
        reason?: string;
    };
}): Promise<EnrichmentImageFetchResult | null>;
