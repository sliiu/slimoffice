// AI 输出的结构化 Schema（zod）。
//
// 设计要点：
//   1. 分两层：OutlineSchema（粗粒度大纲，用户可审阅）+ SlideSpecSchema
//      （逐页详情，与 compile/layouts.ts 的 SlideSpec 等价但走 zod 校验）。
//   2. 字段名与 layouts.ts 完全对齐，避免任何映射层 —— AI 直接吐出能 compile 的数据。
//   3. 每个 union 分支显式带 kind discriminator，让 LLM 输出更稳定（Function
//      Calling JSON Schema 对 discriminated union 支持很好）。
//   4. 描述（.describe(...)）会被注入到给 LLM 的 schema 中，作为"内联提示词"。

import { z } from "zod";
import { BUILTIN_THEME_IDS, type BuiltinThemeId } from "@ppt/themes";

/**
 * 内置主题 id（compile 可直接 `getTheme`）。必须与 `themes.ts` 的 `THEMES` keys 保持一致
 * —— 在 themes.ts 里有一个 `assertThemeIdsInSync` 编译期断言守护，新增/删主题时两边一起改。
 */
export { BUILTIN_THEME_IDS, type BuiltinThemeId };

/** 大纲 themeId：内置 + `ai`（视觉主题在生成幻灯片阶段单独设计，compile 用 themeOverride）。 */
export const OUTLINE_THEME_IDS = [...BUILTIN_THEME_IDS, "ai"] as const;
export type OutlineThemeId = (typeof OUTLINE_THEME_IDS)[number];

const OutlineThemeIdSchema = z.enum(OUTLINE_THEME_IDS);

// ---- Outline ----

/** outline / SlideSpec 共用的 layout 词表（与 compile/layouts.ts LAYOUT_KINDS 保持一致）。 */
export const OUTLINE_LAYOUT_HINTS = [
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
] as const;
export type OutlineLayoutHint = (typeof OUTLINE_LAYOUT_HINTS)[number];

export const OutlineItemSchema = z.object({
  title: z.string().describe("This slide's short title (≤ 24 chars)"),
  // 推荐 layout —— compile 阶段会再做一次校验，未识别时回退到 bullets。
  layoutHint: z
    .enum(OUTLINE_LAYOUT_HINTS)
    .optional()
    .describe("Recommended layout kind. Defaults to bullets when omitted."),
  templateLayoutId: z
    .string()
    .optional()
    .describe("When a layout template is attached, the id of one of its layouts. Omit otherwise."),
  bullets: z
    .array(z.string())
    .max(8)
    .optional()
    .describe(
      "Content payload for the chosen layoutHint (≤ 8). table: first item headers `A | B`, rest rows; chart: first item type `column|line|bar|pie`, next `Q1 | Q2 | Q3`, later `Name | 12 | 18 | 22`; metrics: `72%|NPS`; cards: `Title: body`; comparison: first `Left || Right`; otherwise short fact bullets.",
    ),
  // 配图方向：大纲阶段就把"这页配什么图"定下来（用户可在大纲编辑器里改），
  // slides 阶段据此产出 bgImageQuery/heroImageQuery，而不是临场即兴。
  imageIdea: z
    .string()
    .optional()
    .describe(
      "One-line imagery direction for this slide (ENGLISH, concrete: subject + setting + lighting, e.g. 'data center corridor, blue LED rows, night'). Required for cover/hero/section/stat/closing; recommended elsewhere. The slide pass turns this into actual image queries.",
    ),
  notes: z.string().optional().describe("Speaker notes for this slide (≤ 240 chars)."),
  pace: z
    .preprocess((value) => {
      if (!Array.isArray(value)) return undefined;
      const flags = value
        .map((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""))
        .filter((v) => v === "click" || v === "chain");
      return flags.length > 0 ? flags.slice(0, 8) : undefined;
    }, z.array(z.enum(["click", "chain"])).max(8).optional())
    .describe(
      "One flag per spoken point, in bullet order. click = wait for a click. chain = follow the previous point automatically. The title is always the first click and is not listed. Omit a flag or the whole array to mean click. Comparison skips the `Left || Right` line. Table skips the header line. Chart is exactly one flag. Stat has no points, so omit pace.",
    ),
  /** Deckgen L2 lock (wizard pill). Do not invent — whitelist only. */
  deckgenLayout: z.string().optional(),
  /** Deckgen L3 lock (wizard pill). Must pair with deckgenLayout. */
  deckgenVariant: z.string().optional(),
  // ---- Design Brief (filled by organize; the canvas author binds to these) ----
  /** One-sentence assertion this page must land. */
  coreMessage: z.string().optional(),
  /** "reader goes from A to B". */
  audienceMove: z.string().optional(),
  /** How the points relate; the author must carry it in geometry. */
  relationships: z.enum(["none", "order", "link", "parent", "membership", "contrast", "overlap", "flow"]).optional(),
  rhythm: z.enum(["anchor", "dense", "breathing"]).optional(),
  /** Primary carrier; drives image acquisition. */
  carrier: z.enum(["photo", "chart", "table", "diagram", "device", "typeOnly"]).optional(),
  /** Page composition; consecutive pages never share one (see deckgen/brief.ts). */
  composition: z.enum(["header-stack", "split", "statement", "full-bleed", "grid", "band", "sidebar"]).optional(),
});

