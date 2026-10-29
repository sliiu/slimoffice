// 阶段：逐页 SlideSpec 生成（常规路径）与参考模板填槽路径。
//
// 并发度限制：一次最多 4 个并发，避免触发 provider 速率限制。
// 任意单页失败时，单独 fallback 到 outlineToFallbackSpec 的逐页规则，
// 整体不会因为一页 JSON 偏差而失败。

import type { LanguageModel } from "ai";
import { z } from "zod";
import type { Presentation, Slide } from "@ppt/core";
import type { GuidanceInput, Outline, SlideSpecZ } from "../schema";
import { SlideSpecSchema } from "../schema";
import type { HostSkillStore } from "../../skills/types";
import { decorationRoleForKind, hashKind, outlineToFallbackSpec, type CompileOptions } from "../compile/compile";
import { renderLayout, type SlideSpec } from "../compile/layouts";
import { buildDecorationShapesShared } from "../../decorations";
import { getTheme } from "../../themes";
import { slideSystemPrompt, slideUserPrompt, slotFillSystemPrompt, slotFillUserPrompt } from "../prompts";
import { generateSpecJson } from "../aliases";
import { ensureSlideSpecQuality } from "../qa/ensure-spec-quality";
import {
  assembleReferencePresentation,
  cloneReferenceSlideWithIdMap,
  fillSlotsByShapeId,
  formatSlotsForPrompt,
  induceReferenceSchemas,
  mapOutlineToReference,
  remapFills,
  remapSlots,
  type ShapeSlotFill,
} from "../template/slots";
import type { PipelineEvent } from "../types";

const SlotFillResultSchema = z.object({
  fills: z
    .array(
      z.object({
        shapeId: z.string().min(1),
        text: z.string(),
      }),
    )
    .min(1),
  notes: z.string().optional(),
});
type SlotFillResult = z.infer<typeof SlotFillResultSchema>;

const CONCURRENCY = 4;

function fallbackSlideSpec(
  outline: Outline,
  item: NonNullable<Outline["slides"][number]>,
): SlideSpecZ {
  const fb = outlineToFallbackSpec(
    {
      title: outline.title,
      ...(outline.subtitle ? { subtitle: outline.subtitle } : {}),
      themeId: outline.themeId,
      slides: [item],
    },
    { injectMissingCover: false },
  );
  return fb.slides[0]!;
}

export async function callSlide(
  model: LanguageModel,
  args: {
    outline: Outline;
    index: number;
    guidance: GuidanceInput;
    systemExtra: string | undefined;
    signal: AbortSignal | undefined;
    host?: HostSkillStore | undefined;
  },
): Promise<SlideSpecZ> {
  const item = args.outline.slides[args.index];
  if (!item) throw new Error(`outline.slides[${args.index}] is missing`);
  const slideCtx: { styleFamily?: string; layoutKinds?: string[] } = {
    ...(args.guidance.styleFamily ? { styleFamily: args.guidance.styleFamily } : {}),
    ...(item.layoutHint ? { layoutKinds: [item.layoutHint] } : {}),
  };
  const system = [slideSystemPrompt(args.host, slideCtx), args.systemExtra?.trim()].filter(Boolean).join("\n\n");
  return generateSpecJson(
    model,
    SlideSpecSchema,
    system,
    slideUserPrompt({
      outline: args.outline,
      index: args.index,
      item,
      guidance: args.guidance,
    }),
    args.signal,
  );
}

async function callSlotFill(
  model: LanguageModel,
  args: {
    outline: Outline;
    index: number;
    guidance: GuidanceInput;
    schema: import("../template/slots").InducedSlideSchema;
    systemExtra: string | undefined;
    signal: AbortSignal | undefined;
    host?: HostSkillStore | undefined;
  },
): Promise<SlotFillResult> {
  const item = args.outline.slides[args.index];
  if (!item) throw new Error(`outline.slides[${args.index}] is missing`);
  const system = [slotFillSystemPrompt(args.host, args.guidance.styleFamily), args.systemExtra?.trim()]
    .filter(Boolean)
    .join("\n\n");
  return generateSpecJson(
    model,
    SlotFillResultSchema,
    system,
    slotFillUserPrompt({
      outline: args.outline,
      index: args.index,
      item,
      guidance: args.guidance,
      slotsBlock: formatSlotsForPrompt(args.schema),
    }),
    args.signal,
  );
}

