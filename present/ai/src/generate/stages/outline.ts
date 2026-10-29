// 阶段：DesignSpec 预决策 + 大纲生成。
//
// 两段式向导的第一步：产出 Outline 供用户编辑，再进 slides 阶段。

import type { LanguageModel } from "ai";
import { createLlm } from "../../llm/client";
import type { GuidanceInput, Outline, OutlineLayoutHint, OutlineThemeId } from "../schema";
import {
  inferStyleFamilyFromGuidance,
  clampOutlineToStyleFamily,
  diversifyOutlineLayouts,
  OutlineSchema,
  bannedLayoutsForFamily,
} from "../schema";
import { THEMES } from "../../themes";
import type { HostSkillStore } from "../../skills/types";
import { getEnabledSkillFragments, getKnownStyleFamilyIds } from "../../skills/registry";
import {
  buildDesignSpecSchema,
  clampDesignSpec,
  designSpecSystemPrompt,
  designSpecUserPrompt,
  type DesignSpec,
} from "../design-spec";
import { outlineSystemPrompt, outlineUserPrompt } from "../prompts";
import { sampleDensityRule, sampleOutlineRule } from "../sample-composition";
import {
  assignTemplateLayouts,
  layoutsFromTemplate,
  resolveVisualSource,
  templateOutlineSystemPrompt,
} from "../template-fill";
import type { ModelFilePart } from "../../source-files/complete";
import { responsesAuth, type ResponsesAuth } from "../../source-files/support";
import type { Template } from "@ppt/core";
import { generateSpecJson } from "../aliases";
import { ensureConfig, type GenerateOptions } from "../types";
import { UPGRADE_FROM_BULLETS } from "../qa/ensure-spec-quality";
import { rethrowIfAborted, throwIfAborted, withGenerateWallClock } from "../abort";
import type { LlmUsage } from "../../llm/usage";

function normalizeOutlineTheme(outline: Outline, guidance: GuidanceInput): Outline {
  let themeId = outline.themeId;
  if (String(themeId).toLowerCase() === "ai") themeId = "ai";
  if (guidance.themeId === "ai") themeId = "ai";
  else if (guidance.themeId && THEMES[guidance.themeId]) themeId = guidance.themeId as OutlineThemeId;
  return themeId === outline.themeId ? outline : { ...outline, themeId };
}

const TEXT_HEAVY_HINTS = new Set<string>(["bullets", "content"]);
const STRUCTURAL_HINTS = new Set<OutlineLayoutHint>(["cover", "hero", "closing", "section"]);
const CHART_TYPES = new Set(["column", "bar", "line", "area", "pie", "doughnut"]);

function pipeCells(line: string): string[] {
  return line.split(/\s*\|\s*/).map((s) => s.trim()).filter((s) => s.length > 0);
}

function looksNumeric(s: string): boolean {
  return /-?\d+(?:\.\d+)?/.test(s.replace(/[,$\s%万亿]/g, ""));
}

function inferLayoutFromBullets(
  item: Outline["slides"][number],
  index: number,
  total: number,
): OutlineLayoutHint {
  const hint = item.layoutHint;
  if (index === 0 && (!hint || TEXT_HEAVY_HINTS.has(hint))) return "cover";
  if (index === total - 1 && (!hint || TEXT_HEAVY_HINTS.has(hint))) return "closing";
  if (hint && STRUCTURAL_HINTS.has(hint)) return hint;

  const bullets = item.bullets ?? [];
  const first = (bullets[0] ?? "").trim();
  if (CHART_TYPES.has(first.toLowerCase()) && bullets.length >= 2) return "chart";
  if (first && /\|\||\s+vs\.?\s+|\s+对\s+/i.test(first) && bullets.length >= 2) return "comparison";

  const pairwise =
    bullets.length >= 2 &&
    bullets.every((b) => {
      const parts = b.split(/[|：:]/).map((s) => s.trim());
      return parts.length === 2 && looksNumeric(parts[0]!);
    });
  if (pairwise) return "metrics";

  const piped = bullets.filter((b) => pipeCells(b).length >= 3);
  if (piped.length >= 2) {
    const numericRows = piped.slice(1).filter((b) => pipeCells(b).slice(1).every(looksNumeric));
    return numericRows.length >= 1 ? "chart" : "table";
  }

  if (hint && hint !== "bullets" && hint !== "content") return hint;

  const colonCards =
    bullets.length >= 2 &&
    bullets.every((b) => /[:：—-]/.test(b) && b.length <= 80);
  if (colonCards) return "cards";

  const stepped =
    bullets.length >= 3 &&
    bullets.every((b) => /^\s*(\d+|[Qq]\d|20\d{2}|第)/.test(b) || /→|->/.test(b));
  if (stepped) return "process";

  return hint ?? "bullets";
}

