"use strict";
// AI 输出的结构化 Schema（zod）。
//
// 设计要点：
//   1. 分两层：OutlineSchema（粗粒度大纲，用户可审阅）+ SlideSpecSchema
//      （逐页详情，与 compile/layouts.ts 的 SlideSpec 等价但走 zod 校验）。
//   2. 字段名与 layouts.ts 完全对齐，避免任何映射层 —— AI 直接吐出能 compile 的数据。
//   3. 每个 union 分支显式带 kind discriminator，让 LLM 输出更稳定（Function
//      Calling JSON Schema 对 discriminated union 支持很好）。
//   4. 描述（.describe(...)）会被注入到给 LLM 的 schema 中，作为"内联提示词"。
Object.defineProperty(exports, "__esModule", { value: true });
exports.STYLE_FAMILY_IMAGERY = exports.STYLE_FAMILY_LAYOUT_POLICY = exports.STYLE_FAMILY_STYLE_HINTS = exports.STYLE_FAMILY_IDS = exports.PresentationSpecSchema = exports.SlideSpecSchema = exports.BannerSchema = exports.ProcessSchema = exports.ChartSchema = exports.MetricsSchema = exports.AgendaSchema = exports.ComparisonSchema = exports.TimelineSchema = exports.CardsSchema = exports.StatSchema = exports.HeroSchema = exports.ContentSchema = exports.ClosingSchema = exports.TableSchema = exports.ImageTextSchema = exports.QuoteSchema = exports.TwoColumnSchema = exports.BulletsSchema = exports.SectionSchema = exports.CoverSchema = exports.OutlineSchema = exports.OutlineDesignBriefSchema = exports.OutlineItemSchema = exports.OUTLINE_LAYOUT_HINTS = exports.OUTLINE_THEME_IDS = exports.BUILTIN_THEME_IDS = void 0;
exports.diversifyOutlineLayouts = diversifyOutlineLayouts;
exports.inferStyleFamilyFromGuidance = inferStyleFamilyFromGuidance;
exports.bannedLayoutsForFamily = bannedLayoutsForFamily;
exports.clampOutlineToStyleFamily = clampOutlineToStyleFamily;
exports.imageryForFamily = imageryForFamily;
const zod_1 = require("zod");
const themes_1 = require("@sliiu/present-themes");
Object.defineProperty(exports, "BUILTIN_THEME_IDS", { enumerable: true, get: function () { return themes_1.BUILTIN_THEME_IDS; } });
/** 大纲 themeId：内置 + `ai`（视觉主题在生成幻灯片阶段单独设计，compile 用 themeOverride）。 */
exports.OUTLINE_THEME_IDS = [...themes_1.BUILTIN_THEME_IDS, "ai"];
const OutlineThemeIdSchema = zod_1.z.enum(exports.OUTLINE_THEME_IDS);
// ---- Outline ----
/** outline / SlideSpec 共用的 layout 词表（与 compile/layouts.ts LAYOUT_KINDS 保持一致）。 */
exports.OUTLINE_LAYOUT_HINTS = [
    "cover",
    "section",
    "bullets",
    "two-column",
    "quote",
    "image-text",
    "table",
    "closing",
    "content",
    "hero",
    "stat",
    // 版式扩容（打破「满屏 bullets」）：卡片栅格 / 时间线 / 对比 / 议程 / KPI 行 / 流程 / 色带分栏
    "cards",
    "timeline",
    "comparison",
    "agenda",
    "metrics",
    "chart",
    "process",
    "banner",
];
exports.OutlineItemSchema = zod_1.z.object({
    title: zod_1.z.string().describe("This slide's short title (≤ 24 chars)"),
    // 推荐 layout —— compile 阶段会再做一次校验，未识别时回退到 bullets。
    layoutHint: zod_1.z
        .enum(exports.OUTLINE_LAYOUT_HINTS)
        .optional()
        .describe("Recommended layout kind. Defaults to bullets when omitted."),
    templateLayoutId: zod_1.z
        .string()
        .optional()
        .describe("When a layout template is attached, the id of one of its layouts. Omit otherwise."),
    bullets: zod_1.z
        .array(zod_1.z.string())
        .max(8)
        .optional()
        .describe("Content payload for the chosen layoutHint (≤ 8). table: first item headers `A | B`, rest rows; chart: first item type `column|line|bar|pie`, next `Q1 | Q2 | Q3`, later `Name | 12 | 18 | 22`; metrics: `72%|NPS`; cards: `Title: body`; comparison: first `Left || Right`; otherwise short fact bullets."),
    // 配图方向：大纲阶段就把"这页配什么图"定下来（用户可在大纲编辑器里改），
    // slides 阶段据此产出 bgImageQuery/heroImageQuery，而不是临场即兴。
    imageIdea: zod_1.z
        .string()
        .optional()
        .describe("One-line imagery direction for this slide (ENGLISH, concrete: subject + setting + lighting, e.g. 'data center corridor, blue LED rows, night'). Required for cover/hero/section/stat/closing; recommended elsewhere. The slide pass turns this into actual image queries."),
    notes: zod_1.z.string().optional().describe("Speaker notes for this slide (≤ 240 chars)."),
    pace: zod_1.z
        .preprocess((value) => {
        if (!Array.isArray(value))
            return undefined;
        const flags = value
            .map((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""))
            .filter((v) => v === "click" || v === "chain");
        return flags.length > 0 ? flags.slice(0, 8) : undefined;
    }, zod_1.z.array(zod_1.z.enum(["click", "chain"])).max(8).optional())
        .describe("One flag per spoken point, in bullet order. click = wait for a click. chain = follow the previous point automatically. The title is always the first click and is not listed. Omit a flag or the whole array to mean click. Comparison skips the `Left || Right` line. Table skips the header line. Chart is exactly one flag. Stat has no points, so omit pace."),
    /** Deckgen L2 lock (wizard pill). Do not invent — whitelist only. */
    deckgenLayout: zod_1.z.string().optional(),
    /** Deckgen L3 lock (wizard pill). Must pair with deckgenLayout. */
    deckgenVariant: zod_1.z.string().optional(),
    // ---- Design Brief (filled by organize; the canvas author binds to these) ----
    /** One-sentence assertion this page must land. */
    coreMessage: zod_1.z.string().optional(),
    /** "reader goes from A to B". */
    audienceMove: zod_1.z.string().optional(),
    /** How the points relate; the author must carry it in geometry. */
    relationships: zod_1.z.enum(["none", "order", "link", "parent", "membership", "contrast", "overlap", "flow"]).optional(),
    rhythm: zod_1.z.enum(["anchor", "dense", "breathing"]).optional(),
    /** Primary carrier; drives image acquisition. */
    carrier: zod_1.z.enum(["photo", "chart", "table", "diagram", "device", "typeOnly"]).optional(),
    /** Page composition; consecutive pages never share one (see deckgen/brief.ts). */
    composition: zod_1.z.enum(["header-stack", "split", "statement", "full-bleed", "grid", "band", "sidebar"]).optional(),
});
/** Deck-level Design Brief — mode, system preference, palette intent, motif. No hex except in paletteIntent prose. */
exports.OutlineDesignBriefSchema = zod_1.z.object({
    mode: zod_1.z.enum(["pyramid", "narrative", "instructional", "showcase", "briefing"]).optional(),
    systemId: zod_1.z.string().optional(),
    paletteIntent: zod_1.z.string().optional(),
    motif: zod_1.z.string().optional(),
    /** Page numerals on content pages (see deckgen/brief.ts `folio`). */
    folio: zod_1.z.boolean().optional(),
    /** Where photographs go, once per deck (see deckgen/brief.ts `photoRhythm`). */
    photoRhythm: zod_1.z.enum(["anchors", "bookends", "editorial", "none"]).optional(),
});
exports.OutlineSchema = zod_1.z.object({
    title: zod_1.z.string().describe("Presentation title shown on cover."),
    subtitle: zod_1.z.string().optional(),
    themeId: OutlineThemeIdSchema.describe(`Theme id: one of ${themes_1.BUILTIN_THEME_IDS.join(" | ")}, or "ai" when visuals will be AI-designed (not a built-in preset).`),
    slides: zod_1.z.array(exports.OutlineItemSchema).min(1).max(40).describe("Slide outline."),
    designBrief: exports.OutlineDesignBriefSchema.optional(),
});
// ---- Slide specs（与 layouts.ts SlideSpec 同构）----
//
// 每个分支独立 schema 命名，方便 LLM 选择；最后 union 起来。
//
// **图像增强字段**（所有 layout 共用）：
//   - bgImageQuery：建议作为整页背景的图片关键词（cover / section / hero / stat / closing 强烈推荐）。
//     enrichment pass 会通过 stock-images MCP 拉真图并贴成全屏背景，文字自动反白 + 暗化叠层。
//   - bgOverlay：覆盖在背景图上的暗化 / 亮化叠层强度（0..1），默认 0.45（暗），让文字始终可读。
//   - heroImageQuery：在内容内部（bullets / two-column / image-text）插入一张大图。
//     与 bg 不同，不全屏，作为视觉锚点。
//
// 这些字段都是 *hint* —— 当用户未启用 MCP / 未提供 Unsplash/Pexels key 时，
// enrichment pass 直接跳过；slide 仍按原有 layout 渲染，不会因为缺图而失败。
// 演讲备注（所有 layout 共用，ppt-deck-workflow Step 6：每页都应有 notes）。
// compile 会写到 slide.notes，导出 pptx 时生成 notesSlide 部件。
const speakerNotesField = {
    notes: zod_1.z
        .string()
        .optional()
        .describe("Speaker notes for this slide (60-240 chars, same language as the deck): what to SAY — key message, a number worth calling out, transition to next slide. Every slide should have notes."),
};
const imageEnrichmentFields = {
    bgImageQuery: zod_1.z
        .string()
        .optional()
        .describe("English keywords for a FULL-SLIDE background photo (recommended for cover / section / hero / stat / closing). Used by image enrichment pass to fetch a real photo via stock-image MCP. Leave empty for pure-content layouts."),
    bgOverlay: zod_1.z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Background overlay strength (0..1, default 0.45). Higher = darker scrim for text readability on photos."),
    heroImageQuery: zod_1.z
        .string()
        .optional()
        .describe("English keywords for an inline 'hero' photo to render alongside content (typically right half for bullets / above title for stat). Different from bg: occupies part of the slide, not full bleed."),
};
exports.CoverSchema = zod_1.z.object({
    kind: zod_1.z.literal("cover"),
    title: zod_1.z.string(),
    subtitle: zod_1.z.string().optional(),
    author: zod_1.z.string().optional(),
    date: zod_1.z.string().optional(),
    ...imageEnrichmentFields,
    ...speakerNotesField,
});
exports.SectionSchema = zod_1.z.object({
    kind: zod_1.z.literal("section"),
    number: zod_1.z.string().optional().describe('Section number text such as "01" or "Part 1".'),
    title: zod_1.z.string(),
    caption: zod_1.z.string().optional(),
    ...imageEnrichmentFields,
    ...speakerNotesField,
});
exports.BulletsSchema = zod_1.z.object({
    kind: zod_1.z.literal("bullets"),
    title: zod_1.z.string(),
    bullets: zod_1.z.array(zod_1.z.string()).min(1).max(8),
    ...imageEnrichmentFields,
    ...speakerNotesField,
});
exports.TwoColumnSchema = zod_1.z.object({
    kind: zod_1.z.literal("two-column"),
    title: zod_1.z.string(),
    leftTitle: zod_1.z.string().optional(),
    leftBullets: zod_1.z.array(zod_1.z.string()).min(1).max(6),
    rightTitle: zod_1.z.string().optional(),
    rightBullets: zod_1.z.array(zod_1.z.string()).min(1).max(6),
    ...imageEnrichmentFields,
    ...speakerNotesField,
});
exports.QuoteSchema = zod_1.z.object({
    kind: zod_1.z.literal("quote"),
    quote: zod_1.z.string(),
    attribution: zod_1.z.string().optional(),
    ...imageEnrichmentFields,
    ...speakerNotesField,
});
exports.ImageTextSchema = zod_1.z.object({
    kind: zod_1.z.literal("image-text"),
    title: zod_1.z.string(),
    bullets: zod_1.z.array(zod_1.z.string()).min(1).max(6),
    imageQuery: zod_1.z
        .string()
        .optional()
        .describe("Short English keywords for the inline photo on image-text slides. Enrichment pass fetches from Unsplash/Pexels and replaces the compile placeholder."),
    imagePosition: zod_1.z.enum(["left", "right"]).optional(),
    ...imageEnrichmentFields,
    ...speakerNotesField,
});
exports.TableSchema = zod_1.z.object({
    kind: zod_1.z.literal("table"),
    title: zod_1.z.string(),
    headers: zod_1.z.array(zod_1.z.string()).min(2).max(6),
    rows: zod_1.z.array(zod_1.z.array(zod_1.z.string())).min(1).max(10),
    ...imageEnrichmentFields,
    ...speakerNotesField,
});
exports.ClosingSchema = zod_1.z.object({
    kind: zod_1.z.literal("closing"),
    title: zod_1.z.string(),
    message: zod_1.z.string().optional(),
    contact: zod_1.z.string().optional(),
    ...imageEnrichmentFields,
    ...speakerNotesField,
});
exports.ContentSchema = zod_1.z.object({
    kind: zod_1.z.literal("content"),
    title: zod_1.z.string(),
    body: zod_1.z.string(),
    ...imageEnrichmentFields,
    ...speakerNotesField,
});
// 新增 layout: hero —— 全屏大图 + 居中标题/副标题（产品发布 / 主题预告，最具冲击力）。
exports.HeroSchema = zod_1.z.object({
    kind: zod_1.z.literal("hero"),
    title: zod_1.z.string(),
    subtitle: zod_1.z.string().optional(),
    eyebrow: zod_1.z.string().optional().describe("Small uppercase label above the title (e.g. 'NEW', '2026 Q3', 'KEYNOTE')."),
    ...imageEnrichmentFields,
    ...speakerNotesField,
});
// 新增 layout: stat —— 一个超大数字 + 简短说明（数据高亮，演讲必备）。
exports.StatSchema = zod_1.z.object({
    kind: zod_1.z.literal("stat"),
    value: zod_1.z.string().describe("Big featured number/string (e.g. '+87%', '2.1B', '15 min')."),
    label: zod_1.z.string().describe("Short caption explaining the value (≤ 40 chars)."),
    context: zod_1.z.string().optional().describe("Optional one-line context / source (≤ 60 chars)."),
    ...imageEnrichmentFields,
    ...speakerNotesField,
});
/** 卡片栅格：2–4 张卡片，每张 title + body（功能点 / 支柱 / 卖点）。 */
exports.CardsSchema = zod_1.z.object({
    kind: zod_1.z.literal("cards"),
    title: zod_1.z.string(),
    cards: zod_1.z
        .array(zod_1.z.object({
        title: zod_1.z.string().describe("Card heading ≤ 24 chars"),
        body: zod_1.z.string().describe("Card body ≤ 80 chars"),
    }))
        .min(2)
        .max(4),
    ...imageEnrichmentFields,
    ...speakerNotesField,
});
/** 时间线：3–6 个有序节点（里程碑 / 路线图）。 */
exports.TimelineSchema = zod_1.z.object({
    kind: zod_1.z.literal("timeline"),
    title: zod_1.z.string(),
    steps: zod_1.z
        .array(zod_1.z.object({
        label: zod_1.z.string().describe("Short node label (date / phase) ≤ 20 chars"),
        detail: zod_1.z.string().optional().describe("One-line detail ≤ 60 chars"),
    }))
        .min(3)
        .max(6),
    ...imageEnrichmentFields,
    ...speakerNotesField,
});
/** 对比页：左 vs 右两栏（比 two-column 更强调对立）。 */
exports.ComparisonSchema = zod_1.z.object({
    kind: zod_1.z.literal("comparison"),
    title: zod_1.z.string(),
    leftLabel: zod_1.z.string().describe("Left column heading (e.g. Before / Us)"),
    leftBullets: zod_1.z.array(zod_1.z.string()).min(1).max(5),
    rightLabel: zod_1.z.string().describe("Right column heading (e.g. After / Them)"),
    rightBullets: zod_1.z.array(zod_1.z.string()).min(1).max(5),
    ...imageEnrichmentFields,
    ...speakerNotesField,
});
/** 议程 / 目录：编号条目列表。 */
exports.AgendaSchema = zod_1.z.object({
    kind: zod_1.z.literal("agenda"),
    title: zod_1.z.string(),
    items: zod_1.z
        .array(zod_1.z.object({
        number: zod_1.z.string().optional().describe('Display number e.g. "01"'),
        label: zod_1.z.string(),
        caption: zod_1.z.string().optional(),
    }))
        .min(3)
        .max(8),
    ...imageEnrichmentFields,
    ...speakerNotesField,
});
/** KPI 行：2–4 个并排小数字（不同于单焦点的 stat）。 */
exports.MetricsSchema = zod_1.z.object({
    kind: zod_1.z.literal("metrics"),
    title: zod_1.z.string(),
    metrics: zod_1.z
        .array(zod_1.z.object({
        value: zod_1.z.string().describe("Short KPI e.g. '92%'"),
        label: zod_1.z.string().describe("Caption ≤ 28 chars"),
    }))
        .min(2)
        .max(4),
    ...imageEnrichmentFields,
    ...speakerNotesField,
});
exports.ChartSchema = zod_1.z.object({
    kind: zod_1.z.literal("chart"),
    title: zod_1.z.string(),
    chartType: zod_1.z.enum(["column", "bar", "line", "area", "pie", "doughnut"]).optional(),
    categories: zod_1.z.array(zod_1.z.string()).min(2).max(12),
    series: zod_1.z
        .array(zod_1.z.object({
        name: zod_1.z.string(),
        values: zod_1.z.array(zod_1.z.number()),
    }))
        .min(1)
        .max(6),
    ...imageEnrichmentFields,
    ...speakerNotesField,
});
/** 流程步骤：水平编号步骤（How it works）。 */
exports.ProcessSchema = zod_1.z.object({
    kind: zod_1.z.literal("process"),
    title: zod_1.z.string(),
    steps: zod_1.z
        .array(zod_1.z.object({
        title: zod_1.z.string().describe("Step title ≤ 24 chars"),
        detail: zod_1.z.string().optional().describe("Step detail ≤ 60 chars"),
    }))
        .min(3)
        .max(5),
    ...imageEnrichmentFields,
    ...speakerNotesField,
});
/** 色带分栏：左侧 accent 竖条区 + 右侧正文（杂志 / 瑞士网格感）。 */
exports.BannerSchema = zod_1.z.object({
    kind: zod_1.z.literal("banner"),
    title: zod_1.z.string(),
    eyebrow: zod_1.z.string().optional().describe("Small label in the accent band"),
    bullets: zod_1.z.array(zod_1.z.string()).min(1).max(6),
    ...imageEnrichmentFields,
    ...speakerNotesField,
});
exports.SlideSpecSchema = zod_1.z.discriminatedUnion("kind", [
    exports.CoverSchema,
    exports.SectionSchema,
    exports.BulletsSchema,
    exports.TwoColumnSchema,
    exports.QuoteSchema,
    exports.ImageTextSchema,
    exports.TableSchema,
    exports.ClosingSchema,
    exports.ContentSchema,
    exports.HeroSchema,
    exports.StatSchema,
    exports.CardsSchema,
    exports.TimelineSchema,
    exports.ComparisonSchema,
    exports.AgendaSchema,
    exports.MetricsSchema,
    exports.ChartSchema,
    exports.ProcessSchema,
    exports.BannerSchema,
]);
// 整篇生成（一次性产出全部 slide spec，可选路径；默认走 outline → 逐页生成）。
exports.PresentationSpecSchema = zod_1.z.object({
    themeId: OutlineThemeIdSchema.describe("Theme id from outline (may be ai)."),
    slides: zod_1.z.array(exports.SlideSpecSchema).min(1).max(40),
});
// ---- 视觉风格族（UI → generate，映射 ppt_style_systems）----
exports.STYLE_FAMILY_IDS = [
    "editorial",
    "swiss",
    "data-journalism",
    "dark-launch",
    "glass",
    "memphis",
    "risograph",
];
/** English styleHint keywords for outline / theme / motion passes. */
exports.STYLE_FAMILY_STYLE_HINTS = {
    editorial: "editorial magazine warm serif title sans body cinematic photos",
    swiss: "Swiss international grid sharp sans one anchor color hairline grid",
    "data-journalism": "dark data dashboard chart-forward cyan or amber accent",
    "dark-launch": "dark launch keynote cinematic gradient display sans neon rim",
    glass: "glassmorphism saas translucent layers soft gradient depth",
    memphis: "memphis pop bold primaries geometric playful energy",
    risograph: "risograph duotone zine hand-made texture",
};
exports.STYLE_FAMILY_LAYOUT_POLICY = {
    swiss: {
        remap: {
            "image-text": "banner",
            quote: "content",
            hero: "section",
            cards: "metrics",
            timeline: "process",
        },
        preferred: ["section", "banner", "two-column", "metrics", "chart", "table", "stat", "agenda", "process", "bullets", "content"],
        reason: "Swiss international style is grid + hairline typography with NO large photos or emotional pull-quotes — prefer banner / two-column / metrics / table / process / agenda.",
    },
    "data-journalism": {
        remap: {
            "image-text": "metrics",
            quote: "stat",
            hero: "section",
            cards: "metrics",
            banner: "two-column",
        },
        preferred: ["section", "stat", "metrics", "chart", "table", "two-column", "comparison", "process", "agenda", "content"],
        reason: "Data-journalism is chart / number-forward — avoid decorative photo layouts; prefer chart / stat / metrics / table / comparison / process.",
    },
    risograph: {
        remap: { table: "cards", metrics: "cards" },
        preferred: ["hero", "image-text", "cards", "banner", "quote", "section", "closing", "agenda"],
        reason: "Risograph zine style favors bold blocks & duotone imagery over dense data tables.",
    },
    editorial: {
        remap: {},
        preferred: ["hero", "image-text", "quote", "banner", "cards", "section", "timeline", "closing", "content"],
        reason: "Editorial magazine favors photo-led pages, pull-quotes, and banner splits — avoid long bullet runs.",
    },
    "dark-launch": {
        remap: {},
        preferred: ["hero", "stat", "metrics", "chart", "cards", "process", "comparison", "section", "closing", "image-text"],
        reason: "Dark launch decks need cinematic openers and sparse KPI/process beats — not walls of bullets.",
    },
    glass: {
        remap: {},
        preferred: ["cover", "cards", "process", "metrics", "chart", "image-text", "two-column", "section", "closing"],
        reason: "Glass SaaS decks read best as product cards + process + metrics with soft surfaces.",
    },
    memphis: {
        remap: { table: "cards", content: "cards" },
        preferred: ["cards", "comparison", "process", "agenda", "section", "quote", "closing"],
        reason: "Memphis pop favors bold cards and geometric process — skip dense tables.",
    },
};
/** 无显式 preferred 时的全局「打破单调」轮换池（内容页）。 */
const DEFAULT_DIVERSITY_POOL = [
    "cards",
    "image-text",
    "two-column",
    "banner",
    "stat",
    "metrics",
    "chart",
    "timeline",
    "process",
    "comparison",
    "quote",
    "agenda",
    "content",
    "bullets",
];
/**
 * 确定性打破 outline 版式单调：连续相同内容 layout，或连续 ≥2 个纯文本页时，
 * 把当前页轮换到 family preferred 池（或全局多样性池）。不改 cover/closing/section/hero。
 */
