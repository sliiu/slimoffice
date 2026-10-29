import type { Paint, Shape, SlideSize } from "@sliiu/present-core";
import type { ThemeDef } from "../../themes.js";
import type { LayoutStyleSpec } from "../layout-style.js";
export interface LayoutResult {
    background?: Paint;
    shapes: Shape[];
}
export interface ImageEnrichmentHints {
    bgImageQuery?: string;
    bgOverlay?: number;
    heroImageQuery?: string;
}
export interface CoverSpec extends ImageEnrichmentHints {
    kind: "cover";
    title: string;
    subtitle?: string;
    author?: string;
    date?: string;
}
export interface SectionSpec extends ImageEnrichmentHints {
    kind: "section";
    number?: string;
    title: string;
    caption?: string;
}
export interface BulletsSpec extends ImageEnrichmentHints {
    kind: "bullets";
    title: string;
    bullets: string[];
    notes?: string;
}
export interface TwoColumnSpec extends ImageEnrichmentHints {
    kind: "two-column";
    title: string;
    leftTitle?: string;
    leftBullets: string[];
    rightTitle?: string;
    rightBullets: string[];
}
export interface QuoteSpec extends ImageEnrichmentHints {
    kind: "quote";
    quote: string;
    attribution?: string;
}
export interface ImageTextSpec extends ImageEnrichmentHints {
    kind: "image-text";
    title: string;
    bullets: string[];
    imageSrc?: string;
    imageQuery?: string;
    imagePosition?: "left" | "right";
}
export interface TableSpec extends ImageEnrichmentHints {
    kind: "table";
    title: string;
    headers: string[];
    rows: string[][];
}
export interface ClosingSpec extends ImageEnrichmentHints {
    kind: "closing";
    title: string;
    message?: string;
    contact?: string;
}
export interface ContentSpec extends ImageEnrichmentHints {
    kind: "content";
    title: string;
    body: string;
}
export interface HeroSpec extends ImageEnrichmentHints {
    kind: "hero";
    title: string;
    subtitle?: string;
    eyebrow?: string;
}
export interface StatSpec extends ImageEnrichmentHints {
    kind: "stat";
    value: string;
    label: string;
    context?: string;
}
export interface CardsSpec extends ImageEnrichmentHints {
    kind: "cards";
    title: string;
    cards: Array<{
        title: string;
        body: string;
    }>;
    notes?: string;
}
export interface TimelineSpec extends ImageEnrichmentHints {
    kind: "timeline";
    title: string;
    steps: Array<{
        label: string;
        detail?: string;
    }>;
    notes?: string;
}
export interface ComparisonSpec extends ImageEnrichmentHints {
    kind: "comparison";
    title: string;
    leftLabel: string;
    leftBullets: string[];
    rightLabel: string;
    rightBullets: string[];
    notes?: string;
}
export interface AgendaSpec extends ImageEnrichmentHints {
    kind: "agenda";
    title: string;
    items: Array<{
        number?: string;
        label: string;
        caption?: string;
    }>;
    notes?: string;
}
export interface MetricsSpec extends ImageEnrichmentHints {
    kind: "metrics";
    title: string;
    metrics: Array<{
        value: string;
        label: string;
    }>;
    notes?: string;
}
export type ChartLayoutType = "column" | "bar" | "line" | "area" | "pie" | "doughnut";
export interface ChartSpec extends ImageEnrichmentHints {
    kind: "chart";
    title: string;
    chartType?: ChartLayoutType;
    categories: string[];
    series: Array<{
        name: string;
        values: number[];
    }>;
    notes?: string;
}
export interface ProcessSpec extends ImageEnrichmentHints {
    kind: "process";
    title: string;
    steps: Array<{
        title: string;
        detail?: string;
    }>;
    notes?: string;
}
export interface BannerSpec extends ImageEnrichmentHints {
    kind: "banner";
    title: string;
    eyebrow?: string;
    bullets: string[];
    notes?: string;
}
export type SlideSpec = CoverSpec | SectionSpec | BulletsSpec | TwoColumnSpec | QuoteSpec | ImageTextSpec | TableSpec | ClosingSpec | ContentSpec | HeroSpec | StatSpec | CardsSpec | TimelineSpec | ComparisonSpec | AgendaSpec | MetricsSpec | ChartSpec | ProcessSpec | BannerSpec;
export type LayoutKind = SlideSpec["kind"];
export declare const LAYOUT_KINDS: LayoutKind[];
export interface RenderLayoutOptions {
    /**
     * 构图变体种子。相同 seed → 相同构图（可复现）；缺省时随机（每次 compile
     * 产生可见的构图差异 —— "重新生成"的多样性来源之一）。
     * compile.ts 会给同一 deck 的所有 slide 派生自同一 deckSeed 的稳定 seed，
     * 保证整册风格一致（相同 layout 用相同变体）。
     */
    seed?: number;
    /**
     * AI 设计的布局风格（generateLayoutStyle 产出）。传入时构图决策
     * （锚点/版心/面板/母题…）按 spec 执行；缺省回退到种子变体。
     */
    style?: LayoutStyleSpec;
}
/**
 * 全 deck 复用的装饰母题（AI 布局风格的 motifs 段）：缘带 + 页码。
 * 由 compile.ts 对内容页调用（cover/section/hero/closing 有自己的整页构图，跳过），
 * 产出的 shape 放在装饰层之后、内容之前（z 低于内容）。
 */
export declare function buildMotifShapes(style: LayoutStyleSpec | undefined, size: SlideSize, theme: ThemeDef, pageIndex: number, kind: LayoutKind): Shape[];
/**
 * 单一分发入口：根据 spec.kind 选择 layout。
 *
 * 返回 LayoutResult ——
 *   - shapes：放进 slide.layers[0].shapes 的真实内容；
 *   - background（可选）：覆盖 slide.background，作为 slide 级底色。
 *     由调用方（compile.ts / CreateSlideFromSpecCmd）写回；enrichment pass
 *     后若拉到 bgImage 会被 ImagePaint 进一步覆盖。
 */
export declare function renderLayout(spec: SlideSpec, size: SlideSize, theme: ThemeDef, opts?: RenderLayoutOptions): LayoutResult;