export function assignLayoutsFromContent(outline: Outline): Outline {
  const total = outline.slides.length;
  let changed = false;
  const slides = outline.slides.map((item, i) => {
    // Respect explicit editor/harness layoutHint — only infer when missing.
    if (item.layoutHint) return item;
    const next = inferLayoutFromBullets(item, i, total);
    if (next === "bullets") return item;
    changed = true;
    return { ...item, layoutHint: next };
  });
  return changed ? { ...outline, slides } : outline;
}

/**
 * 大纲级版式节奏兜底（确定性，不调 LLM）：
 * 弱模型常无视 prompt 的「不超过 2 页连续 bullets」，导致用户在大纲预览里就看到
 * 满屏 bullets。这里与 slide 阶段的 ensureSlideSpecQuality 用**同一套升级轮换**
 * （UPGRADE_FROM_BULLETS），把连续 text-heavy 的第 2 页起改写成 cards/banner/…，
 * 让大纲预览所见即所得；slide 阶段的兜底继续兜「用户手动改回去」的情况。
 * 首尾页不动（opener/closer 语义交给 ensureSlideSpecQuality）。
 */
export function ensureOutlineLayoutRhythm(outline: Outline, guidance: GuidanceInput): Outline {
  if (outline.slides.length < 3) return outline;
  const banned = new Set(bannedLayoutsForFamily(guidance.styleFamily));
  const upgrades = UPGRADE_FROM_BULLETS.filter((k) => !banned.has(k));
  if (upgrades.length === 0) return outline;
  const hintOf = (i: number): string => outline.slides[i]?.layoutHint ?? "bullets";
  const slides = outline.slides.map((s) => ({ ...s }));
  let idx = 0;
  let changed = false;
  for (let i = 1; i < slides.length - 1; i++) {
    if (!TEXT_HEAVY_HINTS.has(hintOf(i)) || !TEXT_HEAVY_HINTS.has(hintOf(i - 1))) continue;
    slides[i] = { ...slides[i]!, layoutHint: upgrades[idx % upgrades.length]! };
    idx += 1;
    changed = true;
  }
  return changed ? { ...outline, slides } : outline;
}

export function clampOutlineSlideCount(outline: Outline, count: number | undefined): Outline {
  if (count == null || !Number.isFinite(count)) return outline;
  const target = Math.min(40, Math.max(1, Math.round(count)));
  const slides = outline.slides.map((s) => ({ ...s }));
  if (slides.length === target) return outline;

  while (slides.length > target) {
    if (slides.length <= 2) {
      slides.pop();
      continue;
    }
    const inner = slides.slice(1, -1);
    const sectionAt = inner.findIndex((s) => s.layoutHint === "section");
    const drop = sectionAt >= 0 ? sectionAt + 1 : 1 + Math.floor((inner.length - 1) / 2);
    slides.splice(drop, 1);
  }

  while (slides.length < target) {
    let best = -1;
    let bestN = 1;
    for (let i = 0; i < slides.length; i++) {
      const hint = slides[i]?.layoutHint;
      if (hint === "cover" || hint === "hero" || hint === "closing") continue;
      const n = slides[i]?.bullets?.length ?? 0;
      if (n > bestN) {
        bestN = n;
        best = i;
      }
    }
    if (best >= 0) {
      const src = slides[best]!;
      const bullets = src.bullets ?? [];
      const mid = Math.max(1, Math.ceil(bullets.length / 2));
      slides[best] = { ...src, bullets: bullets.slice(0, mid) };
      slides.splice(best + 1, 0, {
        title: src.title,
        layoutHint: src.layoutHint,
        bullets: bullets.slice(mid).length ? bullets.slice(mid) : [src.title],
      });
      continue;
    }
    const insertAt = slides.length > 1 ? slides.length - 1 : slides.length;
    const prev = slides[Math.max(0, insertAt - 1)] ?? slides[0];
    slides.splice(insertAt, 0, {
      title: prev?.title ?? outline.title,
      layoutHint: "content",
      bullets: prev?.bullets?.slice() ?? [outline.title],
    });
  }

  return { ...outline, slides };
}

