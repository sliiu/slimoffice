import { z } from "zod";
import { BUILTIN_THEME_IDS, type BuiltinThemeId } from "@sliiu/present-themes";
/**
 * 内置主题 id（compile 可直接 `getTheme`）。必须与 `themes.ts` 的 `THEMES` keys 保持一致
 * —— 在 themes.ts 里有一个 `assertThemeIdsInSync` 编译期断言守护，新增/删主题时两边一起改。
 */
export { BUILTIN_THEME_IDS, type BuiltinThemeId };
/** 大纲 themeId：内置 + `ai`（视觉主题在生成幻灯片阶段单独设计，compile 用 themeOverride）。 */
export declare const OUTLINE_THEME_IDS: readonly ["business", "academic", "creative", "minimal", "dark", "tech", "nature", "warm", "editorial", "terminal", "pastel", "luxe", "ink", "ai"];
export type OutlineThemeId = (typeof OUTLINE_THEME_IDS)[number];
/** outline / SlideSpec 共用的 layout 词表（与 compile/layouts.ts LAYOUT_KINDS 保持一致）。 */
export declare const OUTLINE_LAYOUT_HINTS: readonly ["cover", "section", "bullets", "two-column", "quote", "image-text", "table", "closing", "content", "hero", "stat", "cards", "timeline", "comparison", "agenda", "metrics", "chart", "process", "banner"];
export type OutlineLayoutHint = (typeof OUTLINE_LAYOUT_HINTS)[number];
export declare const OutlineItemSchema: z.ZodObject<{
    title: z.ZodString;
    layoutHint: z.ZodOptional<z.ZodEnum<{
        agenda: "agenda";
        banner: "banner";
        bullets: "bullets";
        cards: "cards";
        chart: "chart";
        closing: "closing";
        comparison: "comparison";
        content: "content";
        cover: "cover";
        hero: "hero";
        "image-text": "image-text";
        metrics: "metrics";
        process: "process";
        quote: "quote";
        section: "section";
        stat: "stat";
        table: "table";
        timeline: "timeline";
        "two-column": "two-column";
    }>>;
    templateLayoutId: z.ZodOptional<z.ZodString>;
    bullets: z.ZodOptional<z.ZodArray<z.ZodString>>;
    imageIdea: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    pace: z.ZodPreprocess<z.ZodOptional<z.ZodArray<z.ZodEnum<{
        chain: "chain";
        click: "click";
    }>>>, unknown>;
    deckgenLayout: z.ZodOptional<z.ZodString>;
    deckgenVariant: z.ZodOptional<z.ZodString>;
    coreMessage: z.ZodOptional<z.ZodString>;
    audienceMove: z.ZodOptional<z.ZodString>;
    relationships: z.ZodOptional<z.ZodEnum<{
        contrast: "contrast";
        flow: "flow";
        link: "link";
        membership: "membership";
        none: "none";
        order: "order";
        overlap: "overlap";
        parent: "parent";
    }>>;
    rhythm: z.ZodOptional<z.ZodEnum<{
        anchor: "anchor";
        breathing: "breathing";
        dense: "dense";
    }>>;
    carrier: z.ZodOptional<z.ZodEnum<{
        chart: "chart";
        device: "device";
        diagram: "diagram";
        photo: "photo";
        table: "table";
        typeOnly: "typeOnly";
    }>>;
    composition: z.ZodOptional<z.ZodEnum<{
        band: "band";
        "full-bleed": "full-bleed";
        grid: "grid";
        "header-stack": "header-stack";
        sidebar: "sidebar";
        split: "split";
        statement: "statement";
    }>>;
}, z.core.$strip>;
export type OutlineItem = z.infer<typeof OutlineItemSchema>;
/** Deck-level Design Brief — mode, system preference, palette intent, motif. No hex except in paletteIntent prose. */
export declare const OutlineDesignBriefSchema: z.ZodObject<{
    mode: z.ZodOptional<z.ZodEnum<{
        briefing: "briefing";
        instructional: "instructional";
        narrative: "narrative";
        pyramid: "pyramid";
        showcase: "showcase";
    }>>;
    systemId: z.ZodOptional<z.ZodString>;
    paletteIntent: z.ZodOptional<z.ZodString>;
    motif: z.ZodOptional<z.ZodString>;
    folio: z.ZodOptional<z.ZodBoolean>;
    photoRhythm: z.ZodOptional<z.ZodEnum<{
        anchors: "anchors";
        bookends: "bookends";
        editorial: "editorial";
        none: "none";
    }>>;
}, z.core.$strip>;
export type OutlineDesignBrief = z.infer<typeof OutlineDesignBriefSchema>;
export declare const OutlineSchema: z.ZodObject<{
    title: z.ZodString;
    subtitle: z.ZodOptional<z.ZodString>;
    themeId: z.ZodEnum<{
        academic: "academic";
        ai: "ai";
        business: "business";
        creative: "creative";
        dark: "dark";
        editorial: "editorial";
        ink: "ink";
        luxe: "luxe";
        minimal: "minimal";
        nature: "nature";
        pastel: "pastel";
        tech: "tech";
        terminal: "terminal";
        warm: "warm";
    }>;
    slides: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        layoutHint: z.ZodOptional<z.ZodEnum<{
            agenda: "agenda";
            banner: "banner";
            bullets: "bullets";
            cards: "cards";
            chart: "chart";
            closing: "closing";
            comparison: "comparison";
            content: "content";
            cover: "cover";
            hero: "hero";
            "image-text": "image-text";
            metrics: "metrics";
            process: "process";
            quote: "quote";
            section: "section";
            stat: "stat";
            table: "table";
            timeline: "timeline";
            "two-column": "two-column";
        }>>;
        templateLayoutId: z.ZodOptional<z.ZodString>;
        bullets: z.ZodOptional<z.ZodArray<z.ZodString>>;
        imageIdea: z.ZodOptional<z.ZodString>;
        notes: z.ZodOptional<z.ZodString>;
        pace: z.ZodPreprocess<z.ZodOptional<z.ZodArray<z.ZodEnum<{
            chain: "chain";
            click: "click";
        }>>>, unknown>;
        deckgenLayout: z.ZodOptional<z.ZodString>;
        deckgenVariant: z.ZodOptional<z.ZodString>;
        coreMessage: z.ZodOptional<z.ZodString>;
        audienceMove: z.ZodOptional<z.ZodString>;
        relationships: z.ZodOptional<z.ZodEnum<{
            contrast: "contrast";
            flow: "flow";
            link: "link";
            membership: "membership";
            none: "none";
            order: "order";
            overlap: "overlap";
            parent: "parent";
        }>>;
        rhythm: z.ZodOptional<z.ZodEnum<{
            anchor: "anchor";
            breathing: "breathing";
            dense: "dense";
        }>>;
        carrier: z.ZodOptional<z.ZodEnum<{
            chart: "chart";
            device: "device";
            diagram: "diagram";
            photo: "photo";
            table: "table";
            typeOnly: "typeOnly";
        }>>;
        composition: z.ZodOptional<z.ZodEnum<{
            band: "band";
            "full-bleed": "full-bleed";
            grid: "grid";
            "header-stack": "header-stack";
            sidebar: "sidebar";
            split: "split";
            statement: "statement";
        }>>;
    }, z.core.$strip>>;
    designBrief: z.ZodOptional<z.ZodObject<{
        mode: z.ZodOptional<z.ZodEnum<{
            briefing: "briefing";
            instructional: "instructional";
            narrative: "narrative";
            pyramid: "pyramid";
            showcase: "showcase";
        }>>;
        systemId: z.ZodOptional<z.ZodString>;
        paletteIntent: z.ZodOptional<z.ZodString>;
        motif: z.ZodOptional<z.ZodString>;
        folio: z.ZodOptional<z.ZodBoolean>;
        photoRhythm: z.ZodOptional<z.ZodEnum<{
            anchors: "anchors";
            bookends: "bookends";
            editorial: "editorial";
            none: "none";
        }>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type Outline = z.infer<typeof OutlineSchema>;
export declare const CoverSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"cover">;
    title: z.ZodString;
    subtitle: z.ZodOptional<z.ZodString>;
    author: z.ZodOptional<z.ZodString>;
    date: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const SectionSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"section">;
    number: z.ZodOptional<z.ZodString>;
    title: z.ZodString;
    caption: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const BulletsSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"bullets">;
    title: z.ZodString;
    bullets: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export declare const TwoColumnSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"two-column">;
    title: z.ZodString;
    leftTitle: z.ZodOptional<z.ZodString>;
    leftBullets: z.ZodArray<z.ZodString>;
    rightTitle: z.ZodOptional<z.ZodString>;
    rightBullets: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export declare const QuoteSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"quote">;
    quote: z.ZodString;
    attribution: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const ImageTextSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"image-text">;
    title: z.ZodString;
    bullets: z.ZodArray<z.ZodString>;
    imageQuery: z.ZodOptional<z.ZodString>;
    imagePosition: z.ZodOptional<z.ZodEnum<{
        left: "left";
        right: "right";
    }>>;
}, z.core.$strip>;
export declare const TableSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"table">;
    title: z.ZodString;
    headers: z.ZodArray<z.ZodString>;
    rows: z.ZodArray<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const ClosingSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"closing">;
    title: z.ZodString;
    message: z.ZodOptional<z.ZodString>;
    contact: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const ContentSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"content">;
    title: z.ZodString;
    body: z.ZodString;
}, z.core.$strip>;
export declare const HeroSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"hero">;
    title: z.ZodString;
    subtitle: z.ZodOptional<z.ZodString>;
    eyebrow: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const StatSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"stat">;
    value: z.ZodString;
    label: z.ZodString;
    context: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/** 卡片栅格：2–4 张卡片，每张 title + body（功能点 / 支柱 / 卖点）。 */