export type OutlineItem = z.infer<typeof OutlineItemSchema>;

/** Deck-level Design Brief — mode, system preference, palette intent, motif. No hex except in paletteIntent prose. */
export const OutlineDesignBriefSchema = z.object({
  mode: z.enum(["pyramid", "narrative", "instructional", "showcase", "briefing"]).optional(),
  systemId: z.string().optional(),
  paletteIntent: z.string().optional(),
  motif: z.string().optional(),
  /** Page numerals on content pages (see deckgen/brief.ts `folio`). */
  folio: z.boolean().optional(),
  /** Where photographs go, once per deck (see deckgen/brief.ts `photoRhythm`). */
  photoRhythm: z.enum(["anchors", "bookends", "editorial", "none"]).optional(),
});
export type OutlineDesignBrief = z.infer<typeof OutlineDesignBriefSchema>;

export const OutlineSchema = z.object({
  title: z.string().describe("Presentation title shown on cover."),
  subtitle: z.string().optional(),
  themeId: OutlineThemeIdSchema.describe(
    `Theme id: one of ${BUILTIN_THEME_IDS.join(" | ")}, or "ai" when visuals will be AI-designed (not a built-in preset).`,
  ),
  slides: z.array(OutlineItemSchema).min(1).max(40).describe("Slide outline."),
  designBrief: OutlineDesignBriefSchema.optional(),
});

export type Outline = z.infer<typeof OutlineSchema>;

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
  notes: z
    .string()
    .optional()
    .describe(
      "Speaker notes for this slide (60-240 chars, same language as the deck): what to SAY — key message, a number worth calling out, transition to next slide. Every slide should have notes.",
    ),
} as const;

const imageEnrichmentFields = {
  bgImageQuery: z
    .string()
    .optional()
    .describe(
      "English keywords for a FULL-SLIDE background photo (recommended for cover / section / hero / stat / closing). Used by image enrichment pass to fetch a real photo via stock-image MCP. Leave empty for pure-content layouts.",
    ),
  bgOverlay: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Background overlay strength (0..1, default 0.45). Higher = darker scrim for text readability on photos."),
  heroImageQuery: z
    .string()
    .optional()
    .describe(
      "English keywords for an inline 'hero' photo to render alongside content (typically right half for bullets / above title for stat). Different from bg: occupies part of the slide, not full bleed.",
    ),
} as const;

export const CoverSchema = z.object({
  kind: z.literal("cover"),
  title: z.string(),
  subtitle: z.string().optional(),
  author: z.string().optional(),
  date: z.string().optional(),
  ...imageEnrichmentFields,
  ...speakerNotesField,
});

export const SectionSchema = z.object({
  kind: z.literal("section"),
  number: z.string().optional().describe('Section number text such as "01" or "Part 1".'),
  title: z.string(),
  caption: z.string().optional(),
  ...imageEnrichmentFields,
  ...speakerNotesField,
});

export const BulletsSchema = z.object({
  kind: z.literal("bullets"),
  title: z.string(),
  bullets: z.array(z.string()).min(1).max(8),
  ...imageEnrichmentFields,
  ...speakerNotesField,
});

export const TwoColumnSchema = z.object({
  kind: z.literal("two-column"),
  title: z.string(),
  leftTitle: z.string().optional(),
  leftBullets: z.array(z.string()).min(1).max(6),
  rightTitle: z.string().optional(),
  rightBullets: z.array(z.string()).min(1).max(6),
  ...imageEnrichmentFields,
  ...speakerNotesField,
});

