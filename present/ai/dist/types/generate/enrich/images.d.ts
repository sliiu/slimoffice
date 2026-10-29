import type { Presentation } from "@sliiu/present-core";
import type { AiConfig } from "../../config/types.js";
import type { PresentationSpec } from "../schema.js";
import type { ImageEnrichmentPriority } from "./fetch-enrichment-image.js";
export interface EnrichImagesOptions {
    config: AiConfig;
    /** 双源均配置时的尝试顺序，默认 ai-first（见 DEFAULT_IMAGE_ENRICHMENT_PRIORITY）。 */
    imageEnrichmentPriority?: ImageEnrichmentPriority;
    signal?: AbortSignal;
    /** 并发度上限，默认 4。 */
    concurrency?: number;
    /** 单张 stock 图超时 ms，默认 8000。AI 生图回退单独用更长超时（见 fetch-enrichment-image）。 */
    perImageTimeoutMs?: number;
    /** 进度回调：done / total（含 bg 与 hero 的总和）；skippedAll = 未配置 key 整段跳过。 */
    onProgress?: (p: {
        done: number;
        total: number;
        skippedAll?: boolean;
    }) => void;
    /** 风格族 id（ppt_style_systems）。决定 imageVibe 与是否允许 fullBleed bg。 */
    styleFamily?: string;
    /** 主题明暗（由 palette.bg 亮度推导），影响生图底色倾向。 */
    themeMode?: "light" | "dark";
    /** 主题强调色 hex，引导生图色调。 */
    accent?: string;
    /** deck 语言（备用）。 */
    language?: string;
    /** deck 主题（用户 brief 的 topic）；缺省回退 spec.title。AI 生图内容锚定用。 */
    topic?: string;
    /**
     * designSpec.imagePlan.vibe —— design-spec pass 为这一篇冻结的图像气质。
     * 优先于按 styleFamily 查表得到的 imageVibe：族默认是"这类风格通常长什么样"，
     * 而 designSpec 是"这一篇决定长什么样"，后者更贴题也更能保证页间一致。
     */
    imageVibe?: string;
}
export interface EnrichImagesResult {
    /** 实际成功插入的图片数量。 */
    inserted: number;
    /** 因超时 / 拉取失败被跳过的数量（不算错误）。 */
    skipped: number;
    /** AI 生图因 429/额度熔断，本轮剩余 AI 调用已跳过。 */
    aiRateLimited?: boolean;
    /** 本轮实际使用的拉图并发度。 */
    concurrency?: number;
}
export declare function enrichImagesInPresentation(pres: Presentation, spec: PresentationSpec, opts: EnrichImagesOptions): Promise<EnrichImagesResult>;
