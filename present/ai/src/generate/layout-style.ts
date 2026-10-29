// AI 布局风格（Layout Style）：让 AI 自己设计一套版式语言。
//
// 与主题（palette/字体）平行的第三个"设计自由度"：
//   - 主题决定 **颜色与字体**（GeneratedThemeSpec → realizeGeneratedTheme）
//   - motion 决定 **动效语言**（MotionSchemeSpec → MotionBundle）
//   - LayoutStyleSpec 决定 **构图语言**：网格密度、型号倍率、标题构图、
//     版心宽度、面板质感、装饰母题 —— layouts.ts 引擎按这份 spec 渲染。
//
// 设计取向（为什么不让 LLM 直接输出 shape 几何）：
//   自由几何（PPTAgent 式逐 shape 生成）在弱模型上大概率产出重叠 / 出界 /
//   不可读的版面。这里把"设计权"结构化成 ~20 个受 clamp 保护的旋钮：
//   AI 在安全空间内做真实的构图决策（左对齐编辑部 vs 居中舞台 vs 缘带分割、
//   幽灵序号 vs 章号胶囊、开放发丝 vs 软面板…），几何数学永远由引擎负责。
//   旋钮组合空间 >10^6，足够"每个 deck 一套独有版式系统"。

import { z } from "zod";
import type { GeneratedThemeSpec } from "../themes";
import type { HostSkillStore } from "../skills/types";
import { getEnabledSkillFragments } from "../skills/registry";

/** 布局风格生成的简报字段（GuidanceInput / ThemeGuidance 的公共子集）。 */
export interface LayoutStyleGuidance {
  topic?: string | undefined;
  audience?: string | undefined;
  scenario?: string | undefined;
  styleFamily?: string | undefined;
  extraNotes?: string | undefined;
  styleHint?: string | undefined;
}

// ---------------------------------------------------------------------------
// Schema —— 所有字段带默认值与硬 clamp；LLM 漏字段 / 越界都不会破坏渲染。
// ---------------------------------------------------------------------------

export const LayoutStyleSpecSchema = z.object({
  /** 风格名（如 "Poster Grid" / "杂志开本"）。 */
  name: z.string().min(1).max(40),
  /** 一行设计意图说明（用户语言）。 */
  description: z.string().min(1).max(120),

  grid: z
    .object({
      /** 水平安全边距（slide 宽度比例）。窄=海报感，宽=杂志留白。 */
      marginX: z.number().min(0.04).max(0.14).catch(0.07).default(0.07),
      /** 垂直安全边距。 */
      marginY: z.number().min(0.05).max(0.16).catch(0.09).default(0.09),
      /** 多栏间距 px。 */
      gutter: z.number().min(12).max(56).catch(24).default(24),
    })
    .prefault({}),

  typography: z
    .object({
      /** display 大字相对主题字号的倍率（封面/hero/stat）。 */
      displayScale: z.number().min(0.85).max(1.6).catch(1.15).default(1.15),
      /** 标题对齐。 */
      titleAlign: z.enum(["start", "middle"]).catch("start").default("start"),
      /** 标题字重。 */
      titleWeight: z.union([z.literal(600), z.literal(700), z.literal(800), z.literal(900)]).catch(800).default(800),
      /** 正文行高。 */
      bodyLineHeight: z.number().min(1.3).max(1.85).catch(1.55).default(1.55),
      /** 正文版心占比（1.0=满宽，0.6=窄栏杂志）。 */
      bodyMeasure: z.number().min(0.55).max(1).catch(0.8).default(0.8),
    })
    .prefault({}),

  composition: z
    .object({
      /** 封面构图锚点。 */
      coverAnchor: z.enum(["bottom-left", "center", "band-right"]).catch("bottom-left").default("bottom-left"),
      /** 章节页风格。 */
      sectionStyle: z.enum(["ghost-number", "chip-number", "masthead-left"]).catch("ghost-number").default("ghost-number"),
      /** hero 构图锚点。 */
      heroAnchor: z.enum(["bottom-left", "center"]).catch("bottom-left").default("bottom-left"),
      /** 内容页标题装饰。 */
      titleAccent: z.enum(["dot", "underline", "masthead", "prompt", "none"]).catch("underline").default("underline"),
      /** 面板质感（cards / comparison / metrics 卡）。 */
      panelStyle: z.enum(["soft", "flat", "open"]).catch("soft").default("soft"),
      /** 面板圆角 px（panelStyle=open 时忽略）。 */
      panelRadius: z.number().min(0).max(26).catch(14).default(14),
      /** 分隔语言：发丝线 / accent 短线 / 无。 */
      dividerStyle: z.enum(["hairline", "accent", "none"]).catch("hairline").default("hairline"),
      /** 幽灵大字底纹（章节序号 / 引号）。 */
      ghostGlyphs: z.boolean().catch(true).default(true),
      /** 列表首条强调。 */
      firstBulletEmphasis: z.boolean().catch(true).default(true),
    })
    .prefault({}),

  motifs: z
    .object({
      /** 全 deck 内容页复用的缘带母题。 */
      edgeBand: z.enum(["none", "left", "top", "right"]).catch("none").default("none"),
      /** 右下角页码。 */
      pageNumber: z.boolean().catch(false).default(false),
    })
    .prefault({}),
});

export type LayoutStyleSpec = z.infer<typeof LayoutStyleSpecSchema>;

/** 解析 + 兜底：任何非法输入回退到全默认（渲染永不因 style 崩）。 */
export function clampLayoutStyle(raw: unknown): LayoutStyleSpec {
  const r = LayoutStyleSpecSchema.safeParse(raw ?? {});
  if (r.success) return r.data;
  return LayoutStyleSpecSchema.parse({ name: "Default", description: "fallback" });
}

