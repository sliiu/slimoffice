// image-text 版式占位符：编译时只有 imageQuery 会生成 "Image placeholder" rect +
// "Image hint" 文字（🖼 keywords）。本模块负责把它们替换成真实 ImageShape。
//
// 用于：
//   - generate pipeline 的 enrichImagesInPresentation（有 spec 时从 imageQuery 拉任务）
//   - 对话 fillImagePlaceholders 工具 + playground 回合结束后的静默补全（扫 IR）

import type { ImageShape, Presentation, Rect, Slide, TextParagraph, TextRun } from "@ppt/core";
import { identityTransform } from "@ppt/core";
import { AddShapeCmd, DeleteShapeCmd } from "@ppt/editor/commands";
import type { AiConfig } from "../../config/types";
import type { SlideSpecZ } from "../schema";
import type { ImageEnrichmentPriority } from "./fetch-enrichment-image";
import {
  DEFAULT_IMAGE_ENRICHMENT_PRIORITY,
  fetchEnrichmentImageDataUrl,
  imageEnrichmentAvailable,
  type ImagePromptContext,
} from "./fetch-enrichment-image";
import { genId, makeImageShape } from "../../tools/helpers/images";
import type { DocumentPort } from "../../kernel/port";

export const IMAGE_PLACEHOLDER_NAME = "Image placeholder";
export const IMAGE_HINT_NAME = "Image hint";
const HINT_PREFIX = "🖼";

export interface InlinePlaceholderSlot {
  bbox: Rect;
  query: string;
  placeholderShapeId: string;
  hintShapeId?: string;
  /** 占位 rect 的动画单元标记，需要原样传给替换进来的真实图片。 */
  animUnit?: string;
}

/** 从 "Image hint" 文本 shape 解析英文关键词。 */
export function parseImageHintQuery(shape: Slide["layers"][0]["shapes"][number]): string | null {
  if (shape.kind !== "text" || shape.name !== IMAGE_HINT_NAME) return null;
  const raw =
    shape.paragraphs
      .flatMap((p: TextParagraph) => p.runs.map((r: TextRun) => r.text))
      .join("")
      .trim();
  if (!raw.startsWith(HINT_PREFIX)) return null;
  const q = raw.slice(HINT_PREFIX.length).trim();
  return q.length >= 2 ? q : null;
}

/** 在已编译 slide 上定位 image-text 占位（无 spec 时靠 hint 文案）。 */
export function findInlineImagePlaceholder(slide: Slide): InlinePlaceholderSlot | null {
  const layer = slide.layers[0];
  if (!layer) return null;
  const ph = layer.shapes.find((s) => s.kind === "rect" && s.name === IMAGE_PLACEHOLDER_NAME);
  if (!ph || ph.kind !== "rect") return null;
  const hint = layer.shapes.find((s) => s.name === IMAGE_HINT_NAME);
  const query = hint ? parseImageHintQuery(hint) : null;
  if (!query) return null;
  return {
    bbox: { ...ph.bbox },
    query,
    placeholderShapeId: ph.id,
    ...(hint ? { hintShapeId: hint.id } : {}),
    ...(ph.animUnit ? { animUnit: ph.animUnit } : {}),
  };
}

/** 是否已有真实配图（非占位）。 */
export function slideHasInlineImage(slide: Slide): boolean {
  const layer = slide.layers[0];
  if (!layer) return false;
  return layer.shapes.some((s) => s.kind === "image" && s.name === "Image");
}

function makeInlineImageShape(
  bbox: Rect,
  src: string,
  natural: { w: number; h: number },
  animUnit?: string,
): ImageShape {
  const shape = makeImageShape({
    id: genId("sp_img"),
    name: "Image",
    bbox,
    src,
    natural,
  });
  // 继承占位 rect 的单元标记，否则真实图片会和 "Image frame" 错位框拆成两拍。
  if (animUnit) shape.animUnit = animUnit;
  return shape;
}

/**
 * 直接改 IR（generate 阶段 enrich 用，不走 CommandStack）。
 * 返回是否成功替换。
 */
