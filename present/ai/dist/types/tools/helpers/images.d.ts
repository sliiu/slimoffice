import { type ImageShape, type Presentation } from "@sliiu/present-core";
import { type ImageApiKind } from "../../config/presets.js";
import type { AiConfig, ImageProviderKind } from "../../config/types.js";
import type { ToolRuntime } from "../types.js";
export declare function defaultBboxFor(pres: Presentation, slideIdx: number, natural: {
    w: number;
    h: number;
}): {
    x: number;
    y: number;
    w: number;
    h: number;
};
export declare function makeImageShape(args: {
    id: string;
    name: string;
    bbox: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    src: string;
    natural?: {
        w: number;
        h: number;
    };
}): ImageShape;
export declare function genId(prefix: string): string;
export declare function toDataUrl(input: {
    kind: "b64";
    mime: string;
    data: string;
} | {
    kind: "url";
    url: string;
}): Promise<string>;
export declare function probeImageSize(dataUrl: string): Promise<{
    w: number;
    h: number;
}>;
/** 火山方舟 Ark / Seedream（endpoint 或 model 名命中即视为 seedream 族）。 */
export declare function isArkSeedreamImageProvider(endpoint: string, model: string): boolean;
/**
 * 按 provider + slot 类型解析 Images API `size` 候选列表（按优先级尝试，4xx 时回退下一项）。
 * 用户在设置里显式填写 image.size 时只返回该项（尊重配置）。
 */
export declare function resolveImageSizes(endpoint: string, model: string, configuredSize: string, kind?: "bg" | "hero" | "inline"): string[];
export interface GenerateAiImageArgs {
    endpoint: string;
    apiKey: string;
    model: string;
    prompt: string;
    provider?: ImageProviderKind;
    size?: "1024x1024" | "1792x1024" | "1024x1792" | "auto" | (string & {});
    background?: "transparent" | "opaque" | "auto";
    signal?: AbortSignal;
}
export type GeneratedAiImage = {
    dataUrl: string;
    size: {
        w: number;
        h: number;
    };
};
export declare function resolveImageApi(provider: ImageProviderKind | undefined, endpoint: string): ImageApiKind;
/** 从完整 AiConfig 解析出发请求所需的 endpoint / model / key（含 proxy）。 */
export declare function resolvedImageRequest(config: AiConfig): {
    provider: ImageProviderKind;
    endpoint: string;
    model: string;
    apiKey: string;
} | null;
export declare function generateAiImage(args: GenerateAiImageArgs): Promise<GeneratedAiImage>;
export declare function callOpenAIImages(args: GenerateAiImageArgs): Promise<GeneratedAiImage>;
export interface StockImageHit {
    /** 用于插图调用的 url（高分辨率原图或 regular）。 */
    url: string;
    /** 缩略图，便于宿主 UI 预览。 */
    thumb: string;
    /** 推荐宽高（用于初始 bbox aspect）。 */
    w: number;
    h: number;
    source: "unsplash" | "pexels";
    /** 给 AI / 用户阅读的 alt 描述（搜索引擎自带，多为英文）。 */
    alt?: string;
    /** 摄影师名字 + 主页（按版权协议建议在 slide 上标注）。 */
    authorName?: string;
    authorUrl?: string;
    /** 搜索引擎给出的平均色（#rrggbb），用于按 deck 明暗基调选图。 */
    color?: string;
}
export declare function searchUnsplash(query: string, key: string, signal?: AbortSignal): Promise<StockImageHit[]>;
export declare function searchPexels(query: string, key: string, signal?: AbortSignal): Promise<StockImageHit[]>;
/**
 * 把一张已经下载好的图片（dataUrl）插入到指定 slide。
 * 走 AddShapeCmd → port.execute，自然带 undo / redo。
 * 共享给 stock-images 工具组与 generateImage。
 */
export declare function insertImageToSlide(rt: ToolRuntime, slideIdx: number, dataUrl: string, natural: {
    w: number;
    h: number;
}, name: string, bbox?: {
    x: number;
    y: number;
    w: number;
    h: number;
}): {
    ok: true;
    shapeId: string;
} | {
    ok: false;
    error: string;
};