function diversifyOutlineLayouts(outline, family) {
    const policy = family && family in exports.STYLE_FAMILY_LAYOUT_POLICY
        ? exports.STYLE_FAMILY_LAYOUT_POLICY[family]
        : undefined;
    const banned = new Set(policy ? Object.keys(policy.remap) : []);
    const pool = (policy?.preferred?.length ? policy.preferred : DEFAULT_DIVERSITY_POOL).filter((k) => k !== "cover" && k !== "closing" && !banned.has(k));
    if (pool.length === 0)
        return { outline, remapped: 0 };
    const structural = new Set(["cover", "closing", "section", "hero"]);
    const textHeavy = new Set(["bullets", "content"]);
    let remapped = 0;
    let poolIdx = 0;
    const slides = outline.slides.map((s, i) => {
        const hint = s.layoutHint ?? "bullets";
        if (structural.has(hint) || i === 0)
            return s;
        const prev = outline.slides[i - 1]?.layoutHint ?? "bullets";
        const sameAsPrev = hint === prev && !structural.has(prev);
        const textPair = textHeavy.has(hint) && textHeavy.has(prev);
        if (!sameAsPrev && !textPair)
            return s;
        let next;
        for (let t = 0; t < pool.length; t++) {
            const cand = pool[(poolIdx + t) % pool.length];
            if (cand !== hint && cand !== prev) {
                next = cand;
                poolIdx = (poolIdx + t + 1) % pool.length;
                break;
            }
        }
        if (!next || next === hint)
            return s;
        remapped += 1;
        return { ...s, layoutHint: next };
    });
    return { outline: remapped > 0 ? { ...outline, slides } : outline, remapped };
}
// ---- auto 模式的风格族确定性推断（P2：skill 小节路由策略）----
//
// styleFamily 为空（auto）时，skill 小节路由拿不到信号，ppt_style_systems 的
// A–G 全部 family 小节会一起注入 → 稀释注意力。enableDesignSpec 打开时由 LLM
// 定族，但它默认关闭；这里提供零成本的关键词兜底：按 Style picker 表的 user cue
// 扫 guidance 文本，命中即定族（驱动小节路由 / 版式锁定 / rubric）。
// 匹配保守：只认强指向性 token；无命中返回 undefined（保持 auto 全注入的旧行为）。
const STYLE_FAMILY_CUES = [
    { family: "swiss", zh: ["瑞士"], en: ["swiss", "helvetica", "vignelli"] },
    { family: "data-journalism", zh: ["数据新闻", "数据大屏", "仪表盘"], en: ["dashboard", "bloomberg", "data journalism"] },
    { family: "glass", zh: ["玻璃拟态", "毛玻璃"], en: ["glassmorphism", "glassmorphic", "frosted glass"] },
    { family: "memphis", zh: ["孟菲斯"], en: ["memphis"] },
    { family: "risograph", zh: ["独立杂志", "双色印刷"], en: ["risograph", "riso", "duotone", "zine"] },
    { family: "editorial", zh: ["杂志风", "电子杂志", "人文叙事"], en: ["editorial", "monocle", "magazine style"] },
    { family: "dark-launch", zh: ["发布会", "暗色高级", "电影感"], en: ["keynote", "launch deck", "product launch", "cinematic dark"] },
];
/**
 * 从 guidance 文本推断 styleFamily。仅在 auto（styleFamily 为空）时由调用方使用；
 * 用户显式选族 / DesignSpec 已定族时不要调用（意图优先）。
 */