function clip(s: string | undefined, n: number): string | undefined {
  if (s == null) return s;
  const t = s.trim();
  return t.length > n ? t.slice(0, n) : t;
}

function compactOutline(outline: Outline): Outline {
  return {
    ...outline,
    title: clip(outline.title, 48) ?? outline.title,
    ...(outline.subtitle ? { subtitle: clip(outline.subtitle, 80) } : {}),
    slides: outline.slides.map((s) => ({
      ...s,
      title: clip(s.title, 32) ?? s.title,
      ...(s.bullets ? { bullets: s.bullets.slice(0, 8).map((b) => clip(b, 100) ?? b) } : {}),
      ...(s.imageIdea ? { imageIdea: clip(s.imageIdea, 80) } : {}),
      ...(s.notes ? { notes: clip(s.notes, 160) } : {}),
    })),
  };
}

/**
 * The outline is a short JSON (≤ 12 rows). A provider stall here used to eat the whole
 * 8-minute step budget with nothing to show; give it 3 minutes and one clean retry instead
 * (worst case 6 min, still under the default step budget).
 */
export const OUTLINE_TIMING = { timeoutMs: 3 * 60 * 1000, retryOnTimeout: 1 } as const;

export async function callOutline(
  model: LanguageModel,
  guidance: GuidanceInput,
  signal: AbortSignal | undefined,
  systemExtra: string | undefined,
  host?: HostSkillStore,
  lockLayouts = true,
  onUsage?: (usage: LlmUsage) => void,
  sources?: {
    template?: Template;
    files?: ModelFilePart[];
    responses?: ResponsesAuth;
    sample?: string;
    density?: string;
  },
): Promise<Outline> {
  const choices = sources?.template ? layoutsFromTemplate(sources.template) : [];
  const system = [
    choices.length
      ? templateOutlineSystemPrompt(choices, guidance, host)
      : outlineSystemPrompt(host, guidance.styleFamily || undefined, guidance.themeId),
    systemExtra?.trim(),
    choices.length && sources?.density ? sampleDensityRule(sources.density) : "",
    !choices.length && sources?.sample ? sampleOutlineRule(sources.sample) : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const outline = await generateSpecJson(
    model,
    OutlineSchema,
    system,
    outlineUserPrompt(guidance),
    signal,
    undefined,
    onUsage,
    OUTLINE_TIMING,
    sources?.files?.length ? { files: sources.files, ...(sources.responses ? { responses: sources.responses } : {}) } : undefined,
  );
  const compact = normalizeOutlineTheme(compactOutline(outline), guidance);
  const counted = clampOutlineSlideCount(assignLayoutsFromContent(compact), guidance.slideCount);
  if (choices.length) return assignTemplateLayouts(counted, choices);
  if (!lockLayouts) return counted;
  const { outline: clamped } = clampOutlineToStyleFamily(counted, guidance.styleFamily);
  return diversifyOutlineLayouts(clamped, guidance.styleFamily).outline;
}

export async function callDesignSpec(
  model: LanguageModel,
  guidance: GuidanceInput,
  signal: AbortSignal | undefined,
  host?: HostSkillStore,
  onUsage?: (usage: LlmUsage) => void,
): Promise<DesignSpec> {
  // 复用 outline 阶段的 skill 片段（含设计决策类小节；按 styleFamily 路由）。
  const fragments = getEnabledSkillFragments({
    stage: "outline",
    ...(host ? { host } : {}),
    ...(guidance.styleFamily ? { styleFamily: guidance.styleFamily } : {}),
  });
  const system = designSpecSystemPrompt(fragments, host);
  const schema = buildDesignSpecSchema(getKnownStyleFamilyIds(host));
  const raw = await generateSpecJson(
    model,
    schema,
    system,
    designSpecUserPrompt(guidance),
    signal,
    undefined,
    onUsage,
    OUTLINE_TIMING,
  );
  return clampDesignSpec(raw, guidance);
}

/**
 * 把冻结的 DesignSpec 应用到 guidance：
 *   - auto（未显式选族）时定死 styleFamily，驱动下游 clamp / enrich / rubric；
 *   - 仅当 applyDesignSpecTheme 开启、用户未显式选主题、且 spec 选的是内置主题（非 ai）时
 *     覆盖 themeId —— 不抢用户显式选择、不落 compile 默认。
 */
export function applyDesignSpecToGuidance(
  guidance: GuidanceInput,
  spec: DesignSpec,
  opts: GenerateOptions,
): { guidance: GuidanceInput; themeApplied: boolean } {
  let g = guidance;
  if (!g.styleFamily) g = { ...g, styleFamily: spec.styleFamily };
  let themeApplied = false;
  if (
    opts.applyDesignSpecTheme &&
    !opts.themeOverride &&
    !g.themeId &&
    spec.themeId !== "ai" &&
    THEMES[spec.themeId]
  ) {
    g = { ...g, themeId: spec.themeId };
    themeApplied = true;
  }
  return { guidance: g, themeApplied };
}

/**
 * styleFamily=auto 的小节路由兜底：用户没选族、DesignSpec 也没定族时，
 * 按 guidance 文本里的强指向 cue（"瑞士"/"发布会"/"dashboard"…）确定性推断。
 */
export function resolveAutoStyleFamily(g: GuidanceInput, opts: GenerateOptions): GuidanceInput {
  if (g.styleFamily) return g;
  const inferred = inferStyleFamilyFromGuidance(g);
  if (!inferred) return g;
  if (opts.debug) console.info(`[ai] style family auto-inferred from brief cues: ${inferred}`);
  return { ...g, styleFamily: inferred };
}

/** 仅生成大纲（"两段式"中第一步预览）。 */
export async function generateOutline(guidance: GuidanceInput, opts: GenerateOptions = {}): Promise<Outline> {
  return withGenerateWallClock(opts, (bound) => generateOutlineBound(guidance, bound));
}

async function generateOutlineBound(guidance: GuidanceInput, opts: GenerateOptions): Promise<Outline> {
  const config = ensureConfig(opts.config);
  const { model } = createLlm(config.text);
  // ----- 设计规格预决策：在 outline 之前先定死风格族 / 主题，让 outline 本身自洽；
  // spec 通过 onDesignSpec 回调上抛给"设计规格卡"，确认后由调用方冻结前递给
  // generateFromOutline（opts.designSpec）。已传冻结 spec 时直接应用。失败非阻断。
  let g = guidance;
  const visual = resolveVisualSource(opts.layoutTemplate, opts.sampleComposition);
  const templateBound = visual.fillPlaceholders && Boolean(opts.layoutTemplate);
  const sampleBound = Boolean(visual.composition);
  if (templateBound || sampleBound) {
    // 版式模板已经定了视觉。设计规格会再选一套视觉系统。
  } else if (opts.designSpec) {
    g = applyDesignSpecToGuidance(guidance, opts.designSpec, opts).guidance;
  } else if (opts.enableDesignSpec) {
    try {
      opts.onProgress?.({ stage: "outline", progress: 0.02, detailKey: "designSpec.drafting" });
      const spec = await callDesignSpec(model, guidance, opts.signal, opts.hostSkillStore, opts.onLlmUsage);
      opts.onDesignSpec?.(spec);
      opts.onProgress?.({ stage: "outline", progress: 0.08, detailKey: "designSpec.ready" });
      g = applyDesignSpecToGuidance(guidance, spec, opts).guidance;
    } catch (e) {
      rethrowIfAborted(opts.signal, e);
      if (opts.debug) console.warn("[ai] design spec pass (outline) failed (non-fatal):", e);
    }
  }
  g = resolveAutoStyleFamily(g, opts);

  throwIfAborted(opts.signal);
  opts.onProgress?.({ stage: "outline", progress: 0.1, detailKey: "outline.drafting" });
  const outline = await callOutline(
    model,
    g,
    opts.signal,
    config.text.systemPrefix,
    opts.hostSkillStore,
    config.lockLayouts,
    opts.onLlmUsage,
    {
      ...(templateBound && opts.layoutTemplate ? { template: opts.layoutTemplate } : {}),
      ...(visual.composition ? { sample: visual.composition } : {}),
      ...(visual.density ? { density: visual.density } : {}),
      ...(opts.sourceFiles?.length
        ? { files: opts.sourceFiles, responses: responsesAuth(config.text) }
        : {}),
    },
  );
  opts.onProgress?.({
    stage: "outline",
    progress: 1,
    detailKey: "outline.ready",
    detailParams: { n: outline.slides.length },
  });
  return outline;
}