/** 常规路径：并发逐页生成 SlideSpec；失败页回退 outlineToFallbackSpec。 */
export async function generateSlideSpecs(args: {
  model: LanguageModel;
  outline: Outline;
  guidance: GuidanceInput;
  systemExtra: string | undefined;
  signal: AbortSignal | undefined;
  host?: HostSkillStore | undefined;
  onProgress?: ((p: PipelineEvent) => void) | undefined;
  debug?: boolean | undefined;
  concurrency?: number | undefined;
}): Promise<SlideSpecZ[]> {
  const { outline } = args;
  const total = outline.slides.length;
  const specs: SlideSpecZ[] = new Array(total);
  let done = 0;

  async function runOne(i: number): Promise<void> {
    const slideItem = outline.slides[i];
    const slideTitle = slideItem?.title?.trim() || `Slide ${i + 1}`;
    args.onProgress?.({
      stage: "slide",
      progress: i / total,
      detailKey: "slide.progress",
      detailParams: { current: i + 1, done: i, total, title: slideTitle, pct: Math.round((i / total) * 100) },
    });
    try {
      const spec = await callSlide(args.model, {
        outline,
        index: i,
        guidance: args.guidance,
        systemExtra: args.systemExtra,
        signal: args.signal,
        host: args.host,
      });
      specs[i] = spec;
    } catch (e) {
      if (args.debug) console.warn(`[ai] slide #${i + 1} failed, using fallback`, e);
      specs[i] = fallbackSlideSpec(outline, outline.slides[i]!);
    } finally {
      done += 1;
      args.onProgress?.({
        stage: "slide",
        progress: done / total,
        detailKey: "slide.progress",
        detailParams: {
          current: Math.min(i + 1, total),
          done,
          total,
          title: slideTitle,
          pct: Math.round((done / total) * 100),
        },
      });
    }
  }

  const queue = Array.from({ length: total }, (_, i) => i);
  const workers: Promise<void>[] = [];
  const parallelism = Math.max(1, args.concurrency ?? CONCURRENCY);
  for (let k = 0; k < Math.min(parallelism, total); k++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const i = queue.shift();
          if (i === undefined) return;
          await runOne(i);
        }
      })(),
    );
  }
  await Promise.all(workers);
  return specs;
}

/**
 * 参考模板填槽路径：映射大纲 → clone 参考页 → LLM 填 shapeId → 组装 Presentation。
 * 无槽位 / 映射失败的页回退到 layout compile，再拼进同一 deck。
 */