export const QuoteSchema = z.object({
  kind: z.literal("quote"),
  quote: z.string(),
  attribution: z.string().optional(),
  ...imageEnrichmentFields,
  ...speakerNotesField,
});

export const ImageTextSchema = z.object({
  kind: z.literal("image-text"),
  title: z.string(),
  bullets: z.array(z.string()).min(1).max(6),
  imageQuery: z
    .string()
    .optional()
    .describe("Short English keywords for the inline photo on image-text slides. Enrichment pass fetches from Unsplash/Pexels and replaces the compile placeholder."),
  imagePosition: z.enum(["left", "right"]).optional(),
  ...imageEnrichmentFields,
  ...speakerNotesField,
});

export const TableSchema = z.object({
  kind: z.literal("table"),
  title: z.string(),
  headers: z.array(z.string()).min(2).max(6),
  rows: z.array(z.array(z.string())).min(1).max(10),
  ...imageEnrichmentFields,
  ...speakerNotesField,
});

export const ClosingSchema = z.object({
  kind: z.literal("closing"),
  title: z.string(),
  message: z.string().optional(),
  contact: z.string().optional(),
  ...imageEnrichmentFields,
  ...speakerNotesField,
});

export const ContentSchema = z.object({
  kind: z.literal("content"),
  title: z.string(),
  body: z.string(),
  ...imageEnrichmentFields,
  ...speakerNotesField,
});

// 新增 layout: hero —— 全屏大图 + 居中标题/副标题（产品发布 / 主题预告，最具冲击力）。
export const HeroSchema = z.object({
  kind: z.literal("hero"),
  title: z.string(),
  subtitle: z.string().optional(),
  eyebrow: z.string().optional().describe("Small uppercase label above the title (e.g. 'NEW', '2026 Q3', 'KEYNOTE')."),
  ...imageEnrichmentFields,
  ...speakerNotesField,
});

// 新增 layout: stat —— 一个超大数字 + 简短说明（数据高亮，演讲必备）。
export const StatSchema = z.object({
  kind: z.literal("stat"),
  value: z.string().describe("Big featured number/string (e.g. '+87%', '2.1B', '15 min')."),
  label: z.string().describe("Short caption explaining the value (≤ 40 chars)."),
  context: z.string().optional().describe("Optional one-line context / source (≤ 60 chars)."),
  ...imageEnrichmentFields,
  ...speakerNotesField,
});

/** 卡片栅格：2–4 张卡片，每张 title + body（功能点 / 支柱 / 卖点）。 */
export const CardsSchema = z.object({
  kind: z.literal("cards"),
  title: z.string(),
  cards: z
    .array(
      z.object({
        title: z.string().describe("Card heading ≤ 24 chars"),
        body: z.string().describe("Card body ≤ 80 chars"),
      }),
    )
    .min(2)
    .max(4),
  ...imageEnrichmentFields,
  ...speakerNotesField,
});

/** 时间线：3–6 个有序节点（里程碑 / 路线图）。 */
export const TimelineSchema = z.object({
  kind: z.literal("timeline"),
  title: z.string(),
  steps: z
    .array(
      z.object({
        label: z.string().describe("Short node label (date / phase) ≤ 20 chars"),
        detail: z.string().optional().describe("One-line detail ≤ 60 chars"),
      }),
    )
    .min(3)
    .max(6),
  ...imageEnrichmentFields,
  ...speakerNotesField,
});

/** 对比页：左 vs 右两栏（比 two-column 更强调对立）。 */
export const ComparisonSchema = z.object({
  kind: z.literal("comparison"),
  title: z.string(),
  leftLabel: z.string().describe("Left column heading (e.g. Before / Us)"),
  leftBullets: z.array(z.string()).min(1).max(5),
  rightLabel: z.string().describe("Right column heading (e.g. After / Them)"),
  rightBullets: z.array(z.string()).min(1).max(5),
  ...imageEnrichmentFields,
  ...speakerNotesField,
});

/** 议程 / 目录：编号条目列表。 */
export const AgendaSchema = z.object({
  kind: z.literal("agenda"),
  title: z.string(),
  items: z
    .array(
      z.object({
        number: z.string().optional().describe('Display number e.g. "01"'),
        label: z.string(),
        caption: z.string().optional(),
      }),
    )
    .min(3)
    .max(8),
  ...imageEnrichmentFields,
  ...speakerNotesField,
});