// ---------------------------------------------------------------------------
// 风格原型骰子（与主题的 palette archetypes 同心智）：每次生成随机抛一个作
// 非绑定起点，保证 run-to-run 构图语言可见变化。
// ---------------------------------------------------------------------------

export const LAYOUT_STYLE_ARCHETYPES: ReadonlyArray<{ id: string; hint: string }> = [
  { id: "poster-grid", hint: "tight margins (0.05), huge display (1.4+), bottom-left anchors, ghost glyphs ON, open panels, hairline dividers — Swiss poster energy" },
  { id: "magazine-spread", hint: "generous margins (0.10+), narrow body measure (0.62), masthead title accent, serif-friendly, first-bullet emphasis, no bands — print editorial" },
  { id: "stage-keynote", hint: "centered everything, displayScale 1.3, chip-number sections, soft panels with large radius, no ghost glyphs — Apple keynote" },
  { id: "blueprint-sheet", hint: "left edge band motif, page numbers ON, dot title accent, flat square panels (radius 0-4), hairline dividers everywhere — engineering document" },
  { id: "gallery-mat", hint: "widest margins (0.12+), center title align, measure 0.58, accent dividers, minimal motifs, ghost glyphs OFF — museum caption calm" },
  { id: "brutalist-type", hint: "displayScale 1.5-1.6, weight 900, underline title accent, top edge band, flat panels, measure 0.9 — type-as-image brutalism" },
];

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export function layoutStyleSystemPrompt(host?: HostSkillStore, styleFamily?: string): string {
  const archetypes = LAYOUT_STYLE_ARCHETYPES.map((a) => `    - ${a.id}: ${a.hint}`).join("\n");
  return [
    "You are an award-winning editorial art director. Design ONE layout system (composition language) for a presentation — the geometry counterpart of a color palette.",
    "You are NOT drawing individual slides. You are setting presentation-wide rules: grid density, type scale, where titles anchor, how panels feel, which decorative motifs repeat. A rendering engine executes your spec deterministically, so be opinionated — timid middle values produce forgettable presentations.",
    "",
    "Decision guide:",
    "- Dense/technical audience → tighter margins, smaller displayScale, hairline dividers, page numbers.",
    "- Launch/keynote → centered anchors, displayScale ≥1.3, soft panels, no clutter motifs.",
    "- Editorial/culture → bottom-left anchors, narrow bodyMeasure (0.6-0.7), masthead accents, ghost glyphs.",
    "- Brutalist/creative → displayScale 1.5+, weight 900, flat panels, one loud motif (edge band).",
    `- Layout archetypes — starting points, pick what fits the brief (or hybridize):\n${archetypes}`,
    "- COMMIT to a coherent point of view: at most ONE loud motif; if margins are tight, keep dividers quiet; if display is huge, keep panels flat.",
    "",
    ...getEnabledSkillFragments({ stage: "theme", host, ...(styleFamily ? { styleFamily } : {}) }),
    "",
    "Output format — return ONLY this exact JSON shape, no prose, no markdown fences:",
    "{",
    '  "name": "<short creative style name>",',
    '  "description": "<one-line intent, in the user\'s language>",',
    '  "grid": { "marginX": 0.04-0.14, "marginY": 0.05-0.16, "gutter": 12-56 },',
    '  "typography": { "displayScale": 0.85-1.6, "titleAlign": "start"|"middle", "titleWeight": 600|700|800|900, "bodyLineHeight": 1.3-1.85, "bodyMeasure": 0.55-1.0 },',
    '  "composition": {',
    '    "coverAnchor": "bottom-left" | "center" | "band-right",',
    '    "sectionStyle": "ghost-number" | "chip-number" | "masthead-left",',
    '    "heroAnchor": "bottom-left" | "center",',
    '    "titleAccent": "dot" | "underline" | "masthead" | "prompt" | "none",',
    '    "panelStyle": "soft" | "flat" | "open",',
    '    "panelRadius": 0-26,',
    '    "dividerStyle": "hairline" | "accent" | "none",',
    '    "ghostGlyphs": true|false,',
    '    "firstBulletEmphasis": true|false',
    "  },",
    '  "motifs": { "edgeBand": "none"|"left"|"top"|"right", "pageNumber": true|false }',
    "}",
    "",
    "CRITICAL: numbers must be plain JSON numbers within the stated ranges; enums must match EXACTLY (no synonyms).",
  ].join("\n");
}

export function layoutStyleUserPrompt(
  guidance: LayoutStyleGuidance,
  themeSpec?: Pick<GeneratedThemeSpec, "name" | "description" | "mode" | "decoration"> | undefined,
): string {
  const lines: string[] = ["Design a layout system for this presentation:"];
  if (guidance.topic) lines.push(`Topic: ${guidance.topic}`);
  if (guidance.audience) lines.push(`Audience: ${guidance.audience}`);
  if (guidance.scenario) lines.push(`Scenario: ${guidance.scenario}`);
  if (guidance.styleFamily) lines.push(`Style family: ${guidance.styleFamily}`);
  if (guidance.styleHint) lines.push(`Style hint (primary creative brief): ${guidance.styleHint}`);
  if (guidance.extraNotes) lines.push(`User requirements: ${guidance.extraNotes}`);
  if (themeSpec) {
    lines.push("");
    lines.push("The visual theme is already designed — the layout system must feel native to it:");
    lines.push(`  Theme: ${themeSpec.name} — ${themeSpec.description} (mode: ${themeSpec.mode}, decoration: ${themeSpec.decoration})`);
  }
  lines.push("");
  lines.push("Make composition decisions a template would never dare. Return the JSON only.");
  return lines.join("\n");
}