function inferStyleFamilyFromGuidance(g) {
    const hay = [g.topic, g.scenario, g.goals, g.extraNotes].filter(Boolean).join(" ").toLowerCase();
    if (!hay.trim())
        return undefined;
    for (const cue of STYLE_FAMILY_CUES) {
        if (cue.zh.some((t) => hay.includes(t)))
            return cue.family;
        // 英文 token 用词边界匹配，避免 "riso" 命中 "comparison" 之类的子串。
        if (cue.en.some((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(hay))) {
            return cue.family;
        }
    }
    return undefined;
}
/** family 禁用清单（去重后的 kind 列表），供 prompt 展示。自定义族无硬策略 → 空数组。 */
function bannedLayoutsForFamily(family) {
    if (!family || !(family in exports.STYLE_FAMILY_LAYOUT_POLICY))
        return [];
    const policy = exports.STYLE_FAMILY_LAYOUT_POLICY[family];
    if (!policy)
        return [];
    return Object.keys(policy.remap);
}
/**
 * 按 family 的锁定策略确定性 clamp 一份 outline 的 layoutHint（不改内容，只换版式）。
 * 返回新 outline（浅拷贝 slides）+ 被改的条数。family 无策略时原样返回。
 */
function clampOutlineToStyleFamily(outline, family) {
    const policy = family && family in exports.STYLE_FAMILY_LAYOUT_POLICY
        ? exports.STYLE_FAMILY_LAYOUT_POLICY[family]
        : undefined;
    if (!policy)
        return { outline, remapped: 0 };
    let remapped = 0;
    const slides = outline.slides.map((s) => {
        const hint = s.layoutHint;
        const to = hint ? policy.remap[hint] : undefined;
        if (hint && to && to !== hint) {
            remapped += 1;
            return { ...s, layoutHint: to };
        }
        return s;
    });
    return { outline: remapped > 0 ? { ...outline, slides } : outline, remapped };
}
exports.STYLE_FAMILY_IMAGERY = {
    editorial: {
        imageVibe: "editorial magazine photography, warm cinematic light, shallow depth of field, natural texture, human moment",
        fullBleedPhoto: true,
        preferredImageRatio: "3:2",
    },
    swiss: {
        imageVibe: "minimal Swiss graphic composition, flat geometric shapes, high contrast, single accent color, generous negative space, no photographic clutter",
        fullBleedPhoto: false,
        preferredImageRatio: "1:1",
    },
    "data-journalism": {
        imageVibe: "clean data-visualization aesthetic, restrained infographic style, muted background, cyan or amber accent, analytical mood",
        fullBleedPhoto: false,
        preferredImageRatio: "3:2",
    },
    "dark-launch": {
        imageVibe: "dark cinematic keynote backdrop, dramatic gradient, neon rim light, product-launch mood, deep blacks, glossy reflections",
        fullBleedPhoto: true,
        preferredImageRatio: "16:9",
    },
    glass: {
        imageVibe: "soft glassmorphism, translucent gradient blur, pastel depth layers, airy modern SaaS, frosted highlights",
        fullBleedPhoto: true,
        preferredImageRatio: "16:9",
    },
    memphis: {
        imageVibe: "bold Memphis pop, primary colors, playful geometric confetti, energetic flat illustration, 1980s postmodern",
        fullBleedPhoto: false,
        preferredImageRatio: "1:1",
    },
    risograph: {
        imageVibe: "risograph duotone print, grainy hand-made texture, limited ink palette, zine aesthetic, misregistered layers",
        fullBleedPhoto: true,
        preferredImageRatio: "3:2",
    },
};
/** 取某族图像气质；无 family / 未知时返回 null（调用方回退到通用 prompt / 允许全屏）。 */
function imageryForFamily(family) {
    if (!family || !(family in exports.STYLE_FAMILY_IMAGERY))
        return null;
    return exports.STYLE_FAMILY_IMAGERY[family] ?? null;
}
