import type { Presentation, Rect, Slide } from "@sliiu/present-core";
import type { AiConfig } from "../../config/types.js";
import type { SlideSpecZ } from "../schema.js";
import type { ImageEnrichmentPriority } from "./fetch-enrichment-image.js";
import { type ImagePromptContext } from "./fetch-enrichment-image.js";
import type { DocumentPort } from "../../kernel/port.js";
export declare const IMAGE_PLACEHOLDER_NAME = "Image placeholder";
export declare const IMAGE_HINT_NAME = "Image hint";
export interface InlinePlaceholderSlot {
    bbox: Rect;
    query: string;
    placeholderShapeId: string;
    hintShapeId?: string;
    /** 占位 rect 的动画单元标记，需要原样传给替换进来的真实图片。 */
    animUnit?: string;
}
/** 从 "Image hint" 文本 shape 解析英文关键词。 */
export declare function parseImageHintQuery(shape: Slide["layers"][0]["shapes"][number]): string | null;
/** 在已编译 slide 上定位 image-text 占位（无 spec 时靠 hint 文案）。 */
export declare function findInlineImagePlaceholder(slide: Slide): InlinePlaceholderSlot | null;
/** 是否已有真实配图（非占位）。 */
export declare function slideHasInlineImage(slide: Slide): boolean;
/**
 * 直接改 IR（generate 阶段 enrich 用，不走 CommandStack）。
 * 返回是否成功替换。
 */
export declare function replaceInlinePlaceholderOnSlide(slide: Slide, dataUrl: string, natural: {
    w: number;
    h: number;
}): boolean;
export interface FillPlaceholdersResult {
    filled: number;
    skipped: number;
    /** 无 stock key、无占位、拉取失败等 */
    details: Array<{
        slideIdx: number;
        query: string;
        ok: boolean;
        reason?: string;
    }>;
}
/**
 * 把一页 spec 的实际内容压缩成一句摘要（≤220 字符），喂给内容配图（hero/inline）
 * 的 AI 生图 prompt —— 让模型画"这一页讲的东西"，而不是从 3-7 词 query 里猜。
 */
export declare function slideContentDigest(s: SlideSpecZ | undefined, maxLen?: number): string | undefined;
export interface InlineImageTask {
    slideIdx: number;
    query: string;
    /** 本页标题 / 内容摘要：AI 生图内容锚定（stock 路径不消费）。 */
    slideTitle?: string;
    slideContent?: string;
}
/** 从 spec + pres 收集待补 inline 图任务（跳过已有 Image 的页）。 */
export declare function collectInlineImageTasks(pres: Presentation, specSlides: ReadonlyArray<SlideSpecZ>): InlineImageTask[];
/** 无 spec：扫描所有 slide 上的占位 hint。 */
export declare function collectInlinePlaceholderTasksFromPres(pres: Presentation): Array<{
    slideIdx: number;
    query: string;
}>;
export interface FillPlaceholdersOptions {
    config: AiConfig;
    imageEnrichmentPriority?: ImageEnrichmentPriority;
    signal?: AbortSignal;
    perImageTimeoutMs?: number;
    /** 限定某些 slide；缺省则处理全部任务。 */
    slideIndices?: ReadonlyArray<number>;
    /** deck 级去重集合（与 bg/hero 共享），避免同篇重复照片。 */
    usedUrls?: Set<string>;
    /** 主题 / 风格上下文，透传给 AI 生图 prompt。 */
    promptContext?: ImagePromptContext;
    /** 与 enrichImagesInPresentation 共享的 AI 熔断门闩。 */
    aiGate?: {
        aiPaused: boolean;
        reason?: string;
    };
}
/**
 * 对话 / 宿主：用 CommandStack 替换占位符（可 undo）。
 */
export declare function fillImagePlaceholdersViaCommands(port: DocumentPort, opts: FillPlaceholdersOptions): Promise<FillPlaceholdersResult>;
/**
 * generate enrich：批量拉 stock 图并写回 pres IR。
 */
export declare function fillInlinePlaceholdersInPresentation(pres: Presentation, tasks: ReadonlyArray<InlineImageTask>, opts: FillPlaceholdersOptions): Promise<{
    filled: number;
    skipped: number;
}>;
