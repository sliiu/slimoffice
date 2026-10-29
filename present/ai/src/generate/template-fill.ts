// 版式模板：大纲只使用模板里已有的版式，内容写进占位符。不走自由画布。

import {
  applyInitialEntranceState,
  computeInitialEntranceState,
  createSlideFromMaster,
  type Presentation,
  type Shape,
  type SlideLayout,
  type SlideMaster,
  type Template,
  type TextShape,
} from "@ppt/core";
import { autoAnimatePresentation } from "../animations";
import { speechPlanFromOutlineItem } from "./reveal-order";
import type { Outline, OutlineItem, OutlineLayoutHint } from "./schema";
import type { GenerateOptions } from "./types";
import { COPY_VOICE_BLOCK } from "./copy-voice";
import { getEnabledSkillFragments } from "../skills/registry";
import type { HostSkillStore } from "../skills/types";
import { guidanceHardConstraints } from "./prompts";
import { validateAndRepairPresentation } from "./qa/validate";
import type { GuidanceInput } from "./schema";

export interface TemplateLayoutChoice {
  id: string;
  name: string;
  type: string;
  /** 占位符 type，按版式里的顺序，可重复（双栏两个 body）。 */
  placeholders: string[];
}

export function layoutsFromMasters(masters: readonly SlideMaster[] | undefined): TemplateLayoutChoice[] {
  const master = masters?.[0];
  if (!master) return [];
  return (master.layouts ?? []).map((layout) => ({
    id: layout.id,
    name: layout.name || layout.type || layout.id,
    type: layout.type || "",
    placeholders: placeholderTypes(layout),
  }));
}

export function layoutsFromTemplate(template: Template): TemplateLayoutChoice[] {
  return layoutsFromMasters(template.masters);
}

export function templateUsesPlaceholders(template: Template): boolean {
  return layoutsFromTemplate(template).some((choice) => choice.placeholders.length > 0);
}

export interface ResolvedVisualSource {
  /** 成稿填占位符，不走自由画布。 */
  fillPlaceholders: boolean;
  /** 没有任何文字占位符时，整页构图。和 fillPlaceholders 互斥。 */
  composition?: string;
  /** 有文字占位符时，大纲只跟疏密。 */
  density?: string;
}

/**
 * 有文字占位符就填占位符，页上构图只留下疏密。
 * 没有文字占位符、但记下了页上构图时，整页走自由画布。
 * 没有构图说明时，仍按版式模板填（含只有母版、没有幻灯片的上传）。
 */
export function resolveVisualSource(template?: Template, looseComposition?: string): ResolvedVisualSource {
  const text = template?.composition?.trim() || looseComposition?.trim() || undefined;
  const usesPlaceholders = Boolean(template && templateUsesPlaceholders(template));
  if (template && (usesPlaceholders || !text)) {
    return { fillPlaceholders: true, ...(usesPlaceholders && text ? { density: text } : {}) };
  }
  if (text) return { fillPlaceholders: false, composition: text };
  return { fillPlaceholders: false };
}

function placeholderTypes(layout: SlideLayout): string[] {
  const types: string[] = [];
  for (const shape of layout.shapes ?? []) {
    const ph = shape.placeholder?.type;
    if (ph && shape.kind === "text") types.push(ph);
  }
  return types;
}

/** 事实放不下专用版式时，写进带正文占位符的那一版；没有就用文字占位符最多的。 */
export function contentLayout(choices: readonly TemplateLayoutChoice[]): TemplateLayoutChoice | undefined {
  const withBody = choices.filter((c) => c.placeholders.includes("body"));
  if (withBody.length) {
    return withBody.find((c) => c.type === "obj") ?? withBody[0];
  }
  return [...choices].sort((a, b) => b.placeholders.length - a.placeholders.length)[0];
}

export function assignTemplateLayouts(outline: Outline, choices: readonly TemplateLayoutChoice[]): Outline {
  const fallback = contentLayout(choices);
  return {
    ...outline,
    slides: outline.slides.map((item, index) => {
      const picked = pickLayout(item, index, outline.slides.length, choices) ?? fallback;
      return picked ? { ...item, templateLayoutId: picked.id } : item;
    }),
  };
}

function pickLayout(
  item: OutlineItem,
  index: number,
  total: number,
  choices: readonly TemplateLayoutChoice[],
): TemplateLayoutChoice | undefined {
  if (item.templateLayoutId) {
    const exact = choices.find((c) => c.id === item.templateLayoutId && c.placeholders.length > 0);
    if (exact) return exact;
  }
  const hint = item.layoutHint;
  if (index === 0) {
    const title = choices.find((c) => c.type === "title" || c.placeholders.includes("ctrTitle"));
    if (title) return title;
  }
  if (index === total - 1 && total > 1) {
    const closing = choices.find((c) => /clos|end|title/i.test(c.type) && c.type !== "title");
    if (closing && hint === "closing") return closing;
  }
  const hinted = matchHint(hint, choices);
  if (hinted) return hinted;
  return undefined;
}

function matchHint(
  hint: OutlineLayoutHint | undefined,
  choices: readonly TemplateLayoutChoice[],
): TemplateLayoutChoice | undefined {
  if (hint === "section") return choices.find((c) => /section/i.test(c.type));
  if (hint === "chart") return choices.find((c) => /chart/i.test(`${c.type} ${c.name}`));
  if (hint === "table") return choices.find((c) => /table|tbl/i.test(`${c.type} ${c.name}`));
  if (hint === "comparison") return choices.find((c) => c.type === "twoObj" || c.placeholders.filter((p) => p === "body").length >= 2);
  return undefined;
}

