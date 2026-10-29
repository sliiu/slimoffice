// 系统提示词（Prompt）模板。
//
// 三类提示词：
//   1. outlinePrompt —— 生成大纲。强调"短标题 + 少量 bullets"，并给出 layoutHint。
//   2. slidePrompt —— 把单条 outline 项精化为 SlideSpec（让 LLM 在 layouts 之间做选择
//      并填实内容）。
//   3. chatSystemPrompt —— 修改对话模式的系统人格 + tool 使用规则。

import type { GuidanceInput, Outline, OutlineItem, StyleFamilyId } from "./schema";
import { COPY_VOICE_BLOCK } from "./copy-voice.js";
import { STYLE_FAMILY_LAYOUT_POLICY, STYLE_FAMILY_STYLE_HINTS, bannedLayoutsForFamily } from "./schema";
import { OUTLINE_THEME_IDS } from "./schema";
import { LAYOUT_KINDS } from "./compile/layouts";
import {
  MAINSTREAM_EFFECT_LIST,
  MOTION_BUNDLE_IDS,
  MOTION_BUNDLES,
  MOTION_SCHEME_CONFIGURABLE_ROLES,
} from "../animations";
import { THEME_FONT_FAMILIES, type GeneratedThemeSpec } from "../themes";
import { guidanceStyleHint } from "./style-hint";
import { getEnabledSkillFragments } from "../skills/registry";
import type { HostSkillStore } from "../skills/types";

export { guidanceStyleHint } from "./style-hint";

const LAYOUTS_LINE = LAYOUT_KINDS.join(" | ");

/** 风格族版式锁定的一行 prompt 引导（family 无锁定策略时返回 null）。见 schema STYLE_FAMILY_LAYOUT_POLICY。 */
function styleFamilyLayoutLockLine(family: string | undefined): string | null {
  const banned = bannedLayoutsForFamily(family as StyleFamilyId | undefined);
  if (banned.length === 0) return null;
  const policy = STYLE_FAMILY_LAYOUT_POLICY[family as StyleFamilyId];
  return `Layout lock — ${policy?.reason ?? ""} Do NOT use these layout kinds: ${banned.join(", ")} (off-brand for this style; they get auto-remapped).`;
}

export function resolveGuidanceLanguage(g: GuidanceInput): string {
  const lang = g.language?.trim();
  if (lang) return lang;
  return /[\u4e00-\u9fff]/.test(`${g.topic}\n${g.extraNotes ?? ""}`) ? "zh" : "en";
}

export function guidanceHardConstraints(g: GuidanceInput): string {
  const lines: string[] = [
    "HARD CONSTRAINTS — follow exactly. Do not soften, omit, or override any of these:",
  ];
  const lang = g.language?.trim();
  if (lang) {
    lines.push(
      `- Language: ALL titles, bullets, speaker notes, and spoken copy MUST be in ${lang}. No other language.`,
    );
  } else {
    lines.push("- Language: match the topic's language throughout; do not switch.");
  }
  if (g.audience?.trim()) lines.push(`- Audience: write for ${g.audience.trim()}.`);
  if (g.scenario?.trim()) lines.push(`- Scenario: ${g.scenario.trim()}.`);
  if (g.goals?.trim()) lines.push(`- Goals (must be fulfilled by the presentation): ${g.goals.trim()}.`);
  if (g.slideCount != null && Number.isFinite(g.slideCount)) {
    lines.push(
      `- Slide count: EXACTLY ${Math.round(g.slideCount)} slides in the "slides" array. Cover / section / closing count toward this number.`,
    );
  }
  if (g.styleFamily?.trim()) {
    lines.push(`- Style family: ${g.styleFamily.trim()} — stay on-brand; do not switch families.`);
  }
  if (g.themeId && g.themeId !== "ai") {
    lines.push(`- Theme preset: "${g.themeId}" — do not substitute another id or "ai".`);
  }
  if (g.extraNotes?.trim()) {
    lines.push(`- User requirements (mandatory, not suggestions): ${g.extraNotes.trim()}`);
  }
  if (g.sourceBound || g.sourceMaterial?.trim()) {
    lines.push(
      "- Facts: numbers, names, and claims come only from the source material and the approved outline. Do not invent any. When sources disagree, keep both and prefix each with [冲突].",
    );
  }
  if (g.sourceMaterial?.trim()) {
    lines.push("SOURCE MATERIAL:", g.sourceMaterial.trim());
  }
  return lines.join("\n");
}

/** Edit-pass constraints: language + audience + extra notes. Slide count belongs to outline. */
export function guidancePaintConstraints(g: GuidanceInput): string {
  const lines: string[] = ["HARD — follow exactly:"];
  lines.push(`- Language: ${resolveGuidanceLanguage(g)}.`);
  if (g.audience?.trim()) lines.push(`- Audience: ${g.audience.trim()}.`);
  if (g.extraNotes?.trim()) lines.push(`- User requirements: ${g.extraNotes.trim()}`);
  return lines.join("\n");
}

