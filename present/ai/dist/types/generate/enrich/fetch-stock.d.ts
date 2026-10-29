import type { AiConfig } from "../../config/types.js";
import { type StockImageHit } from "../../tools/helpers/images.js";
export interface StockImageFetchResult {
    dataUrl: string;
    w: number;
    h: number;
}
export interface StockImageFetchOptions {
    signal?: AbortSignal;
    /** 目标宽高比（w/h）。用于在候选里挑比例最接近的一张。缺省不按比例挑。 */
    targetAspect?: number;
    /** deck 级已用原图 url 集合；命中即避开，选定后写入。 */
    usedUrls?: Set<string>;
    /**
     * deck 级明暗基调。全出血照片压在 scrim 下时，一张亮粉色和一张深色走廊放在同一篇里
     * 会像两套 deck；有 tone 时在比例相当的候选里优先选平均色更接近该基调、饱和度更低的。
     */
    tone?: "dark" | "light";
}
/** 平均色 → 相对亮度 (0..1) 与 HSL 饱和度 (0..1)；解析失败返回 undefined。 */
export declare function hitToneOf(color: string | undefined): {
    l: number;
    s: number;
} | undefined;
/** 0 = 完美贴合基调；越大越偏离。无 tone 或无平均色 = 0（不影响排序）。 */
export declare function toneDistance(color: string | undefined, tone: "dark" | "light" | undefined): number;
/**
 * 在一批候选里挑最合适的一张：
 *   1. 先排除 usedUrls 里已出现过的（去重）；若全被用过则退回全量（宁可重复也别没图）。
 *   2. 有 targetAspect 时按 log 比例距离升序（对称，不偏向宽/窄）。
 *   3. 比例接近程度相当（差 < 0.05）时，用像素面积做次级排序，取更清晰的。
 */
export declare function pickBestHit(hits: readonly StockImageHit[], targetAspect: number | undefined, usedUrls: Set<string> | undefined, tone?: "dark" | "light"): StockImageHit | undefined;
/**
 * The alt text says the picture is mostly lettering — a shelf of book spines, a shop sign, a
 * screenshot, a poster. Stock search has no "no text in image" filter, so this is the proxy.
 */
export declare function hasLettering(alt: string | undefined): boolean;
/**
 * Turn an author's image idea into something a stock API can match. Models write prose
 * ("Split-screen conceptual photo: left side …, cool blue rim light, no text in image"); Unsplash /
 * Pexels rank on keywords, so the negations and framing words are dropped, the subject clauses are
 * kept, and the whole thing is capped at ten words. Short ideas pass through untouched.
 */
export declare function stockQueryFromIdea(idea: string): string;
/**
 * Queries to try in order: the compacted idea, then its first clause, then its first three words.
 * Stock search is AND-ish — "empty conference hall after a talk house lights up" returns nothing on
 * Unsplash while "empty conference hall" returns pages — so a miss backs off to the subject.
 */
export declare function stockQueryLadder(idea: string): string[];
export declare function fetchStockImageDataUrl(idea: string, config: AiConfig, opts?: StockImageFetchOptions): Promise<StockImageFetchResult | null>;
