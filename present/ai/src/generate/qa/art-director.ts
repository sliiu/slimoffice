// "艺术总监"二次评审 pass（roadmap #7）。
//
// 定位：deterministic QA（qa/validate.ts）只能修「机械问题」——对比度、z-order、出血。
// 但一篇 deck 好不好看，还有很多**判断型**问题（层级不清、配色单调、留白失衡、某关键页
// 缺主视觉、标题措辞弱、版式重复）——这些需要一个"设计眼"。本模块用一次轻量 LLM 调用
// 读整篇 deck 的紧凑摘要，产出：
//   1. 一份结构化评审报告（overall + score + 逐条 finding），供宿主 UI 展示或回喂重生成；
//   2. 一小撮**安全**的自动修复（当前仅 recolorText）——每条都会在 applier 里重新校验对比度，
//      永远不会把文字改得更不可读；不安全 / 不确定的一律跳过。
//
// 设计约束（与 validate.ts 一脉相承）：
//   - **默认开启**（GenerateOptions.enableArtDirector !== false）；显式 false 可关以省调用。
//   - **非阻断**：任何失败都不影响已生成的 deck（调用方 try/catch）。
//   - **保守**：自动修复只做"确定变好或至少不变差"的动作；判断型问题只报告、不乱改。
//     generate.ts 另有 enableArtDirectorRetry：对高严重度页换 layout 单页重生成。

import { generateText, type LanguageModel } from "ai";
import { z } from "zod";
import type { Paint, Presentation, Shape, TextShape } from "@ppt/core";
import { withGenerateJsonSlot, isTimeoutLlmError, LLM_TIMEOUT } from "../../llm/limit";
import { extractLlmUsage, type LlmUsage } from "../../llm/usage";
import { throwIfAborted } from "../abort";
import { contrastRatio, parseHex, WCAG_BODY_TEXT_CONTRAST, WCAG_LARGE_TEXT_CONTRAST } from "./color";
import { effectiveBackdropForText, effectiveRunColor } from "./validate";

// ---------------------------------------------------------------------------
// 报告 / 编辑 schema
// ---------------------------------------------------------------------------

export const ArtDirectorFindingSchema = z.object({
  slideIdx: z.number().int().min(0),
  severity: z.enum(["high", "medium", "low"]),
  category: z.enum([
    "hierarchy",
    "color",
    "density",
    "imagery",
    "consistency",
    "whitespace",
    "typography",
    "other",
  ]),
  issue: z.string().describe("What specifically looks off on this slide."),
  suggestion: z.string().describe("Concrete, actionable fix (a human or a follow-up chat turn can apply)."),
});
export type ArtDirectorFinding = z.infer<typeof ArtDirectorFindingSchema>;

/** 受限的安全自动修复：只 recolorText（applier 会再校验对比度）。 */
export const ArtDirectorEditSchema = z.object({
  op: z.literal("recolorText"),
  slideIdx: z.number().int().min(0),
  shapeId: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  why: z.string().optional(),
});
export type ArtDirectorEdit = z.infer<typeof ArtDirectorEditSchema>;

export const ArtDirectorReportSchema = z.object({
  overall: z.string().describe("One-paragraph art-director critique of the whole deck."),
  score: z.number().min(1).max(10).describe("Overall visual quality 1-10."),
  findings: z.array(ArtDirectorFindingSchema).max(24),
  edits: z.array(ArtDirectorEditSchema).max(24).optional(),
});
export type ArtDirectorReport = z.infer<typeof ArtDirectorReportSchema>;

export interface ReviewResult extends ArtDirectorReport {
  /** 实际应用的安全修复数。 */
  applied: number;
  /** 被 applier 拒绝（对比度不达标 / shape 不存在 / 底色未知）的修复数。 */
  skipped: number;
}

// ---------------------------------------------------------------------------
// 紧凑 deck 摘要（喂给 LLM，控制 token）
// ---------------------------------------------------------------------------

function paintMainColor(p: Paint | undefined): string | null {
  if (!p) return null;
  switch (p.kind) {
    case "solid":
      return p.color ?? null;
    case "linear":
    case "radial": {
      const stops = p.stops ?? [];
      const mid = stops.find((s) => s.offset >= 0.5) ?? stops[Math.floor(stops.length / 2)] ?? stops[0];
      return mid?.color ?? null;
    }
    default:
      // image / pattern / none / groupFill → 底色不确定
      return null;
  }
}