function guidanceLines(g: GuidanceInput): string {
  const lines: string[] = [
    guidanceHardConstraints(g),
    "",
    `Topic: ${g.topic}`,
    "Plan a visually varied presentation: mix chart / table / metrics / cards / process / comparison with cover and closing. Put series into chart, grids into table, lone KPIs into metrics — not a bullet list.",
  ];
  if (!g.slideCount) {
    lines.push(
      "Slide count: AI decides — choose an appropriate length for the topic and audience (typically 8–15 slides; more for deep or training topics).",
    );
  }
  if (!g.themeId || g.themeId === "ai") {
    lines.push('Theme: AI-designed (default) — set outline themeId to "ai".');
  }
  if (g.styleFamily) {
    const builtinHint = STYLE_FAMILY_STYLE_HINTS[g.styleFamily as keyof typeof STYLE_FAMILY_STYLE_HINTS];
    if (builtinHint) {
      lines.push(`Visual style family detail: ${g.styleFamily} — ${builtinHint}`);
    } else {
      lines.push(
        `Visual style family detail: ${g.styleFamily} — honor this custom family's skill sections and keep layouts on-brand.`,
      );
    }
    const lock = styleFamilyLayoutLockLine(g.styleFamily);
    if (lock) lines.push(lock);
  }
  return lines.join("\n");
}

export function outlineSystemPrompt(host?: HostSkillStore, styleFamily?: string, themeId?: string): string {
  const themeRule =
    themeId && themeId !== "ai"
      ? `- "themeId" must be exactly "${themeId}".`
      : '- "themeId" must be "ai".';
  return [
    "You are an expert presentation designer. Output a slide-by-slide outline as JSON only.",
    "This outline is CONTENT. A local compiler assigns the final layout from bullet encoding. You do not call editor tools.",
    "Encode data so the compiler can pick the page type:",
    "- table — bullets[0] = headers `Col A | Col B | Col C`; later bullets = rows `v1 | v2 | v3`.",
    "- chart — first bullet `column`/`line`/`bar`/`pie`/`area`/`doughnut`; next `Q1 | Q2 | Q3`; later series `Name | 12 | 18 | 22`.",
    "- metrics — 2–4 KPI tiles. each bullet `72%|NPS` (value|label).",
    "- stat — ONE giant number. first bullet = the value; title = the label.",
    "- cards — 2–4 pillars. bullet `Title: one concrete sentence`.",
    "- comparison — first bullet `Left || Right`; remaining bullets split across sides.",
    "- process / timeline — one bullet = one numbered/dated step.",
    "- cover / hero / closing / section — structural pages. bullets stay short.",
    "- agenda — contents page (目录) right after the cover: one bullet per section, in order, ≤ 8. Include it when the deck has ≥ 8 slides or ≥ 2 sections (it counts toward the slide count); skip it on short decks.",
    "- bullets / content — last resort. Never more than 2 consecutive.",
    "Put series into chart encoding, grids into table, lone KPIs into metrics. Do not flatten those into prose.",
    "Rules:",
    "- Honor HARD CONSTRAINTS in the user message exactly (language, audience, scenario, goals, slide count, theme, extra requirements).",
    "- Titles ≤ 24 chars. 3–6 bullets on content slides; each ≤ 80 chars; specific fact / number / mechanism — never a bare label.",
    "- speaker notes (`notes`) ≤ 160 chars (what to SAY). imageIdea ≤ 80 chars, ENGLISH, subject+setting+lighting, same visual world as the topic.",
    "- Write `bullets` in the order the speaker will say them. Do not sort them to match a visual path (a bottom-up timeline still lists step 1 first).",
    '- `pace` is one flag per spoken point, in that same order. "click" waits for a click. "chain" follows the previous point automatically. The title is always the first click and is not listed. Example ["click","click","chain","chain"]: two points wait, then one click plays the next two. All "click" walks every point. All "chain" plays the rest after the title click. Omit `pace` only when every point waits. Comparison: one flag per bullet after `Left || Right`. Table: one flag per data row, not the header. Chart: exactly one flag. Stat: omit `pace`.',
    `- layoutHint is a suggestion only. If present it MUST be one of: ${LAYOUTS_LINE}.`,
    "- First slide cover or hero. Last slide closing. Section dividers only if count ≥ 8, still inside the count.",
    "- imageIdea required on cover/hero/section/stat/closing; optional elsewhere.",
    themeRule,
    COPY_VOICE_BLOCK,
    "",
    ...getEnabledSkillFragments({ stage: "outline", host, ...(styleFamily ? { styleFamily } : {}) }),
    "",
    "JSON shape (exact field names bullets / themeId / layoutHint):",
    `{"title":"...","subtitle":"...","themeId":"<${OUTLINE_THEME_IDS.join("|")}>","slides":[{"title":"...","layoutHint":"...","bullets":["..."],"pace":["click","chain"],"imageIdea":"...","notes":"..."}]}`,
    "No markdown fences. No extra keys.",
  ].join("\n");
}