/** KPI 行：2–4 个并排小数字（不同于单焦点的 stat）。 */
export const MetricsSchema = z.object({
  kind: z.literal("metrics"),
  title: z.string(),
  metrics: z
    .array(
      z.object({
        value: z.string().describe("Short KPI e.g. '92%'"),
        label: z.string().describe("Caption ≤ 28 chars"),
      }),
    )
    .min(2)
    .max(4),
  ...imageEnrichmentFields,
  ...speakerNotesField,
});

export const ChartSchema = z.object({
  kind: z.literal("chart"),
  title: z.string(),
  chartType: z.enum(["column", "bar", "line", "area", "pie", "doughnut"]).optional(),
  categories: z.array(z.string()).min(2).max(12),
  series: z
    .array(
      z.object({
        name: z.string(),
        values: z.array(z.number()),
      }),
    )
    .min(1)
    .max(6),
  ...imageEnrichmentFields,
  ...speakerNotesField,
});

/** 流程步骤：水平编号步骤（How it works）。 */
export const ProcessSchema = z.object({
  kind: z.literal("process"),
  title: z.string(),
  steps: z
    .array(
      z.object({
        title: z.string().describe("Step title ≤ 24 chars"),
        detail: z.string().optional().describe("Step detail ≤ 60 chars"),
      }),
    )
    .min(3)
    .max(5),
  ...imageEnrichmentFields,
  ...speakerNotesField,
});

/** 色带分栏：左侧 accent 竖条区 + 右侧正文（杂志 / 瑞士网格感）。 */
export const BannerSchema = z.object({
  kind: z.literal("banner"),
  title: z.string(),
  eyebrow: z.string().optional().describe("Small label in the accent band"),
  bullets: z.array(z.string()).min(1).max(6),
  ...imageEnrichmentFields,
  ...speakerNotesField,
});

export const SlideSpecSchema = z.discriminatedUnion("kind", [
  CoverSchema,
  SectionSchema,
  BulletsSchema,
  TwoColumnSchema,
  QuoteSchema,
  ImageTextSchema,
  TableSchema,
  ClosingSchema,
  ContentSchema,
  HeroSchema,
  StatSchema,
  CardsSchema,
  TimelineSchema,
  ComparisonSchema,
  AgendaSchema,
  MetricsSchema,
  ChartSchema,
  ProcessSchema,
  BannerSchema,
]);

export type SlideSpecZ = z.infer<typeof SlideSpecSchema>;

// 整篇生成（一次性产出全部 slide spec，可选路径；默认走 outline → 逐页生成）。
export const PresentationSpecSchema = z.object({
  themeId: OutlineThemeIdSchema.describe("Theme id from outline (may be ai)."),
  slides: z.array(SlideSpecSchema).min(1).max(40),
});

export type PresentationSpec = z.infer<typeof PresentationSpecSchema>;

// ---- 视觉风格族（UI → generate，映射 ppt_style_systems）----

export const STYLE_FAMILY_IDS = [
  "editorial",
  "swiss",
  "data-journalism",
  "dark-launch",
  "glass",
  "memphis",
  "risograph",
] as const;

export type StyleFamilyId = (typeof STYLE_FAMILY_IDS)[number];

/** English styleHint keywords for outline / theme / motion passes. */
export const STYLE_FAMILY_STYLE_HINTS: Record<StyleFamilyId, string> = {
  editorial: "editorial magazine warm serif title sans body cinematic photos",
  swiss: "Swiss international grid sharp sans one anchor color hairline grid",
  "data-journalism": "dark data dashboard chart-forward cyan or amber accent",
  "dark-launch": "dark launch keynote cinematic gradient display sans neon rim",
  glass: "glassmorphism saas translucent layers soft gradient depth",
  memphis: "memphis pop bold primaries geometric playful energy",
  risograph: "risograph duotone zine hand-made texture",
};