export async function generateViaReferenceSlots(args: {
  outline: Outline;
  guidance: GuidanceInput;
  reference: Presentation;
  model: LanguageModel;
  systemExtra: string | undefined;
  signal: AbortSignal | undefined;
  host?: HostSkillStore | undefined;
  lengthFactor: number;
  compileOpts: CompileOptions;
  debug?: boolean | undefined;
  onProgress?: ((p: PipelineEvent) => void) | undefined;
  concurrency?: number | undefined;
}): Promise<{
  pres: Presentation;
  specs: SlideSpecZ[];
  filled: number;
  fallback: number;
  /** true = 该页来自参考填槽（保留原图，enrich 应跳过）。 */
  slotFilledMask: boolean[];
}> {
  const schemas = induceReferenceSchemas(args.reference, args.lengthFactor);
  const { refIndices } = mapOutlineToReference(args.outline, schemas);
  if (args.debug) {
    console.info(
      `[ai] reference slots: ${schemas.length} ref slides → map [${refIndices.join(",")}]`,
      schemas.map((s) => s.summary),
    );
  }

  const total = args.outline.slides.length;
  const slides: Slide[] = new Array(total);
  const specs: SlideSpecZ[] = new Array(total);
  const slotFilledMask: boolean[] = new Array(total).fill(false);
  let filled = 0;
  let fallback = 0;
  let done = 0;

  async function runOne(i: number): Promise<void> {
    const item = args.outline.slides[i]!;
    const slideTitle = item.title?.trim() || `Slide ${i + 1}`;
    args.onProgress?.({
      stage: "slide",
      progress: i / total,
      detailKey: "slide.progress",
      detailParams: { current: i + 1, done: i, total, title: slideTitle, pct: Math.round((i / total) * 100) },
    });

    const refIdx = refIndices[i] ?? -1;
    const schema = refIdx >= 0 ? schemas[refIdx] : undefined;
    const refSlide = refIdx >= 0 ? args.reference.slides[refIdx] : undefined;

    if (schema && refSlide && schema.slots.length > 0) {
      try {
        const result = await callSlotFill(args.model, {
          outline: args.outline,
          index: i,
          guidance: args.guidance,
          schema,
          systemExtra: args.systemExtra,
          signal: args.signal,
          host: args.host,
        });
        const { slide, idMap } = cloneReferenceSlideWithIdMap(refSlide, i);
        const fills = remapFills(result.fills as ShapeSlotFill[], idMap);
        const slotMeta = remapSlots(schema.slots, idMap);
        fillSlotsByShapeId(slide, fills, slotMeta);
        if (result.notes?.trim()) slide.notes = result.notes.trim();
        else if (item.notes?.trim()) slide.notes = item.notes.trim();
        slides[i] = slide;
        // QA 节奏用 outline layoutHint；enrich 对本页跳过（mask）。
        const hint = item.layoutHint ?? "content";
        const fb = outlineToFallbackSpec({
          title: args.outline.title,
          themeId: args.outline.themeId,
          slides: [{ title: item.title, layoutHint: hint, bullets: item.bullets, notes: slide.notes }],
        });
        specs[i] = fb.slides[fb.slides.length - 1]!;
        slotFilledMask[i] = true;
        filled += 1;
        done += 1;
        args.onProgress?.({
          stage: "slide",
          progress: done / total,
          detailKey: "slide.progress",
          detailParams: {
            current: Math.min(i + 1, total),
            done,
            total,
            title: slideTitle,
            pct: Math.round((done / total) * 100),
          },
        });
        return;
      } catch (e) {
        if (args.debug) console.warn(`[ai] reference fill #${i + 1} failed, fallback compile`, e);
      }
    }

    // 回退：常规 slide spec → 稍后统一 compile 单页
    try {
      const spec = await callSlide(args.model, {
        outline: args.outline,
        index: i,
        guidance: args.guidance,
        systemExtra: args.systemExtra,
        signal: args.signal,
        host: args.host,
      });
      specs[i] = spec;
    } catch {
      specs[i] = fallbackSlideSpec(args.outline, item);
    }
    fallback += 1;
    done += 1;
    args.onProgress?.({
      stage: "slide",
      progress: done / total,
      detailKey: "slide.progress",
      detailParams: {
        current: Math.min(i + 1, total),
        done,
        total,
        title: slideTitle,
        pct: Math.round((done / total) * 100),
      },
    });
  }

  const queue = Array.from({ length: total }, (_, i) => i);
  const workers: Promise<void>[] = [];
  const parallelism = Math.max(1, args.concurrency ?? CONCURRENCY);
  for (let k = 0; k < Math.min(parallelism, total); k++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const i = queue.shift();
          if (i === undefined) return;
          await runOne(i);
        }
      })(),
    );
  }
  await Promise.all(workers);

  // 仅对 compile 回退页做节奏/配图兜底（填槽页保留参考几何）。
  const fallbackIdxs = slotFilledMask.map((v, i) => (!v && specs[i] ? i : -1)).filter((i) => i >= 0);
  if (fallbackIdxs.length > 0) {
    const subset = fallbackIdxs.map((i) => specs[i]!);
    const ensured = ensureSlideSpecQuality(subset, args.guidance, {
      partial: true,
      imageIdeas: fallbackIdxs.map((i) => args.outline.slides[i]?.imageIdea),
    });
    ensured.specs.forEach((s, j) => {
      specs[fallbackIdxs[j]!] = s;
    });
    if (args.debug && ensured.fixes.length > 0) {
      console.info(`[ai] reference fallback ensure-quality:`, ensured.fixes);
    }
  }

  // 对 fallback 页走 compile，再与填槽页合并
  const theme =
    args.compileOpts.themeOverride ?? getTheme(args.outline.themeId !== "ai" ? args.outline.themeId : "ocean");
  for (let i = 0; i < total; i++) {
    if (slides[i]) continue;
    const spec = specs[i]!;
    const layout = renderLayout(spec as SlideSpec, args.reference.size, theme, {
      ...(args.compileOpts.designSeed !== undefined ? { seed: hashKind(args.compileOpts.designSeed, spec.kind) } : {}),
    });
    const decorationShapes = buildDecorationShapesShared(theme.decoration ?? "none", {
      palette: theme.palette,
      size: args.reference.size,
      locked: false,
      idPrefix: `fb_${Date.now().toString(36)}_${i}`,
      role: decorationRoleForKind(spec.kind),
    });
    const slide: Slide = {
      id: `slide_${Date.now().toString(36)}_${i}`,
      name: i === 0 && spec.kind === "cover" ? "Cover" : `Slide ${i + 1}`,
      index: i,
      background: layout.background ?? theme.backgroundPaint ?? { kind: "solid", color: theme.palette.bg },
      layers: [
        {
          id: "layer_main",
          name: "Main",
          visible: true,
          locked: false,
          shapes: [...decorationShapes, ...layout.shapes],
        },
      ],
    };
    const notes = (spec as { notes?: string }).notes;
    if (notes?.trim()) slide.notes = notes.trim();
    slides[i] = slide;
  }

  const pres = assembleReferencePresentation(args.reference, slides.filter(Boolean));
  // themeOverride 时覆盖继承的 theme 元数据
  if (args.compileOpts.themeOverride) {
    const t = args.compileOpts.themeOverride;
    pres.theme = {
      id: t.id,
      name: t.name,
      colors: {
        bg1: t.palette.bg,
        bg2: t.palette.bgAlt,
        tx1: t.palette.text,
        tx2: t.palette.textMuted,
        accent1: t.palette.accent1,
        accent2: t.palette.accent2,
        accent3: t.palette.accent3,
        accent4: t.palette.accent4,
      },
      fonts: { major: t.fonts.title, minor: t.fonts.body },
    };
  }
  return { pres, specs: specs.filter(Boolean), filled, fallback, slotFilledMask };
}