export function outlineUserPrompt(g: GuidanceInput): string {
  return [
    "Please plan a presentation with the following requirements:",
    "",
    guidanceLines(g),
  ].join("\n");
}

export function slideSystemPrompt(
  host?: HostSkillStore,
  ctx?: { styleFamily?: string; layoutKinds?: string[] },
): string {
  return [
    "You are an expert presentation designer assistant.",
    "Your task: produce ONE concrete slide spec for a given outline item.",
    "Rules:",
    "- Respect the suggested `layoutHint` unless content clearly needs another shape.",
    "- Keep bullets concise (~ 8-14 words each, parallel structure, no period) — but each bullet must carry a SPECIFIC fact, number, mechanism or example, never a bare label like '高效' / 'scalable'.",
    "- Title <= 24 chars.",
    "- Match the existing presentation language and tone.",
    "- Do NOT repeat content from previous slides verbatim.",
    "- FILL the optional detail fields — they are what makes a slide feel finished, not thin:",
    "    * process/timeline steps: always include `detail` (one concrete sentence per step);",
    "    * agenda items: include `caption` where it adds context;",
    "    * cards: `body` must be a substantive sentence (mechanism / benefit / number), not a category name;",
    "    * stat: always include `context` (source or comparison);",
    "    * quote: always include `attribution`.",
    "",
    "**IMAGE ENRICHMENT (key to a finished presentation):**",
    "- Every slide MAY include these optional fields to request photos that an enrichment pass will fetch from Unsplash/Pexels:",
    "    `bgImageQuery`: 3-7 ENGLISH keywords describing a FULL-SLIDE background photo. Use this AGGRESSIVELY for:",
    "        * cover / hero / section / stat / closing slides → almost always include one,",
    "        * bullets / two-column → only when a strong visual metaphor exists.",
    "    `bgOverlay`: 0..1, optional. 0.45 default. Use 0.6+ for light/busy photos when title text is white.",
    "    `heroImageQuery`: 3-7 ENGLISH keywords for an inline hero photo (rendered on right half). Use when bg would compete with bullets (e.g. content-heavy bullets slide).",
    "- **SUBJECT ANCHORING (top priority)**: every query must be recognizably ABOUT this presentation's actual subject domain. Build queries as: <presentation's concrete subject/industry> + <this slide's specific concept> + <lighting/mood> (e.g. an AI-platform presentation → 'server room blue light rows', 'data center corridor night', 'circuit board macro depth'; a coffee-brand presentation → 'coffee roastery beans macro'). NEVER borrow an unrelated metaphor (no city skylines for software, no mountains/compasses for 'growth', no rockets unless the presentation is about rockets).",
    "- **ONE VISUAL WORLD per presentation**: all queries in this presentation must share one consistent photographic world — same subject family, palette and lighting (follow the DESIGN SPEC 'Imagery' vibe when present). A reader flipping slides should feel one photographer shot everything.",
    "- Abstract texture queries ('gradient mesh dark abstract') are a LAST resort, only when the subject is truly unphotographable — and they must still match the presentation's imagery vibe.",
    "- For `image-text` layout, `imageQuery` is REQUIRED for the side photo (enrichment pass auto-fills it from Unsplash/Pexels); you may ALSO add `bgImageQuery` as a subtle background.",
    "- Aim for ~70-85% of slides to have at least one image query — the user wants a visually rich presentation, NOT a wall of text.",
    "- On hero/cover/section/closing with bgImageQuery: default bgOverlay to 0.6 unless the photo is already very dark.",
    "",
    ...getEnabledSkillFragments({
      stage: "slide",
      host,
      ...(ctx?.styleFamily ? { styleFamily: ctx.styleFamily } : {}),
      ...(ctx?.layoutKinds ? { layoutKinds: ctx.layoutKinds } : {}),
    }),
    "",
    'REQUIRED on EVERY slide: `"notes"` — speaker notes (60-240 chars, presentation language): what to SAY on this slide — the key message, one number worth calling out, and the transition into the next slide. Do not restate the visible bullets verbatim.',
    "",
    "Output format — return ONLY valid JSON, no prose, no markdown fences. Pick ONE shape based on `kind` (every kind also accepts the `notes` field):",
    "",
    '// kind="cover"      → { "kind": "cover",      "title": "<title>", "subtitle"?: "<sub>", "author"?: "<a>", "date"?: "<d>", "bgImageQuery"?: "<en kw>", "bgOverlay"?: 0..1 }',
    '// kind="section"    → { "kind": "section",    "title": "<title>", "number"?: "<\\"01\\">", "caption"?: "<c>", "bgImageQuery"?: "<en kw>", "bgOverlay"?: 0..1 }',
    '// kind="bullets"    → { "kind": "bullets",    "title": "<title>", "bullets": ["<b1>", "..."] (1-8), "notes"?: "<n>", "heroImageQuery"?: "<en kw>" }',
    '// kind="two-column" → { "kind": "two-column", "title": "<title>", "leftTitle"?, "leftBullets": ["..."] (1-6), "rightTitle"?, "rightBullets": ["..."] (1-6), "heroImageQuery"?: "<en kw>" }',
    '// kind="quote"      → { "kind": "quote",      "quote": "<text>", "attribution"?: "<who>", "bgImageQuery"?: "<en kw>", "bgOverlay"?: 0..1 }',
    '// kind="image-text" → { "kind": "image-text", "title": "<title>", "bullets": ["..."] (1-6), "imageQuery"?: "<en kw>", "imagePosition"?: "left"|"right", "bgImageQuery"?: "<en kw>" }',
    '// kind="table"      → { "kind": "table",      "title": "<title>", "headers": ["..."] (2-6), "rows": [["..."], ...] (1-10) }',
    '// kind="closing"    → { "kind": "closing",    "title": "<title>", "message"?: "<m>", "contact"?: "<c>", "bgImageQuery"?: "<en kw>", "bgOverlay"?: 0..1 }',
    '// kind="content"    → { "kind": "content",    "title": "<title>", "body": "<paragraph>", "bgImageQuery"?: "<en kw>" }',
    '// kind="hero"       → { "kind": "hero",       "title": "<title>", "subtitle"?: "<sub>", "eyebrow"?: "<short uppercase label>", "bgImageQuery": "<en kw, REQUIRED for impact>", "bgOverlay"?: 0..1 } — use for cinematic full-bleed moments',
    '// kind="stat"       → { "kind": "stat",       "value": "<big number e.g. \\"+87%\\">", "label": "<≤40 char caption>", "context"?: "<source ≤60>", "bgImageQuery"?: "<en kw, recommended>" } — single-data highlight slide',
    '// kind="cards"      → { "kind": "cards",      "title": "<title>", "cards": [{ "title": "≤24", "body": "≤80" }, ...] (2-4) } — feature / pillar grid',
    '// kind="timeline"   → { "kind": "timeline",   "title": "<title>", "steps": [{ "label": "≤20", "detail"?: "≤60" }, ...] (3-6) } — roadmap / milestones',
    '// kind="comparison" → { "kind": "comparison", "title": "<title>", "leftLabel": "<A>", "leftBullets": ["..."] (1-5), "rightLabel": "<B>", "rightBullets": ["..."] (1-5) } — explicit VS layout',
    '// kind="agenda"     → { "kind": "agenda",     "title": "<title>", "items": [{ "number"?: "01", "label": "<item>", "caption"?: "<sub>" }, ...] (3-8) } — TOC / agenda',
    '// kind="metrics"    → { "kind": "metrics",    "title": "<title>", "metrics": [{ "value": "<KPI>", "label": "≤28" }, ...] (2-4) } — multi-KPI row (≠ single stat)',
    '// kind="chart"      → { "kind": "chart",      "title": "<title>", "chartType"?: "column"|"bar"|"line"|"area"|"pie"|"doughnut", "categories": ["Q1","Q2"], "series": [{ "name": "A", "values": [1,2] }] } — real chart, not KPI tiles',
    '// kind="process"    → { "kind": "process",    "title": "<title>", "steps": [{ "title": "≤24", "detail"?: "≤60" }, ...] (3-5) } — how-it-works horizontal steps',
    '// kind="banner"     → { "kind": "banner",     "title": "<title>", "eyebrow"?: "<label>", "bullets": ["..."] (1-6) } — left accent band + right body',
    "",
    "Layout diversity: prefer chart / cards / timeline / comparison / metrics / process / banner / image-text over repeating bullets. Never >2 consecutive bullets/content slides.",
    "",
    'CRITICAL: Use EXACTLY these field names. Common WRONG names to avoid: "bulletPoints"/"points"/"items" (→ "bullets"), "leftColumn"/"rightColumn" (→ "leftBullets"/"rightBullets"), "header"/"columns" (→ "headers"), "data" (→ "rows"), "text"/"content" (→ "body" for content kind, "quote" for quote kind), "backgroundImage"/"bgImage"/"image" (→ "bgImageQuery").',
    'CRITICAL: All image queries MUST be in ENGLISH (Unsplash/Pexels indexing is English-first). The slide text itself stays in the presentation language.',
  ].join("\n");
}