export function replaceInlinePlaceholderOnSlide(
  slide: Slide,
  dataUrl: string,
  natural: { w: number; h: number },
): boolean {
  const slot = findInlineImagePlaceholder(slide);
  if (!slot) return false;
  const layer = slide.layers[0];
  if (!layer) return false;

  const removeIds = new Set([slot.placeholderShapeId, ...(slot.hintShapeId ? [slot.hintShapeId] : [])]);
  const insertAt = layer.shapes.findIndex((s) => s.id === slot.placeholderShapeId);
  if (insertAt < 0) return false;

  layer.shapes = layer.shapes.filter((s) => !removeIds.has(s.id));
  const img = makeInlineImageShape(slot.bbox, dataUrl, natural, slot.animUnit);
  const at = Math.min(insertAt, layer.shapes.length);
  layer.shapes.splice(at, 0, img);
  return true;
}

export interface FillPlaceholdersResult {
  filled: number;
  skipped: number;
  /** 无 stock key、无占位、拉取失败等 */
  details: Array<{ slideIdx: number; query: string; ok: boolean; reason?: string }>;
}

async function fillOneSlot(
  query: string,
  config: AiConfig,
  signal: AbortSignal | undefined,
  stockTimeoutMs: number,
  priority: ImageEnrichmentPriority,
  extra: {
    targetAspect?: number;
    usedUrls?: Set<string>;
    promptContext?: ImagePromptContext;
    aiGate?: { aiPaused: boolean; reason?: string };
  } = {},
): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const hit = await fetchEnrichmentImageDataUrl(query, config, {
      kind: "inline",
      priority,
      signal,
      stockTimeoutMs,
      ...(extra.targetAspect !== undefined ? { targetAspect: extra.targetAspect } : {}),
      ...(extra.usedUrls ? { usedUrls: extra.usedUrls } : {}),
      ...(extra.promptContext ? { promptContext: extra.promptContext } : {}),
      ...(extra.aiGate ? { aiGate: extra.aiGate } : {}),
    });
    return hit;
  } catch {
    return null;
  }
}

function slotAspect(bbox: Rect): number | undefined {
  return bbox.h > 0 ? bbox.w / bbox.h : undefined;
}

/** 从 slide 上提取标题文本（name 含 "title" 的 text shape 首个非空段），无 spec 路径的内容锚点。 */
function extractSlideTitleText(slide: Slide): string | undefined {
  for (const layer of slide.layers) {
    for (const sh of layer.shapes) {
      if (sh.kind !== "text") continue;
      if (!/title/i.test(sh.name ?? "")) continue;
      const paragraphs = (sh as { paragraphs?: TextParagraph[] }).paragraphs ?? [];
      const text = paragraphs
        .map((p) => p.runs.map((r: TextRun) => r.text).join(""))
        .join(" ")
        .trim();
      if (text) return text.slice(0, 80);
    }
  }
  return undefined;
}

/**
 * 把一页 spec 的实际内容压缩成一句摘要（≤220 字符），喂给内容配图（hero/inline）
 * 的 AI 生图 prompt —— 让模型画"这一页讲的东西"，而不是从 3-7 词 query 里猜。
 */
export function slideContentDigest(s: SlideSpecZ | undefined, maxLen = 220): string | undefined {
  if (!s) return undefined;
  const x = s as Record<string, unknown>;
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const parts: string[] = [];
  parts.push(...(arr(x.bullets) as string[]));
  parts.push(...(arr(x.leftBullets) as string[]));
  parts.push(...(arr(x.rightBullets) as string[]));
  parts.push(
    ...arr(x.cards).map((c) => {
      const cc = c as { title?: string; body?: string };
      return [cc.title, cc.body].filter(Boolean).join(": ");
    }),
  );
  parts.push(
    ...arr(x.steps)
      .map((st) => ((st as { title?: string }).title ?? (st as { label?: string }).label) as string)
      .filter(Boolean),
  );
  parts.push(...arr(x.metrics).map((m) => `${(m as { value?: string }).value ?? ""} ${(m as { label?: string }).label ?? ""}`.trim()));
  parts.push(...arr(x.items).map((it) => (it as { label?: string }).label as string).filter(Boolean));
  if (typeof x.body === "string") parts.push(x.body);
  if (typeof x.quote === "string") parts.push(x.quote);
  if (typeof x.value === "string") parts.push(`${x.value} ${typeof x.label === "string" ? x.label : ""}`.trim());
  const joined = parts.filter(Boolean).join("; ").trim();
  if (!joined) return undefined;
  return joined.length > maxLen ? `${joined.slice(0, maxLen)}…` : joined;
}