export declare const CardsSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"cards">;
    title: z.ZodString;
    cards: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        body: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** 时间线：3–6 个有序节点（里程碑 / 路线图）。 */
export declare const TimelineSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"timeline">;
    title: z.ZodString;
    steps: z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        detail: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** 对比页：左 vs 右两栏（比 two-column 更强调对立）。 */
export declare const ComparisonSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"comparison">;
    title: z.ZodString;
    leftLabel: z.ZodString;
    leftBullets: z.ZodArray<z.ZodString>;
    rightLabel: z.ZodString;
    rightBullets: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
/** 议程 / 目录：编号条目列表。 */
export declare const AgendaSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"agenda">;
    title: z.ZodString;
    items: z.ZodArray<z.ZodObject<{
        number: z.ZodOptional<z.ZodString>;
        label: z.ZodString;
        caption: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** KPI 行：2–4 个并排小数字（不同于单焦点的 stat）。 */
export declare const MetricsSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"metrics">;
    title: z.ZodString;
    metrics: z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        label: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const ChartSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"chart">;
    title: z.ZodString;
    chartType: z.ZodOptional<z.ZodEnum<{
        area: "area";
        bar: "bar";
        column: "column";
        doughnut: "doughnut";
        line: "line";
        pie: "pie";
    }>>;
    categories: z.ZodArray<z.ZodString>;
    series: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        values: z.ZodArray<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** 流程步骤：水平编号步骤（How it works）。 */
export declare const ProcessSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"process">;
    title: z.ZodString;
    steps: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        detail: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** 色带分栏：左侧 accent 竖条区 + 右侧正文（杂志 / 瑞士网格感）。 */
export declare const BannerSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"banner">;
    title: z.ZodString;
    eyebrow: z.ZodOptional<z.ZodString>;
    bullets: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export declare const SlideSpecSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"cover">;
    title: z.ZodString;
    subtitle: z.ZodOptional<z.ZodString>;
    author: z.ZodOptional<z.ZodString>;
    date: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"section">;
    number: z.ZodOptional<z.ZodString>;
    title: z.ZodString;
    caption: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"bullets">;
    title: z.ZodString;
    bullets: z.ZodArray<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"two-column">;
    title: z.ZodString;
    leftTitle: z.ZodOptional<z.ZodString>;
    leftBullets: z.ZodArray<z.ZodString>;
    rightTitle: z.ZodOptional<z.ZodString>;
    rightBullets: z.ZodArray<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"quote">;
    quote: z.ZodString;
    attribution: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"image-text">;
    title: z.ZodString;
    bullets: z.ZodArray<z.ZodString>;
    imageQuery: z.ZodOptional<z.ZodString>;
    imagePosition: z.ZodOptional<z.ZodEnum<{
        left: "left";
        right: "right";
    }>>;
}, z.core.$strip>, z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"table">;
    title: z.ZodString;
    headers: z.ZodArray<z.ZodString>;
    rows: z.ZodArray<z.ZodArray<z.ZodString>>;
}, z.core.$strip>, z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"closing">;
    title: z.ZodString;
    message: z.ZodOptional<z.ZodString>;
    contact: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"content">;
    title: z.ZodString;
    body: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"hero">;
    title: z.ZodString;
    subtitle: z.ZodOptional<z.ZodString>;
    eyebrow: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"stat">;
    value: z.ZodString;
    label: z.ZodString;
    context: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"cards">;
    title: z.ZodString;
    cards: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        body: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"timeline">;
    title: z.ZodString;
    steps: z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        detail: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"comparison">;
    title: z.ZodString;
    leftLabel: z.ZodString;
    leftBullets: z.ZodArray<z.ZodString>;
    rightLabel: z.ZodString;
    rightBullets: z.ZodArray<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"agenda">;
    title: z.ZodString;
    items: z.ZodArray<z.ZodObject<{
        number: z.ZodOptional<z.ZodString>;
        label: z.ZodString;
        caption: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"metrics">;
    title: z.ZodString;
    metrics: z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        label: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"chart">;
    title: z.ZodString;
    chartType: z.ZodOptional<z.ZodEnum<{
        area: "area";
        bar: "bar";
        column: "column";
        doughnut: "doughnut";
        line: "line";
        pie: "pie";
    }>>;
    categories: z.ZodArray<z.ZodString>;
    series: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        values: z.ZodArray<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"process">;
    title: z.ZodString;
    steps: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        detail: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    bgImageQuery: z.ZodOptional<z.ZodString>;
    bgOverlay: z.ZodOptional<z.ZodNumber>;
    heroImageQuery: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"banner">;
    title: z.ZodString;
    eyebrow: z.ZodOptional<z.ZodString>;
    bullets: z.ZodArray<z.ZodString>;
}, z.core.$strip>], "kind">;
export type SlideSpecZ = z.infer<typeof SlideSpecSchema>;
export declare const PresentationSpecSchema: z.ZodObject<{
    themeId: z.ZodEnum<{
        academic: "academic";
        ai: "ai";
        business: "business";
        creative: "creative";
        dark: "dark";
        editorial: "editorial";
        ink: "ink";
        luxe: "luxe";
        minimal: "minimal";
        nature: "nature";
        pastel: "pastel";
        tech: "tech";
        terminal: "terminal";
        warm: "warm";
    }>;
    slides: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        notes: z.ZodOptional<z.ZodString>;
        bgImageQuery: z.ZodOptional<z.ZodString>;
        bgOverlay: z.ZodOptional<z.ZodNumber>;
        heroImageQuery: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"cover">;
        title: z.ZodString;
        subtitle: z.ZodOptional<z.ZodString>;
        author: z.ZodOptional<z.ZodString>;
        date: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        notes: z.ZodOptional<z.ZodString>;
        bgImageQuery: z.ZodOptional<z.ZodString>;
        bgOverlay: z.ZodOptional<z.ZodNumber>;
        heroImageQuery: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"section">;
        number: z.ZodOptional<z.ZodString>;
        title: z.ZodString;
        caption: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        notes: z.ZodOptional<z.ZodString>;
        bgImageQuery: z.ZodOptional<z.ZodString>;
        bgOverlay: z.ZodOptional<z.ZodNumber>;
        heroImageQuery: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"bullets">;
        title: z.ZodString;
        bullets: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        notes: z.ZodOptional<z.ZodString>;
        bgImageQuery: z.ZodOptional<z.ZodString>;
        bgOverlay: z.ZodOptional<z.ZodNumber>;
        heroImageQuery: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"two-column">;
        title: z.ZodString;
        leftTitle: z.ZodOptional<z.ZodString>;
        leftBullets: z.ZodArray<z.ZodString>;
        rightTitle: z.ZodOptional<z.ZodString>;
        rightBullets: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        notes: z.ZodOptional<z.ZodString>;
        bgImageQuery: z.ZodOptional<z.ZodString>;
        bgOverlay: z.ZodOptional<z.ZodNumber>;
        heroImageQuery: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"quote">;
        quote: z.ZodString;
        attribution: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        notes: z.ZodOptional<z.ZodString>;
        bgImageQuery: z.ZodOptional<z.ZodString>;
        bgOverlay: z.ZodOptional<z.ZodNumber>;
        heroImageQuery: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"image-text">;
        title: z.ZodString;
        bullets: z.ZodArray<z.ZodString>;
        imageQuery: z.ZodOptional<z.ZodString>;
        imagePosition: z.ZodOptional<z.ZodEnum<{
            left: "left";
            right: "right";
        }>>;
    }, z.core.$strip>, z.ZodObject<{
        notes: z.ZodOptional<z.ZodString>;
        bgImageQuery: z.ZodOptional<z.ZodString>;
        bgOverlay: z.ZodOptional<z.ZodNumber>;
        heroImageQuery: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"table">;
        title: z.ZodString;
        headers: z.ZodArray<z.ZodString>;
        rows: z.ZodArray<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>, z.ZodObject<{
        notes: z.ZodOptional<z.ZodString>;
        bgImageQuery: z.ZodOptional<z.ZodString>;
        bgOverlay: z.ZodOptional<z.ZodNumber>;
        heroImageQuery: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"closing">;
        title: z.ZodString;
        message: z.ZodOptional<z.ZodString>;
        contact: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        notes: z.ZodOptional<z.ZodString>;
        bgImageQuery: z.ZodOptional<z.ZodString>;
        bgOverlay: z.ZodOptional<z.ZodNumber>;
        heroImageQuery: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"content">;
        title: z.ZodString;
        body: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        notes: z.ZodOptional<z.ZodString>;
        bgImageQuery: z.ZodOptional<z.ZodString>;
        bgOverlay: z.ZodOptional<z.ZodNumber>;
        heroImageQuery: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"hero">;
        title: z.ZodString;
        subtitle: z.ZodOptional<z.ZodString>;
        eyebrow: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        notes: z.ZodOptional<z.ZodString>;
        bgImageQuery: z.ZodOptional<z.ZodString>;
        bgOverlay: z.ZodOptional<z.ZodNumber>;
        heroImageQuery: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"stat">;
        value: z.ZodString;
        label: z.ZodString;
        context: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        notes: z.ZodOptional<z.ZodString>;
        bgImageQuery: z.ZodOptional<z.ZodString>;
        bgOverlay: z.ZodOptional<z.ZodNumber>;
        heroImageQuery: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"cards">;
        title: z.ZodString;
        cards: z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            body: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        notes: z.ZodOptional<z.ZodString>;
        bgImageQuery: z.ZodOptional<z.ZodString>;
        bgOverlay: z.ZodOptional<z.ZodNumber>;
        heroImageQuery: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"timeline">;
        title: z.ZodString;
        steps: z.ZodArray<z.ZodObject<{
            label: z.ZodString;
            detail: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        notes: z.ZodOptional<z.ZodString>;
        bgImageQuery: z.ZodOptional<z.ZodString>;
        bgOverlay: z.ZodOptional<z.ZodNumber>;
        heroImageQuery: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"comparison">;
        title: z.ZodString;
        leftLabel: z.ZodString;
        leftBullets: z.ZodArray<z.ZodString>;
        rightLabel: z.ZodString;
        rightBullets: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        notes: z.ZodOptional<z.ZodString>;
        bgImageQuery: z.ZodOptional<z.ZodString>;
        bgOverlay: z.ZodOptional<z.ZodNumber>;
        heroImageQuery: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"agenda">;
        title: z.ZodString;
        items: z.ZodArray<z.ZodObject<{
            number: z.ZodOptional<z.ZodString>;
            label: z.ZodString;
            caption: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        notes: z.ZodOptional<z.ZodString>;
        bgImageQuery: z.ZodOptional<z.ZodString>;
        bgOverlay: z.ZodOptional<z.ZodNumber>;
        heroImageQuery: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"metrics">;
        title: z.ZodString;
        metrics: z.ZodArray<z.ZodObject<{
            value: z.ZodString;
            label: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        notes: z.ZodOptional<z.ZodString>;
        bgImageQuery: z.ZodOptional<z.ZodString>;
        bgOverlay: z.ZodOptional<z.ZodNumber>;
        heroImageQuery: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"chart">;
        title: z.ZodString;
        chartType: z.ZodOptional<z.ZodEnum<{
            area: "area";
            bar: "bar";
            column: "column";
            doughnut: "doughnut";
            line: "line";
            pie: "pie";
        }>>;
        categories: z.ZodArray<z.ZodString>;
        series: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            values: z.ZodArray<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        notes: z.ZodOptional<z.ZodString>;
        bgImageQuery: z.ZodOptional<z.ZodString>;
        bgOverlay: z.ZodOptional<z.ZodNumber>;
        heroImageQuery: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"process">;
        title: z.ZodString;
        steps: z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            detail: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        notes: z.ZodOptional<z.ZodString>;
        bgImageQuery: z.ZodOptional<z.ZodString>;
        bgOverlay: z.ZodOptional<z.ZodNumber>;
        heroImageQuery: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"banner">;
        title: z.ZodString;
        eyebrow: z.ZodOptional<z.ZodString>;
        bullets: z.ZodArray<z.ZodString>;
    }, z.core.$strip>], "kind">>;
}, z.core.$strip>;
export type PresentationSpec = z.infer<typeof PresentationSpecSchema>;
export declare const STYLE_FAMILY_IDS: readonly ["editorial", "swiss", "data-journalism", "dark-launch", "glass", "memphis", "risograph"];
export type StyleFamilyId = (typeof STYLE_FAMILY_IDS)[number];
/** English styleHint keywords for outline / theme / motion passes. */
export declare const STYLE_FAMILY_STYLE_HINTS: Record<StyleFamilyId, string>;
export interface StyleFamilyLayoutPolicy {
    /** 该 family 禁用的 layout → 替代 layout。 */
    remap: Partial<Record<OutlineLayoutHint, OutlineLayoutHint>>;
    /** 一句话解释禁用原因（喂给 prompt，让模型主动避开）。 */
    reason: string;
    /**
     * 该族偏好的内容页 layout 池（不含 cover/closing）。
     * diversifyOutlineLayouts 在打破连续同版式时从此池轮换取样。
     */
    preferred?: OutlineLayoutHint[];
}
export declare const STYLE_FAMILY_LAYOUT_POLICY: Partial<Record<StyleFamilyId, StyleFamilyLayoutPolicy>>;
/**
 * 确定性打破 outline 版式单调：连续相同内容 layout，或连续 ≥2 个纯文本页时，
 * 把当前页轮换到 family preferred 池（或全局多样性池）。不改 cover/closing/section/hero。
 */
export declare function diversifyOutlineLayouts(outline: Outline, family: string | "" | undefined): {
    outline: Outline;
    remapped: number;
};
/**
 * 从 guidance 文本推断 styleFamily。仅在 auto（styleFamily 为空）时由调用方使用；
 * 用户显式选族 / DesignSpec 已定族时不要调用（意图优先）。
 */
export declare function inferStyleFamilyFromGuidance(g: GuidanceInput): StyleFamilyId | undefined;
/** family 禁用清单（去重后的 kind 列表），供 prompt 展示。自定义族无硬策略 → 空数组。 */
export declare function bannedLayoutsForFamily(family: string | "" | undefined): OutlineLayoutHint[];
/**
 * 按 family 的锁定策略确定性 clamp 一份 outline 的 layoutHint（不改内容，只换版式）。
 * 返回新 outline（浅拷贝 slides）+ 被改的条数。family 无策略时原样返回。
 */
export declare function clampOutlineToStyleFamily(outline: Outline, family: string | "" | undefined): {
    outline: Outline;
    remapped: number;
};
export interface StyleFamilyImagery {
    /** 注入 AI 图像 prompt 的风格关键词（英文）。 */
    imageVibe: string;
    /** 是否允许全屏出血底图。false = 用 bounded hero，不铺全屏照片。 */
    fullBleedPhoto: boolean;
    /** 期望图片宽高比提示（可选）。 */
    preferredImageRatio?: string;
}
export declare const STYLE_FAMILY_IMAGERY: Record<StyleFamilyId, StyleFamilyImagery>;
/** 取某族图像气质；无 family / 未知时返回 null（调用方回退到通用 prompt / 允许全屏）。 */
export declare function imageryForFamily(family: string | "" | undefined): StyleFamilyImagery | null;
export interface GuidanceInput {
    topic: string;
    audience?: string;
    scenario?: string;
    goals?: string;
    language?: string;
    slideCount?: number;
    themeId?: string;
    /** Visual style family; empty = auto-infer. Builtin ids or custom ids from enabled user skills. */
    styleFamily?: string;
    /**
     * Design P1 visual system (wizard, default A) or deckgen L1 id.
     * A = dark-launch midnight/champagne/white titles; B = light-magazine paper/accent/dark type.
     * `editorial` / `swiss` pass through to the deckgen adapter.
     */
    visualSystem?: "A" | "B" | "editorial" | "swiss";
    extraNotes?: string;
    /**
     * 源文件抽出的文字，或「事实只在附件里」的说明。
     * 有源文件时，数字和论断只许来自这里和用户改过的大纲。
     */
    sourceMaterial?: string;
    /** 这次生成带了源文件。下游不得另编大纲里没有的数字。 */
    sourceBound?: boolean;
    /**
     * 页码：true 每个内容页带页码，false 全部不带；缺省时先看 extraNotes 是否提到页码，
     * 再由 organizer 的 Design Brief 决定，最后按 deck 模式 / 页数兜底（deckgen/brief.ts）。
     */
    pageNumbers?: boolean;
}