export function slideUserPrompt(args: {
  outline: Outline;
  index: number;
  item: OutlineItem;
  guidance: GuidanceInput;
}): string {
  const { outline, index, item, guidance } = args;
  const prevTitles = outline.slides
    .slice(0, index)
    .map((s, i) => `  slideIdx=${i}: ${s.title}`)
    .join("\n");
  const nextTitles = outline.slides
    .slice(index + 1, index + 4)
    .map((s, i) => `  slideIdx=${index + 1 + i}: ${s.title}`)
    .join("\n");
  return [
    guidanceHardConstraints(guidance),
    "",
    `Presentation: ${outline.title}`,
    outline.subtitle ? `Subtitle: ${outline.subtitle}` : "",
    `Theme: ${outline.themeId === "ai" ? "ai (custom-designed visuals)" : outline.themeId}`,
    `Output language: ${guidance.language ?? "match topic"}`,
    `Audience: ${guidance.audience ?? "general"}`,
    `Scenario: ${guidance.scenario ?? "general"}`,
    guidance.goals ? `Goals / key takeaways: ${guidance.goals}` : "",
    guidance.extraNotes ? `User requirements: ${guidance.extraNotes}` : "",
    styleFamilyLayoutLockLine(guidance.styleFamily || undefined) ?? "",
    "",
    "Previous slides:",
    prevTitles || "  (none — this is the first slide)",
    "",
    "Upcoming slides:",
    nextTitles || "  (none — this is the last slide)",
    "",
    `slideIdx=${index} (0-based):`,
    `  Title: ${item.title}`,
    item.layoutHint ? `  layout: ${item.layoutHint}` : "  layout: (decide yourself)",
    item.bullets?.length ? `  Bullet hints: ${item.bullets.map((b) => `- ${b}`).join("; ")}` : "",
    item.imageIdea
      ? `  Imagery direction (from outline — turn this into bgImageQuery/heroImageQuery, refining but not contradicting it): ${item.imageIdea}`
      : "",
    item.notes ? `  Speaker notes: ${item.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ============================================================================
// 参考模板填槽 prompt（PPTAgent edit-based 路径）
// ============================================================================

export function slotFillSystemPrompt(host?: HostSkillStore, styleFamily?: string): string {
  return [
    "You are filling text slots on a cloned reference PowerPoint slide.",
    "The slide's geometry, colors, decorations, and images are ALREADY fixed — you ONLY write new text into listed shapeIds.",
    "Rules:",
    "- Output language must match the presentation language.",
    "- Respect maxChars per slot (slightly over is ok; never dump a paragraph into a title slot).",
    "- Multi-paragraph slots: separate lines with \\n; keep roughly the same number of lines as `paragraphs`.",
    "- Do NOT invent shapeIds. Fill every listed shapeId exactly once.",
    "- Speaker notes: 60-240 chars on what to SAY (not a bullet dump).",
    "",
    ...getEnabledSkillFragments({
      stage: "slide",
      host,
      ...(styleFamily ? { styleFamily } : {}),
    }),
    "",
    "Output format — return ONLY valid JSON, no prose, no markdown fences:",
    '{ "fills": [{ "shapeId": "<id>", "text": "<content>" }, ...], "notes"?: "<speaker notes>" }',
  ].join("\n");
}

export function slotFillUserPrompt(args: {
  outline: Outline;
  index: number;
  item: OutlineItem;
  guidance: GuidanceInput;
  slotsBlock: string;
}): string {
  const { outline, index, item, guidance, slotsBlock } = args;
  return [
    `Presentation: ${outline.title}`,
    outline.subtitle ? `Subtitle: ${outline.subtitle}` : "",
    `Output language: ${guidance.language ?? "match topic"}`,
    `Audience: ${guidance.audience ?? "general"}`,
    guidance.goals ? `Goals: ${guidance.goals}` : "",
    guidance.extraNotes ? `User requirements: ${guidance.extraNotes}` : "",
    "",
    `slideIdx=${index} (0-based):`,
    `  Title: ${item.title}`,
    item.layoutHint ? `  layout: ${item.layoutHint}` : "",
    item.bullets?.length ? `  Content hints: ${item.bullets.map((b) => `- ${b}`).join("; ")}` : "",
    item.notes ? `  Speaker notes hint: ${item.notes}` : "",
    "",
    slotsBlock,
  ]
    .filter(Boolean)
    .join("\n");
}

// ============================================================================
// Theme generator prompt：AI 直接产出一份完整的视觉主题 spec（调色板 + 字体 +
// 背景渐变 + 装饰），用来替代 5 套硬编码的内置主题，让生成结果更具设计感。
//
// 关键约束：
//   - 颜色必须是 #rrggbb（schema 也强校验，省去半成功的"红色文本写成 'red'"）。
//   - 字体只能选给定白名单的 family（保证浏览器能加载且商用授权 ok）。
//   - bg vs text 对比度需要"明显可读"，模型自己判断（生成对比度太低时下一轮 chat 会自然纠正）。
// ============================================================================

export interface ThemeGuidance {
  topic?: string;
  audience?: string;
  scenario?: string;
  styleHint?: string;
  mode?: "light" | "dark" | "auto";
  language?: string;
  /** 风格族 id（ppt_style_systems），用于 theme 阶段的 skill 小节路由（roadmap L2）。 */
  styleFamily?: string;
}

/**
 * 调色板原型库：给 LLM 的"起点菜单"。每次生成从中掷一枚"方向骰子"（见
 * generateTheme 的 varietyHint），显著提升 run-to-run 的调性差异 —— 否则模型
 * 十次里有八次收敛到"紫蓝 SaaS 渐变"。原型只约束氛围，不约束具体 hex。
 */
export const THEME_PALETTE_ARCHETYPES: ReadonlyArray<{ id: string; hint: string }> = [
  { id: "ink-and-ember", hint: "near-black ink bg, single ember-orange accent, warm off-white text — brutalist editorial" },
  { id: "deep-sea-neon", hint: "abyssal navy/teal bg, electric cyan hero accent, magenta support — launch keynote" },
  { id: "gallery-white", hint: "warm gallery white bg, one saturated primary accent (Klein blue / vermilion), near-black text — Swiss poster" },
  { id: "moss-and-cream", hint: "cream paper bg, deep moss/forest accent, terracotta support — organic premium" },
  { id: "violet-hour", hint: "dusk indigo bg, violet-to-hot-pink accent range — cinematic consumer" },
  { id: "graphite-acid", hint: "graphite charcoal bg, acid lime/chartreuse accent — developer / data" },
  { id: "porcelain-indigo", hint: "porcelain light bg with cool tint, imperial indigo accent, gold support — heritage / east-asian" },
  { id: "sandstone-noir", hint: "warm sandstone light bg, espresso text, burnt sienna accent — luxury print" },
  { id: "arctic-signal", hint: "ice-white/pale-blue bg, signal red accent, steel supports — precision engineering" },
  { id: "midnight-gold", hint: "true midnight bg, champagne gold accent, muted sage support — award ceremony" },
];

export function themeSystemPrompt(host?: HostSkillStore, styleFamily?: string): string {
  const fontList = THEME_FONT_FAMILIES.map((f) => `"${f}"`).join(", ");
  const archetypes = THEME_PALETTE_ARCHETYPES.map((a) => `    - ${a.id}: ${a.hint}`).join("\n");
  return [
    "You are an award-winning art director designing the visual identity for ONE presentation.",
    "Your task: design ONE original, distinctive visual theme — a complete palette, background, font pairing, and decoration choice. The bar is 'this looks like a studio branded it', not 'a default template'.",
    "",
    "Art direction rules:",
    "- COMMIT to a point of view. One hero accent (accent1) carries the presentation; accent2 complements it (adjacent OR deliberately clashing — pick one strategy); accent3/4 stay quiet and desaturated.",
    "- Light mode: bg is a TINTED near-white (warm paper / cool porcelain / mint-washed — never plain #ffffff); text near-black with strong contrast (WCAG AA at least).",
    "- Dark mode: bg is deep but rich (ink navy / espresso charcoal / abyssal green — never pure #000); accents electric enough to glow against it.",
    `- Palette archetypes — treat as starting points, pick the one that fits the brief best (or hybridize two):\n${archetypes}`,
    "- FORBIDDEN unless the brief demands them: default purple-blue SaaS gradient (#6366f1-family), Office blue #0070c0, muddy beige, unsaturated grey-on-grey. These read as 'no designer showed up'.",
    "- Background: dark/launch themes want a gradient with intent — pick an off-axis angle (110-160 or 200-250) and let accent1 enter from ONE corner only; light themes prefer solid tinted bg or a whisper-subtle 2-stop gradient.",
    "- Typography: pair a characterful display/serif title with a clean sans body (editorial), or one family at two extreme weights (tech monolith). Title and body from the SAME generic family with similar weights is a wasted pairing.",
    "- For Chinese topics, prefer fonts whose `language` includes cjk; mixing CJK title + sans body is fine.",
    "- If Style hint is provided, it is the PRIMARY creative brief — palette and decoration must visibly express it; the archetype menu becomes secondary.",
    "",
    ...getEnabledSkillFragments({ stage: "theme", host, ...(styleFamily ? { styleFamily } : {}) }),
    "",
    `Allowed font family values (use EXACTLY one of these strings, no synonyms): ${fontList}`,
    "",
    "Output format — return ONLY this exact JSON shape, no prose, no markdown fences:",
    "{",
    '  "name": "<short creative theme name>",',
    '  "description": "<one-line vibe summary in the user\'s language>",',
    '  "mode": "light" | "dark",',
    '  "palette": {',
    '    "bg": "#rrggbb",         // slide background base color (used by solid; gradient stops may override visually)',
    '    "bgAlt": "#rrggbb",      // secondary surface (cards, callouts)',
    '    "text": "#rrggbb",       // body text, MUST have strong contrast vs bg',
    '    "textMuted": "#rrggbb",  // secondary text',
    '    "accent1": "#rrggbb",    // primary brand / hero color',
    '    "accent2": "#rrggbb",    // complementary',
    '    "accent3": "#rrggbb",    // supporting',
    '    "accent4": "#rrggbb",    // supporting',
    '    "divider": "#rrggbb"     // separator lines',
    "  },",
    '  "background": {',
    '    "kind": "solid" | "linear" | "radial",',
    '    "angle": <0..360, ONLY when kind=linear, 0=left→right, 90=top→bottom>,',
    '    "stops": [ { "offset": 0..1, "color": "#rrggbb", "alpha"?: 0..1 }, ... ]   // ONLY when kind in [linear,radial]; 2-5 stops',
    "  },",
    '  "fonts": {',
    '    "title": "<one of the allowed family names>",',
    '    "body":  "<one of the allowed family names>",',
    '    "mono":  "<optional, one of the allowed family names>"',
    "  },",
    '  "decoration": "aurora" | "tech-bracket" | "neon-burst" | "authority" | "manuscript" | "ink-thread" | "organic-blobs" | "sunrise-arc" | "masthead" | "terminal" | "confetti" | "gilded" | "ink-wash" | "none",',
    '  "layout": "classic" | "centered" | "editorial" | "terminal"   // OPTIONAL — slide GEOMETRY family; omit for classic',
    "}",
    "",
    "CRITICAL:",
    "- All colors MUST be lowercase 6-digit hex with leading #, e.g. \"#0a0a0f\". No \"red\", no \"rgb()\", no 3-digit shortcuts.",
    '- "background.kind=solid" → omit angle/stops. "linear" → REQUIRE angle and stops. "radial" → REQUIRE stops (no angle).',
    "- Decoration is a DELIBERATE design decision, not a default. Rules:",
    "    * \"none\" is a strong, professional choice — prefer it whenever the presentation is corporate / data-heavy / minimal, or when the palette already carries the identity.",
    "    * Glow-type decorations (aurora / neon-burst / sunrise-arc) are LOUD: only pick one when the presentation is explicitly a launch / nightlife / high-energy brand moment. Never pick them out of habit.",
    "    * Structural decorations are quieter and fit more presentations: engineering → tech-bracket; corporate → authority; academic → manuscript; minimal → ink-thread; magazine/editorial → masthead; geeky/dev → terminal; luxury/brand → gilded; Chinese ink/literary → ink-wash; nature → organic-blobs; playful/education → confetti.",
    "    * Vary across runs: if the vibe is ambiguous between two options, pick the QUIETER one.",
    "- Pick layout to match the vibe and pair it with the decoration: editorial/luxury/literary → editorial (often with masthead/gilded/ink-wash); creative/playful → centered (often with neon-burst/confetti); geeky/dev → terminal (with terminal decoration); everything else → omit (classic).",
  ].join("\n");
}

export function themeUserPrompt(g: ThemeGuidance): string {
  const lines: string[] = ["Please design a visual theme with these constraints:"];
  if (g.topic) lines.push(`Topic: ${g.topic}`);
  if (g.audience) lines.push(`Audience: ${g.audience}`);
  if (g.scenario) lines.push(`Scenario: ${g.scenario}`);
  if (g.mode && g.mode !== "auto") lines.push(`Mode: must be ${g.mode}`);
  const hint = g.styleHint ?? undefined;
  if (hint) lines.push(`Style hint (PRIMARY creative brief): ${hint}`);
  if (g.language) lines.push(`Description language: ${g.language}`);
  lines.push("");
  lines.push(
    hint
      ? "The style hint above is mandatory — palette, gradient, and decoration must clearly express that mood."
      : "Design freely — surprise me with something more striking than a stock corporate theme.",
  );
  return lines.join("\n");
}

// ============================================================================
// Motion scheme generator prompt：AI 产出一份完整 motion scheme（基线 bundle +
// 角色覆盖 + 节奏 + 页间过渡），让动画语言跟主题的设计语言同步。
//
// 关键设计：
//   - schema 中只允许覆盖 9 个最有视觉影响力的角色，避免大 schema 翻车；
//   - 接收 theme 摘要（mode / accent / decoration / vibe）作为上下文，使 motion
//     与 theme 风格联动（dark+霓虹 → cinematic；极简+米色 → editorial 微动）；
//   - 基线 bundle 必须从 4 个里挑（minimal / cinematic / editorial / playful），
//     未指定时模型会迷路 —— 强制让它先确定"在哪种基调上加料"。
// ============================================================================

export interface MotionGuidance {
  topic?: string;
  audience?: string;
  scenario?: string;
  styleHint?: string;
  language?: string;
  /** 当前 theme 的浓缩摘要（generateAndApplyTheme 把 GeneratedThemeSpec 折叠后传入）。 */
  themeContext?: ThemeContextForMotion;
}

export interface ThemeContextForMotion {
  name?: string;
  description?: string;
  mode?: "light" | "dark";
  accentVibe?: string; // 自由文本，eg "neon cyan + purple, electric"
  decoration?: GeneratedThemeSpec["decoration"];
}

export function motionSystemPrompt(): string {
  const effects = MAINSTREAM_EFFECT_LIST.map((e) => `"${e}"`).join(", ");
  const bundles = MOTION_BUNDLE_IDS.map((id) => {
    const b = MOTION_BUNDLES[id];
    return `  - "${id}": ${b.description}`;
  }).join("\n");
  const roles = MOTION_SCHEME_CONFIGURABLE_ROLES.map((r) => `"${r}"`).join(", ");
  return [
    "You are a senior motion designer for presentations.",
    "Your task: design ONE motion scheme that matches the presentation's visual theme — a base bundle + per-role tweaks + a slide-to-slide transition + a pace.",
    "",
    "Design principles (mainstream UX motion, distilled from ui-ux-pro-max styles.csv 'Effects & Animation'):",
    "- Restraint: animate only the most visually important roles; let basedOn bundle handle the rest.",
    "- Duration: 250-500ms for snappy presentations; 500-700ms for cinematic / hero moments. Never <150ms or >900ms.",
    "- Hierarchy: title first → body → image. Use bigger movement on the highlight element, fade for the rest.",
    "- Coherence: pick a slide transition that matches the bundle's vibe.",
    "    * cut       → technical / data-dense (no transition).",
    "    * fade      → universal, calm, keynote, editorial.",
    "    * push / cover → energetic, brand, consumer.",
    "    * morph     → visually continuous slides where shared elements move.",
    "    * cube / pageCurl / flip / doors → showcase / cinematic; only when theme is bold.",
    "- paceMultiplier: 0.85 (snappy editorial), 1.0 (default), 1.2 (cinematic). Don't go below 0.6 or above 1.5.",
    "",
    "Base bundles (choose ONE as `basedOn`, then patch via `rolesOverride`):",
    bundles,
    "",
    `Allowed effects for any role: ${effects}`,
    `Roles you may override (everything else inherits from basedOn): ${roles}`,
    "",
    "Output format — return ONLY this exact JSON shape, no prose, no markdown fences:",
    "{",
    '  "name": "<short creative scheme name>",',
    '  "description": "<one-line vibe summary in user\'s language>",',
    '  "basedOn": "minimal" | "cinematic" | "editorial" | "playful",',
    '  "paceMultiplier": 0.6..1.5,',
    '  "rolesOverride": {',
    '    "cover-title"?:    { "effect": "<one of allowed>", "durationMs"?: 100..900, "gapMs"?: 0..1000 },',
    '    "cover-subtitle"?: { ... },',
    '    "section-title"?:  { ... },',
    '    "page-title"?:     { ... },',
    '    "bullets"?:        { ... },',
    '    "body"?:           { ... },',
    '    "quote-text"?:     { ... },',
    '    "image"?:          { ... },',
    '    "chart"?:          { ... },',
    '    "stat-value"?:     { ... },',
    '    "closing-title"?:  { ... }',
    "  },",
    '  "slideTransition": {',
    '    "kind": "cut" | "fade" | "push" | "cover" | "uncover" | "wipe" | "split" | "zoom" | "morph" | "cube" | "flip" | "pageCurl" | "doors" | "circle" | "ripple",',
    '    "durationSec": 0..2',
    "  }",
    "}",
    "",
    "CRITICAL:",
    '- `rolesOverride` MUST be an object; if you have nothing to override, emit `{}` — NOT null / missing.',
    '- `effect` MUST be one of the allowed names — no synonyms (no "slideIn", no "appear-from-bottom").',
    '- `slideTransition` is REQUIRED; use `{"kind":"cut","durationSec":0}` when you want no transition.',
    '- Override ONLY roles where you actually want a non-baseline behavior. Empty rolesOverride is great if basedOn already fits.',
  ].join("\n");
}

function themeContextLines(t: ThemeContextForMotion): string[] {
  const lines: string[] = [];
  if (t.name) lines.push(`Theme name: ${t.name}`);
  if (t.description) lines.push(`Theme vibe: ${t.description}`);
  if (t.mode) lines.push(`Theme mode: ${t.mode}`);
  if (t.accentVibe) lines.push(`Palette accent vibe: ${t.accentVibe}`);
  if (t.decoration) lines.push(`Theme decoration: ${t.decoration}`);
  return lines;
}

export function motionUserPrompt(g: MotionGuidance): string {
  const lines: string[] = ["Please design a motion scheme matching these constraints:"];
  if (g.topic) lines.push(`Topic: ${g.topic}`);
  if (g.audience) lines.push(`Audience: ${g.audience}`);
  if (g.scenario) lines.push(`Scenario: ${g.scenario}`);
  if (g.styleHint) lines.push(`Style hint: ${g.styleHint}`);
  if (g.language) lines.push(`Description language: ${g.language}`);
  if (g.themeContext) {
    lines.push("");
    lines.push("Current theme context (motion should harmonize with these):");
    for (const line of themeContextLines(g.themeContext)) lines.push(`  ${line}`);
  }
  lines.push("");
  lines.push("Pick a basedOn bundle that fits this vibe, then add overrides where it elevates the presentation. Don't over-customize.");
  return lines.join("\n");
}