export interface InlineImageTask {
  slideIdx: number;
  query: string;
  /** 本页标题 / 内容摘要：AI 生图内容锚定（stock 路径不消费）。 */
  slideTitle?: string;
  slideContent?: string;
}

/** 从 spec + pres 收集待补 inline 图任务（跳过已有 Image 的页）。 */
export function collectInlineImageTasks(
  pres: Presentation,
  specSlides: ReadonlyArray<SlideSpecZ>,
): InlineImageTask[] {
  const tasks: InlineImageTask[] = [];
  specSlides.forEach((s, i) => {
    if (s.kind !== "image-text") return;
    const q = (s as { imageQuery?: string; imageSrc?: string }).imageQuery?.trim();
    if (!q) return;
    const slide = pres.slides[i];
    if (!slide || slideHasInlineImage(slide)) return;
    if (!findInlineImagePlaceholder(slide)) return;
    const title = ((s as { title?: string }).title ?? "").trim();
    const digest = slideContentDigest(s);
    tasks.push({
      slideIdx: i,
      query: q,
      ...(title ? { slideTitle: title } : {}),
      ...(digest ? { slideContent: digest } : {}),
    });
  });
  return tasks;
}

/** 无 spec：扫描所有 slide 上的占位 hint。 */
export function collectInlinePlaceholderTasksFromPres(pres: Presentation): Array<{ slideIdx: number; query: string }> {
  const tasks: Array<{ slideIdx: number; query: string }> = [];
  pres.slides.forEach((slide, slideIdx) => {
    if (slideHasInlineImage(slide)) return;
    const slot = findInlineImagePlaceholder(slide);
    if (slot) tasks.push({ slideIdx, query: slot.query });
  });
  return tasks;
}

export interface FillPlaceholdersOptions {
  config: AiConfig;
  imageEnrichmentPriority?: ImageEnrichmentPriority;
  signal?: AbortSignal;
  perImageTimeoutMs?: number;
  /** 限定某些 slide；缺省则处理全部任务。 */
  slideIndices?: ReadonlyArray<number>;
  /** deck 级去重集合（与 bg/hero 共享），避免同篇重复照片。 */
  usedUrls?: Set<string>;
  /** 主题 / 风格上下文，透传给 AI 生图 prompt。 */
  promptContext?: ImagePromptContext;
  /** 与 enrichImagesInPresentation 共享的 AI 熔断门闩。 */
  aiGate?: { aiPaused: boolean; reason?: string };
}

/**
 * 对话 / 宿主：用 CommandStack 替换占位符（可 undo）。
 */