function firstRun(t: TextShape): { color?: string; fontSize?: number } {
  for (const para of t.paragraphs) {
    for (const run of para.runs) {
      if (run.text && run.text.length > 0) return { color: effectiveRunColor(run), fontSize: run.fontSize };
    }
  }
  return {};
}

function shapeText(t: TextShape): string {
  return t.paragraphs
    .map((p) => p.runs.map((r) => r.text).join(""))
    .join(" ")
    .trim()
    .slice(0, 90);
}

/** Text rows per slide in the reviewer summary; beyond this the slide reports `textsOmitted`. */
const MAX_SUMMARY_TEXTS = 24;

/** Tables (cell-text groups with `tableMeta`) and charts on a slide, in reviewer-readable form. */
function summarizeCarriers(shapes: Shape[]): { tables?: unknown[]; charts?: unknown[] } {
  const tables: unknown[] = [];
  const charts: unknown[] = [];
  for (const s of shapes) {
    if (s.kind === "group" && s.tableMeta) {
      const cells = s.children.filter((c): c is TextShape => c.kind === "text");
      const cols = Math.max(1, s.tableMeta.cols);
      const cellText = (r: number, c: number) => {
        const cell = cells[r * cols + c];
        return cell ? shapeText(cell) : "";
      };
      const rows = s.tableMeta.rows;
      tables.push({
        shapeId: s.id,
        rows: rows - 1,
        cols,
        headers: Array.from({ length: cols }, (_, c) => cellText(0, c)),
        firstColumn: Array.from({ length: Math.max(0, rows - 1) }, (_, r) => cellText(r + 1, 0)),
        cellFontSize: firstRun(cells[cols] ?? cells[0]!).fontSize,
      });
    } else if (s.kind === "chart") {
      const def = s.chart;
      charts.push({
        shapeId: s.id,
        type: def.type,
        ...("categories" in def && def.categories ? { categories: def.categories } : {}),
        series: def.series.map((se) => ({ name: se.name ?? "", values: se.values })),
        showValues: def.showValues ?? false,
      });
    }
  }
  return { ...(tables.length ? { tables } : {}), ...(charts.length ? { charts } : {}) };
}

