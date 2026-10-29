import type { Presentation, Slide } from "@sliiu/present-core";
import type { Outline } from "../schema.js";
export type SlotRole = "title" | "body" | "eyebrow" | "caption" | "other";
/** PPTAgent 风格的功能页类型（用于大纲→参考页映射）。 */
export type SlideFunctionalType = "opening" | "toc" | "section" | "content" | "ending";
export interface ContentSlot {
    shapeId: string;
    role: SlotRole;
    /** 原文字（供 length / 语气参考）。 */
    sampleText: string;
    /** 建议最大字符数（≈ 原长 × lengthFactor）。 */
    maxChars: number;
    /** 原段落数（>1 时填槽应按行拆成多段）。 */
    paragraphCount: number;
    area: number;
    bbox: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
}
export interface InducedSlideSchema {
    slideId: string;
    slideIndex: number;
    functionalType: SlideFunctionalType;
    /** 页面一句话摘要（喂给映射 / prompt）。 */
    summary: string;
    slots: ContentSlot[];
}
export interface InducedSlideSlots {
    slideId: string;
    slideIndex: number;
    slots: ContentSlot[];
}
export interface SlotFill {
    role: SlotRole;
    texts: string[];
}
export interface ShapeSlotFill {
    shapeId: string;
    text: string;
}
export interface OutlineReferenceMapping {
    /** outline.slides[i] → referenceSchemas[refIndex]；-1 = 无匹配（走 compile 回退）。 */
    refIndices: number[];
}
/** 从单页诱导槽位（兼容旧 API）。 */
export declare function induceSlotsFromSlide(slide: Slide, slideIndex: number, size: {
    width: number;
    height: number;
}, lengthFactor?: number): InducedSlideSlots;
/** 单页完整 schema（功能类型 + 槽位）。 */
export declare function induceSlideSchema(slide: Slide, slideIndex: number, totalSlides: number, size: {
    width: number;
    height: number;
}, lengthFactor?: number): InducedSlideSchema;
/** 整篇诱导。 */
export declare function induceSlotsFromPresentation(pres: Presentation, lengthFactor?: number): InducedSlideSlots[];
export declare function induceReferenceSchemas(pres: Presentation, lengthFactor?: number): InducedSlideSchema[];
/**
 * 按 role 覆写槽位文字（旧 API）。每个 role 的 texts 按面积从大到小消费。
 */
export declare function fillSlotsOnSlide(slide: Slide, fills: SlotFill[]): number;
/** 按 shapeId 精确填槽（参考模板生成主路径）。 */
export declare function fillSlotsByShapeId(slide: Slide, fills: ShapeSlotFill[], slotMeta?: ContentSlot[]): number;
/**
 * 把大纲页映射到参考页：按功能类型优先，同类型轮询；无匹配返回 -1。
 */
export declare function mapOutlineToReference(outline: Outline, schemas: InducedSlideSchema[]): OutlineReferenceMapping;
/** 深拷贝参考页并刷新 id，避免与源 deck 冲突。 */
export declare function cloneReferenceSlide(slide: Slide, newIndex: number): Slide;
/**
 * 注意：clone 会改 shapeId，填槽必须在 clone **之前**对原 slide 填，或维护 id 映射。
 * 推荐：先 clone（保留原 id 映射表）——我们改为 clone 时记录 old→new id。
 */
export declare function cloneReferenceSlideWithIdMap(slide: Slide, newIndex: number): {
    slide: Slide;
    idMap: Map<string, string>;
};
/** 把 fills 的 shapeId 从参考页映射到 clone 页。 */
export declare function remapFills(fills: ShapeSlotFill[], idMap: Map<string, string>): ShapeSlotFill[];
export declare function remapSlots(slots: ContentSlot[], idMap: Map<string, string>): ContentSlot[];
/** 用填好的 slides 组装新 Presentation（继承参考尺寸 / 主题 / masters）。 */
export declare function assembleReferencePresentation(reference: Presentation, slides: Slide[]): Presentation;
/** 供 prompt 使用的紧凑槽位描述。 */
export declare function formatSlotsForPrompt(schema: InducedSlideSchema): string;