export async function fillImagePlaceholdersViaCommands(
  port: DocumentPort,
  opts: FillPlaceholdersOptions,
): Promise<FillPlaceholdersResult> {
  const hasSource = imageEnrichmentAvailable(opts.config);
  if (!hasSource) {
    return {
      filled: 0,
      skipped: 0,
      details: [{ slideIdx: -1, query: "", ok: false, reason: "no_image_sources" }],
    };
  }

  const pres = port.getPres();
  let tasks = collectInlinePlaceholderTasksFromPres(pres);
  if (opts.slideIndices?.length) {
    const allow = new Set(opts.slideIndices);
    tasks = tasks.filter((t) => allow.has(t.slideIdx));
  }

  const priority = opts.imageEnrichmentPriority ?? DEFAULT_IMAGE_ENRICHMENT_PRIORITY;
  const timeoutMs = opts.perImageTimeoutMs ?? 8000;
  const details: FillPlaceholdersResult["details"] = [];
  let filled = 0;
  let skipped = 0;

  for (const task of tasks) {
    if (opts.signal?.aborted) break;
    const slide = pres.slides[task.slideIdx];
    if (!slide) {
      skipped += 1;
      details.push({ slideIdx: task.slideIdx, query: task.query, ok: false, reason: "no_slide" });
      continue;
    }
    const slot = findInlineImagePlaceholder(slide);
    if (!slot) {
      skipped += 1;
      details.push({ slideIdx: task.slideIdx, query: task.query, ok: false, reason: "no_placeholder" });
      continue;
    }

    // 无 spec（对话/宿主路径）：从 slide 上的标题 shape 提取本页标题作内容锚点。
    const slideTitle = extractSlideTitleText(slide);
    const promptContext = {
      ...(opts.promptContext ?? {}),
      ...(slideTitle ? { slideTitle } : {}),
    };
    const fetched = await fillOneSlot(task.query, opts.config, opts.signal, timeoutMs, priority, {
      ...(slotAspect(slot.bbox) !== undefined ? { targetAspect: slotAspect(slot.bbox) } : {}),
      ...(opts.usedUrls ? { usedUrls: opts.usedUrls } : {}),
      promptContext,
      ...(opts.aiGate ? { aiGate: opts.aiGate } : {}),
    });
    if (!fetched) {
      skipped += 1;
      details.push({ slideIdx: task.slideIdx, query: task.query, ok: false, reason: "fetch_failed" });
      continue;
    }

    try {
      if (slot.hintShapeId) port.execute(new DeleteShapeCmd(task.slideIdx, slot.hintShapeId));
      port.execute(new DeleteShapeCmd(task.slideIdx, slot.placeholderShapeId));
      const img = makeInlineImageShape(slot.bbox, fetched.dataUrl, { w: fetched.w, h: fetched.h }, slot.animUnit);
      port.execute(new AddShapeCmd(task.slideIdx, 0, img));
      filled += 1;
      details.push({ slideIdx: task.slideIdx, query: task.query, ok: true });
    } catch (e) {
      skipped += 1;
      details.push({
        slideIdx: task.slideIdx,
        query: task.query,
        ok: false,
        reason: (e as Error).message,
      });
    }
  }

  if (filled > 0) port.notifyMutated();
  return { filled, skipped, details };
}

/**
 * generate enrich：批量拉 stock 图并写回 pres IR。
 */
export async function fillInlinePlaceholdersInPresentation(
  pres: Presentation,
  tasks: ReadonlyArray<InlineImageTask>,
  opts: FillPlaceholdersOptions,
): Promise<{ filled: number; skipped: number }> {
  if (!imageEnrichmentAvailable(opts.config) || tasks.length === 0) return { filled: 0, skipped: 0 };

  const priority = opts.imageEnrichmentPriority ?? DEFAULT_IMAGE_ENRICHMENT_PRIORITY;
  const timeoutMs = opts.perImageTimeoutMs ?? 8000;
  let filled = 0;
  let skipped = 0;

  for (const task of tasks) {
    if (opts.signal?.aborted) break;
    const slide = pres.slides[task.slideIdx];
    if (!slide) {
      skipped += 1;
      continue;
    }
    const slot = findInlineImagePlaceholder(slide);
    // 内容配图：任务级 slideTitle/slideContent 合入 deck 级 promptContext。
    const promptContext = {
      ...(opts.promptContext ?? {}),
      ...(task.slideTitle ? { slideTitle: task.slideTitle } : {}),
      ...(task.slideContent ? { slideContent: task.slideContent } : {}),
    };
    const fetched = await fillOneSlot(task.query, opts.config, opts.signal, timeoutMs, priority, {
      ...(opts.usedUrls ? { usedUrls: opts.usedUrls } : {}),
      promptContext,
      ...(opts.aiGate ? { aiGate: opts.aiGate } : {}),
      ...(slot && slotAspect(slot.bbox) !== undefined ? { targetAspect: slotAspect(slot.bbox)! } : {}),
    });
    if (!fetched || !replaceInlinePlaceholderOnSlide(slide, fetched.dataUrl, { w: fetched.w, h: fetched.h })) {
      skipped += 1;
      continue;
    }
    filled += 1;
  }
  return { filled, skipped };
}