export function presentationFromTemplateOutline(template: Template, outline: Outline): Presentation {
  const choices = layoutsFromTemplate(template);
  const assigned = assignTemplateLayouts(outline, choices);
  const masters = template.masters.map((m) => structuredClone(m));
  const slides = assigned.slides.map((item, index) => {
    const choice = choices.find((c) => c.id === item.templateLayoutId) ?? contentLayout(choices);
    const slide = createSlideFromMaster(masters, {
      index,
      name: item.title || `Slide ${index + 1}`,
      ...(choice ? { layoutId: choice.id } : {}),
    });
    if (choice) writePlaceholders(slide, item, choice.placeholders);
    if (item.notes) slide.notes = item.notes;
    return slide;
  });
  return {
    id: `pres_${Date.now().toString(36)}`,
    size: template.size ?? { width: 1280, height: 720 },
    slides,
    masters,
    ...(template.theme ? { theme: structuredClone(template.theme) } : {}),
    ...(template.fonts ? { fonts: template.fonts.map((f) => ({ ...f })) } : {}),
  };
}

function writePlaceholders(slide: Presentation["slides"][number], item: OutlineItem, types: string[]): void {
  const bodyCount = types.filter((t) => t === "body").length;
  const bullets = item.bullets ?? [];
  const subTitleTakesFirst = types.includes("subTitle");
  const bodyBullets = subTitleTakesFirst ? bullets.slice(1) : bullets;
  const chunks = splitEven(bodyBullets, Math.max(1, bodyCount));
  let bodyN = 0;
  for (const shape of slide.layers[0]?.shapes ?? []) {
    if (shape.kind !== "text" || !shape.placeholder) continue;
    const ph = shape.placeholder.type;
    let text: string | undefined;
    if (ph === "title" || ph === "ctrTitle") text = item.title;
    else if (ph === "subTitle") text = bullets[0] ?? "";
    else if (ph === "body") text = chunks[bodyN++] ?? "";
    if (text === undefined) continue;
    setShapePlainText(shape, text);
  }
}

function splitEven(lines: string[], parts: number): string[] {
  if (parts <= 1) return [lines.join("\n")];
  const out: string[] = [];
  const size = Math.ceil(lines.length / parts);
  for (let i = 0; i < parts; i++) out.push(lines.slice(i * size, (i + 1) * size).join("\n"));
  return out;
}

/**
 * 占位符填完之后补对比度，以及框里放不下的字。不挪占位符的位置。
 * 缩排和自由画布走同一套质检。
 */
export function repairTemplateDeck(pres: Presentation): void {
  validateAndRepairPresentation(pres);
}

function setShapePlainText(shape: Shape, text: string): void {
  const ts = shape as TextShape;
  const base = ts.paragraphs?.[0]?.runs?.[0] ?? { text: "" };
  const lines = text.split("\n");
  const written = lines.length ? lines : [""];
  ts.paragraphs = written.map((line) => ({
    runs: [{ ...base, text: line }],
  }));
}

export function templateOutlineSystemPrompt(
  choices: readonly TemplateLayoutChoice[],
  guidance: GuidanceInput,
  host?: HostSkillStore,
): string {
  const catalog = choices
    .map((c) => `- id=${c.id} name=${c.name} type=${c.type || "unspecified"} placeholders=${c.placeholders.join(",") || "none"}`)
    .join("\n");
  return [
    "You write a slide outline as JSON. A layout template is attached.",
    "HARD: every slide's templateLayoutId MUST be one of the ids below. Do not invent a layout the template does not have.",
    "If the material wants a chart, quote, or other page the template lacks, put those facts in bullets on a layout that already exists. Prefer one with a body placeholder.",
    "Do not describe visual systems, scrims, or decoration. The template already has them.",
    "Titles ≤ 24 chars. Bullets are concrete facts, in the order the speaker will say them. When two sources disagree, keep both bullets and start each with [冲突].",
    'Optional `pace`: one "click" or "chain" per spoken point, in bullet order. click waits; chain follows the previous point. The title is always the first click and is not listed. Example ["click","chain","chain"]. Omit when every point waits. Chart is one flag. Table skips the header. Comparison skips `Left || Right`.',
    "Do not copy pictures out of the source files. imageIdea may be empty.",
    guidanceHardConstraints(guidance),
    "Layouts:",
    catalog,
    COPY_VOICE_BLOCK,
    ...getEnabledSkillFragments({ stage: "outline", host }),
    'JSON: {"title":"...","subtitle":"...","themeId":"ai","slides":[{"title":"...","templateLayoutId":"...","bullets":["..."],"pace":["click","chain"],"notes":"..."}]}',
    "No markdown fences.",
  ].join("\n");
}

export function animateTemplateDeck(pres: Presentation, opts: GenerateOptions, outline?: Outline): void {
  if (opts.enableAnimations === false) return;
  autoAnimatePresentation(pres, {
    ...(opts.motionBundle ? { bundle: opts.motionBundle } : {}),
    ...(opts.motionBundleId ? { bundleId: opts.motionBundleId } : {}),
    ...(opts.maxEffectsPerSlide !== undefined ? { maxEffects: opts.maxEffectsPerSlide } : {}),
    ...(outline
      ? {
          revealForSlide: (index) => {
            const item = outline.slides[index];
            return item ? speechPlanFromOutlineItem(item) : undefined;
          },
        }
      : {}),
  });
  for (const slide of pres.slides) {
    applyInitialEntranceState(slide, computeInitialEntranceState(slide));
  }
}