export function summarizeDeck(pres: Presentation): unknown {
  return {
    size: pres.size,
    slideCount: pres.slides.length,
    slides: pres.slides.map((slide, idx) => {
      const shapes = slide.layers.flatMap((l) => l.shapes);
      const texts = shapes.filter((s): s is TextShape => s.kind === "text");
      const bg = slide.background;
      const presThemeBg = pres.theme?.colors?.["bg1"] ?? pres.theme?.colors?.["bg"];
      const scrim = bg?.kind === "image" && shapes.some((s) => /overlay|scrim/i.test(s.name ?? "") && s.visible);
      return {
        slideIdx: idx,
        name: slide.name,
        background: { kind: bg?.kind ?? "default", color: paintMainColor(bg), ...(bg?.kind === "image" ? { scrim } : {}) },
        hasImage: shapes.some((s) => s.kind === "image") || (bg?.kind === "image" && Boolean(bg.src)),
        shapeCount: shapes.length,
        // Every text, not the first 8: a compare page with 2×(title + 4 points) has 11, and a
        // truncated list made the reviewer report the right column as "unfinished".
        texts: texts.slice(0, MAX_SUMMARY_TEXTS).map((t) => {
          const f = firstRun(t);
          const backdrop = effectiveBackdropForText(slide, t, presThemeBg);
          return {
            shapeId: t.id,
            role: t.name,
            text: shapeText(t),
            color: f.color,
            fontSize: f.fontSize,
            // What the text actually sits on (band / sidebar / card fill beats the slide field).
            ...(backdrop ? { on: backdrop.on } : {}),
          };
        }),
        ...(texts.length > MAX_SUMMARY_TEXTS ? { textsOmitted: texts.length - MAX_SUMMARY_TEXTS } : {}),
        // Tables are groups of cell texts and charts are opaque objects — neither shows up in
        // `texts`, and a reviewer that cannot see them reports a six-row compare table as an
        // empty page. Give it headers / first column / series so it can judge the content.
        ...summarizeCarriers(shapes),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// 安全 applier：只应用"确定不变差"的 recolorText
// ---------------------------------------------------------------------------

function findTextShape(pres: Presentation, slideIdx: number, shapeId: string): TextShape | null {
  const slide = pres.slides[slideIdx];
  if (!slide) return null;
  for (const layer of slide.layers) {
    for (const sh of layer.shapes) {
      if (sh.id === shapeId && sh.kind === "text") return sh;
    }
  }
  return null;
}

function recolorAllRuns(t: TextShape, color: string): void {
  for (const para of t.paragraphs) {
    for (const run of para.runs) {
      // Hollow art type keeps its outline treatment; only the stroke colour moves.
      if ((run.color === "transparent" || run.color === "none") && run.textOutline?.paint.kind === "solid") {
        run.textOutline = { ...run.textOutline, paint: { kind: "solid", color } };
        continue;
      }
      if (run.fill && run.fill.kind !== "solid") delete run.fill;
      run.color = color;
    }
  }
}

/**
 * 应用一批 recolorText 修复。每条都做门槛校验，任一不满足即跳过：
 *   - shape 存在且为 text；
 *   - 目标 slide 底色可判定（solid/gradient）——图片/none 底色不确定，宁可不改；
 *   - 新颜色相对底色对比度达标（title/大字 ≥3.0，正文 ≥4.5）——绝不改出更差的可读性。
 */
export function applyArtDirectorEdits(
  pres: Presentation,
  edits: readonly ArtDirectorEdit[],
): { applied: number; skipped: number } {
  let applied = 0;
  let skipped = 0;
  for (const edit of edits) {
    const t = findTextShape(pres, edit.slideIdx, edit.shapeId);
    const slide = pres.slides[edit.slideIdx];
    if (!t || !slide) {
      skipped += 1;
      continue;
    }
    // Validate against what the text sits on (band / card fill), not only the slide field.
    const backdrop = effectiveBackdropForText(slide, t, pres.theme?.colors?.["bg1"] ?? pres.theme?.colors?.["bg"]);
    const bgColor = backdrop && backdrop.on !== "image" ? parseHex(backdrop.on) : parseHex(paintMainColor(slide.background) ?? undefined);
    const newColor = parseHex(edit.color);
    if (!bgColor || !newColor) {
      skipped += 1;
      continue;
    }
    const fontSize = firstRun(t).fontSize ?? 18;
    const min = fontSize >= 28 ? WCAG_LARGE_TEXT_CONTRAST : WCAG_BODY_TEXT_CONTRAST;
    if (contrastRatio(newColor, bgColor) < min) {
      skipped += 1;
      continue;
    }
    recolorAllRuns(t, edit.color);
    applied += 1;
  }
  return { applied, skipped };
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

function reviewLanguageLabel(code: string): string {
  const c = code.trim().toLowerCase();
  if (c === "zh" || c.startsWith("zh-")) return "Simplified Chinese (简体中文)";
  if (c === "en" || c.startsWith("en")) return "English";
  return code.trim();
}

function samplePresentationText(pres: Presentation, maxChars = 400): string {
  const parts: string[] = [];
  for (const slide of pres.slides) {
    for (const layer of slide.layers) {
      for (const shape of layer.shapes) {
        if (shape.kind !== "text") continue;
        const t = shapeText(shape);
        if (!t) continue;
        parts.push(t);
        if (parts.join(" ").length >= maxChars) return parts.join(" ");
      }
    }
  }
  return parts.join(" ");
}

/** Resolve the language art-director prose should use (overall / issue / suggestion / why). */
export function resolveReviewLanguage(args: {
  language?: string;
  pres?: Presentation;
  uiLocale?: string;
}): string {
  const explicit = args.language?.trim();
  if (explicit) return explicit;
  const locale = args.uiLocale?.trim();
  if (locale) {
    if (locale.toLowerCase().startsWith("zh")) return "zh";
    if (locale.toLowerCase().startsWith("en")) return "en";
  }
  if (args.pres) {
    const sample = samplePresentationText(args.pres);
    if (sample) return /[\u4e00-\u9fff]/.test(sample) ? "zh" : "en";
  }
  return "en";
}

const SYSTEM_PROMPT = [
  "You are a meticulous art director reviewing an already-generated presentation (represented as a compact JSON summary).",
  "Judge it the way a senior designer would: visual hierarchy, color harmony & restraint, whitespace balance, content density, imagery usage, and consistency across slides.",
  "If screenshots are attached, they are the ground truth for overlap, margin, contrast, and empty space — trust the pixels over the JSON.",
  "Reading the summary: each text carries `on` = the hex it actually sits on (a band / sidebar / card fill when one is behind it, else the slide field; `image` = photo with no scrim). Judge text contrast against `on`, not against the slide background. `background.scrim: true` means the photo already carries a darkening gradient — do not ask for one.",
  "`tables` (headers, firstColumn, rows) and `charts` (type, categories, series values, showValues) list the native carriers on the slide — their cells are NOT repeated in `texts`. A slide with few `texts` but a 6-row table or a chart is not empty; judge whether the carrier does the job.",
  "Be specific and reference slideIdx (0-based). Findings must be actionable (say WHAT to change, not just 'improve it').",
  "",
  "You MAY also propose a small number of SAFE auto-fixes in `edits` — currently ONLY `recolorText` (change a text shape's color for better hierarchy/harmony).",
  "Rules for edits:",
  "- Only recolor when the current color clearly hurts hierarchy or clashes; do not recolor for the sake of it.",
  "- The system re-validates every edit for WCAG contrast against the slide background and DROPS any that would reduce readability, so never propose a color you're unsure reads well.",
  "- Reference a real shapeId + slideIdx from the summary. color must be #rrggbb.",
  "- Prefer using the presentation's existing accent/text colors over inventing new hues.",
  "",
  "Return ONLY JSON, no prose, no markdown fences.",
].join("\n");

function buildUserPrompt(
  deckSummary: unknown,
  ctx: {
    language: string;
    topic?: string;
    styleFamily?: string;
    imageryUnavailable?: boolean;
    screenshots?: Array<{ slideIdx: number }>;
  },
): string {
  const lines: string[] = [];
  lines.push(
    `HARD: Write overall, every issue, every suggestion, and any edit why in ${reviewLanguageLabel(ctx.language)}. Keep severity and category as the exact English enum tokens (high|medium|low, hierarchy|color|…).`,
  );
  if (ctx.topic) lines.push(`Topic: ${ctx.topic}`);
  if (ctx.styleFamily) lines.push(`Intended visual style family: ${ctx.styleFamily}`);
  if (ctx.imageryUnavailable) {
    lines.push(
      "CONSTRAINT: Photo/AI image enrichment FAILED this run (quota or missing keys). Do NOT lower the score for missing photos, empty backgrounds, or lack of cinematic imagery. Do NOT suggest adding photos. Judge gradients, decorations, typography, contrast, hierarchy, and layout variety only.",
    );
  }
  lines.push("Summary (JSON):");
  lines.push(JSON.stringify(deckSummary));
  if (ctx.screenshots?.length) {
    lines.push("");
    lines.push(
      `Screenshots attached in order: ${ctx.screenshots.map((s) => `slideIdx=${s.slideIdx}`).join(", ")}. Use them to judge overlap, margins, and contrast.`,
    );
  }
  lines.push("");
  lines.push(
    'Emit JSON: { "overall": string, "score": 1-10, "findings": [{ "slideIdx", "severity": high|medium|low, "category": hierarchy|color|density|imagery|consistency|whitespace|typography|other, "issue", "suggestion" }], "edits"?: [{ "op": "recolorText", "slideIdx", "shapeId", "color": "#rrggbb", "why"? }] }',
  );
  return lines.join("\n");
}

function stripFences(text: string): string {
  const t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fence?.[1] ?? t).trim();
}

export interface ReviewOptions {
  model: LanguageModel;
  signal?: AbortSignal;
  /** Prose language for overall / findings / edit why. Defaults from uiLocale or deck text. */
  language?: string;
  /** UI locale fallback when language is omitted (e.g. editor getLocale()). */
  uiLocale?: string;
  topic?: string;
  styleFamily?: string;
  /**
   * 本轮配图不可用（额度熔断 / 未配置图源且 AI 失败）。
   * 为 true 时：不要因缺照片扣分，也不要建议加图；改评渐变 / 装饰 / 排版。
   */
  imageryUnavailable?: boolean;
  /**
   * 验收 rubric（roadmap L4）：当前启用 skill 的 checklist + code 侧硬约束，渲染成一段
   * 显式检查项文本。传入时艺术总监按"这套 skill 自己的验收标准"打分，而非通用 prompt。
   */
  rubric?: string;
  /** 是否应用安全自动修复（recolorText）。默认 true。false = 纯 advisory。 */
  applyEdits?: boolean;
  screenshots?: Array<{ slideIdx: number; dataUrl: string }>;
  onUsage?: (usage: LlmUsage) => void;
}

/**
 * 对已生成的 Presentation 跑一次艺术总监评审。默认会应用安全的 recolorText 修复（原地 mutate pres）。
 * 失败时抛错 —— 调用方（generateFromOutline）用 try/catch 兜住，保证非阻断。
 */
export async function reviewPresentation(pres: Presentation, opts: ReviewOptions): Promise<ReviewResult> {
  const summary = summarizeDeck(pres);
  const shots = opts.screenshots ?? [];
  const language = resolveReviewLanguage({
    ...(opts.language ? { language: opts.language } : {}),
    ...(opts.uiLocale ? { uiLocale: opts.uiLocale } : {}),
    pres,
  });
  const prompt = buildUserPrompt(summary, {
    language,
    ...(opts.topic ? { topic: opts.topic } : {}),
    ...(opts.styleFamily ? { styleFamily: opts.styleFamily } : {}),
    ...(opts.imageryUnavailable ? { imageryUnavailable: true } : {}),
    ...(shots.length ? { screenshots: shots.map((s) => ({ slideIdx: s.slideIdx })) } : {}),
  });

  // rubric（L4）：把"当前启用 skill 的验收标准 + code 硬约束"拼进 system，让评审对齐这套规则。
  const rubricBlock = opts.rubric?.trim()
    ? [
        "",
        "ACCEPTANCE RUBRIC — score and find issues specifically against these rules (from the active skills and hard constraints):",
        opts.rubric.trim(),
      ].join("\n")
    : "";
  const baseSystem = `${SYSTEM_PROMPT}${rubricBlock}`;

  const runOnce = async (extra?: string, useImages = true): Promise<ArtDirectorReport> => {
    throwIfAborted(opts.signal);
    const imageParts = useImages ? shots.map((s) => ({ type: "image" as const, image: s.dataUrl })) : [];
    const llmResult = await withGenerateJsonSlot(() =>
      generateText({
        model: opts.model,
        system: extra ? `${baseSystem}\n\n${extra}` : baseSystem,
        ...(imageParts.length
          ? {
              messages: [
                {
                  role: "user" as const,
                  content: [{ type: "text" as const, text: prompt }, ...imageParts],
                },
              ],
            }
          : { prompt }),
        ...(opts.signal ? { abortSignal: opts.signal } : {}),
        timeout: LLM_TIMEOUT,
        maxRetries: 0,
      }),
    );
    const usage = extractLlmUsage(llmResult);
    if (usage) opts.onUsage?.(usage);
    const parsed = JSON.parse(stripFences(llmResult.text)) as unknown;
    return ArtDirectorReportSchema.parse(parsed);
  };

  let report: ArtDirectorReport;
  try {
    report = await runOnce();
  } catch (e) {
    if (opts.signal?.aborted || isTimeoutLlmError(e)) throw e;
    report = await runOnce(
      `Previous attempt failed: ${(e as Error).message}. Re-emit valid JSON matching the schema exactly.`,
      false,
    );
  }

  throwIfAborted(opts.signal);
  let applied = 0;
  let skipped = 0;
  if (opts.applyEdits !== false && report.edits?.length) {
    const r = applyArtDirectorEdits(pres, report.edits);
    applied = r.applied;
    skipped = r.skipped;
  }
  return { ...report, applied, skipped };
}