// ---- 风格族 → 锁定版式目录（roadmap #9）----
//
// 某些风格族有强烈的版式语言：Swiss 国际主义是网格 + 发丝线，绝不用大照片 hero / 情绪引言；
// 数据新闻以图表/数字为主，也不该出现 image-text 大配图。这里给这类 family 定义一份"禁用
// layout → 替代 layout"的映射，在 outline 生成后**确定性 clamp** `layoutHint`（把跑偏的版式
// 拉回族内），并把允许/禁用清单喂进 outline / slide prompt 引导模型。
//
// 只对**版式语言强约束**的 family 立规矩；未列出的 family（editorial / dark-launch / glass /
// memphis）不限制版式，保留最大表现自由。remap 的 value 必须是结构上兼容的替代（bullets↔
// two-column↔content 内容型互换、hero→section/cover 结构型、quote→content/stat）。
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

export const STYLE_FAMILY_LAYOUT_POLICY: Partial<Record<StyleFamilyId, StyleFamilyLayoutPolicy>> = {
  swiss: {
    remap: {
      "image-text": "banner",
      quote: "content",
      hero: "section",
      cards: "metrics",
      timeline: "process",
    },
    preferred: ["section", "banner", "two-column", "metrics", "chart", "table", "stat", "agenda", "process", "bullets", "content"],
    reason:
      "Swiss international style is grid + hairline typography with NO large photos or emotional pull-quotes — prefer banner / two-column / metrics / table / process / agenda.",
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
    reason:
      "Data-journalism is chart / number-forward — avoid decorative photo layouts; prefer chart / stat / metrics / table / comparison / process.",
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
const DEFAULT_DIVERSITY_POOL: OutlineLayoutHint[] = [
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
export function diversifyOutlineLayouts(
  outline: Outline,
  family: string | "" | undefined,
): { outline: Outline; remapped: number } {
  const policy =
    family && family in STYLE_FAMILY_LAYOUT_POLICY
      ? STYLE_FAMILY_LAYOUT_POLICY[family as StyleFamilyId]
      : undefined;
  const banned = new Set<OutlineLayoutHint>(
    policy ? (Object.keys(policy.remap) as OutlineLayoutHint[]) : [],
  );
  const pool = (policy?.preferred?.length ? policy.preferred : DEFAULT_DIVERSITY_POOL).filter(
    (k) => k !== "cover" && k !== "closing" && !banned.has(k),
  );
  if (pool.length === 0) return { outline, remapped: 0 };

  const structural = new Set<OutlineLayoutHint>(["cover", "closing", "section", "hero"]);
  const textHeavy = new Set<OutlineLayoutHint>(["bullets", "content"]);
  let remapped = 0;
  let poolIdx = 0;
  const slides = outline.slides.map((s, i) => {
    const hint = s.layoutHint ?? "bullets";
    if (structural.has(hint) || i === 0) return s;
    const prev = outline.slides[i - 1]?.layoutHint ?? "bullets";
    const sameAsPrev = hint === prev && !structural.has(prev);
    const textPair = textHeavy.has(hint) && textHeavy.has(prev);
    if (!sameAsPrev && !textPair) return s;

    let next: OutlineLayoutHint | undefined;
    for (let t = 0; t < pool.length; t++) {
      const cand = pool[(poolIdx + t) % pool.length]!;
      if (cand !== hint && cand !== prev) {
        next = cand;
        poolIdx = (poolIdx + t + 1) % pool.length;
        break;
      }
    }
    if (!next || next === hint) return s;
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
const STYLE_FAMILY_CUES: Array<{ family: StyleFamilyId; zh: string[]; en: string[] }> = [
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
export function inferStyleFamilyFromGuidance(g: GuidanceInput): StyleFamilyId | undefined {
  const hay = [g.topic, g.scenario, g.goals, g.extraNotes].filter(Boolean).join(" ").toLowerCase();
  if (!hay.trim()) return undefined;
  for (const cue of STYLE_FAMILY_CUES) {
    if (cue.zh.some((t) => hay.includes(t))) return cue.family;
    // 英文 token 用词边界匹配，避免 "riso" 命中 "comparison" 之类的子串。
    if (cue.en.some((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(hay))) {
      return cue.family;
    }
  }
  return undefined;
}

/** family 禁用清单（去重后的 kind 列表），供 prompt 展示。自定义族无硬策略 → 空数组。 */
export function bannedLayoutsForFamily(family: string | "" | undefined): OutlineLayoutHint[] {
  if (!family || !(family in STYLE_FAMILY_LAYOUT_POLICY)) return [];
  const policy = STYLE_FAMILY_LAYOUT_POLICY[family as StyleFamilyId];
  if (!policy) return [];
  return Object.keys(policy.remap) as OutlineLayoutHint[];
}

/**
 * 按 family 的锁定策略确定性 clamp 一份 outline 的 layoutHint（不改内容，只换版式）。
 * 返回新 outline（浅拷贝 slides）+ 被改的条数。family 无策略时原样返回。
 */
export function clampOutlineToStyleFamily(
  outline: Outline,
  family: string | "" | undefined,
): { outline: Outline; remapped: number } {
  const policy =
    family && family in STYLE_FAMILY_LAYOUT_POLICY
      ? STYLE_FAMILY_LAYOUT_POLICY[family as StyleFamilyId]
      : undefined;
  if (!policy) return { outline, remapped: 0 };
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

// ---- 风格族 → 图像气质约束（roadmap L1，让 AI 生图 / 选图贴合主题）----
//
// 现状痛点：toAiPrompt 是通用模板（"cinematic background: <query>"），不带任何主题信息，
// 于是暗色发布会和瑞士国际主义拿到的图长得一样 → 用户反馈"背景图跟主题不符"。
// 这里给每个 family 定义：
//   - imageVibe：注入 AI 图像 prompt 的英文风格关键词（气质锚点）；
//   - fullBleedPhoto：是否允许全屏出血底图。false 的族（Swiss / 数据新闻 / Memphis）
//     版式语言不吃大照片，enrich 时直接跳过 bg 任务，避免破坏网格 / 数据感；
//   - preferredImageRatio：期望宽高比提示（可选）。
// 约束留在代码（强类型可测），skill 只做散文引导 —— 与 STYLE_FAMILY_LAYOUT_POLICY 同源心智。
export interface StyleFamilyImagery {
  /** 注入 AI 图像 prompt 的风格关键词（英文）。 */
  imageVibe: string;
  /** 是否允许全屏出血底图。false = 用 bounded hero，不铺全屏照片。 */
  fullBleedPhoto: boolean;
  /** 期望图片宽高比提示（可选）。 */
  preferredImageRatio?: string;
}

export const STYLE_FAMILY_IMAGERY: Record<StyleFamilyId, StyleFamilyImagery> = {
  editorial: {
    imageVibe:
      "editorial magazine photography, warm cinematic light, shallow depth of field, natural texture, human moment",
    fullBleedPhoto: true,
    preferredImageRatio: "3:2",
  },
  swiss: {
    imageVibe:
      "minimal Swiss graphic composition, flat geometric shapes, high contrast, single accent color, generous negative space, no photographic clutter",
    fullBleedPhoto: false,
    preferredImageRatio: "1:1",
  },
  "data-journalism": {
    imageVibe:
      "clean data-visualization aesthetic, restrained infographic style, muted background, cyan or amber accent, analytical mood",
    fullBleedPhoto: false,
    preferredImageRatio: "3:2",
  },
  "dark-launch": {
    imageVibe:
      "dark cinematic keynote backdrop, dramatic gradient, neon rim light, product-launch mood, deep blacks, glossy reflections",
    fullBleedPhoto: true,
    preferredImageRatio: "16:9",
  },
  glass: {
    imageVibe:
      "soft glassmorphism, translucent gradient blur, pastel depth layers, airy modern SaaS, frosted highlights",
    fullBleedPhoto: true,
    preferredImageRatio: "16:9",
  },
  memphis: {
    imageVibe:
      "bold Memphis pop, primary colors, playful geometric confetti, energetic flat illustration, 1980s postmodern",
    fullBleedPhoto: false,
    preferredImageRatio: "1:1",
  },
  risograph: {
    imageVibe:
      "risograph duotone print, grainy hand-made texture, limited ink palette, zine aesthetic, misregistered layers",
    fullBleedPhoto: true,
    preferredImageRatio: "3:2",
  },
};

/** 取某族图像气质；无 family / 未知时返回 null（调用方回退到通用 prompt / 允许全屏）。 */
export function imageryForFamily(family: string | "" | undefined): StyleFamilyImagery | null {
  if (!family || !(family in STYLE_FAMILY_IMAGERY)) return null;
  return STYLE_FAMILY_IMAGERY[family as StyleFamilyId] ?? null;
}

// ---- 引导参数（UI → generate）----
//
// 注意：这部分不发给 LLM 当 schema，而是 UI 表单的 TS 类型。
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
  // 详细要求 / 额外约束。
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
