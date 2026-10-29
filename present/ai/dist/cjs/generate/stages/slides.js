"use strict";
// 阶段：逐页 SlideSpec 生成（常规路径）与参考模板填槽路径。
//
// 并发度限制：一次最多 4 个并发，避免触发 provider 速率限制。
// 任意单页失败时，单独 fallback 到 outlineToFallbackSpec 的逐页规则，
// 整体不会因为一页 JSON 偏差而失败。
Object.defineProperty(exports, "__esModule", { value: true });
exports.callSlide = callSlide;
exports.generateSlideSpecs = generateSlideSpecs;
exports.generateViaReferenceSlots = generateViaReferenceSlots;
const zod_1 = require("zod");
const schema_1 = require("../schema");
const compile_1 = require("../compile/compile");
const layouts_1 = require("../compile/layouts");
const decorations_1 = require("../../decorations");
const themes_1 = require("../../themes");
const prompts_1 = require("../prompts");
const aliases_1 = require("../aliases");
const ensure_spec_quality_1 = require("../qa/ensure-spec-quality");
const slots_1 = require("../template/slots");
const SlotFillResultSchema = zod_1.z.object({
    fills: zod_1.z
        .array(zod_1.z.object({
        shapeId: zod_1.z.string().min(1),
        text: zod_1.z.string(),
    }))
        .min(1),
    notes: zod_1.z.string().optional(),
});
const CONCURRENCY = 4;
function fallbackSlideSpec(outline, item) {
    const fb = (0, compile_1.outlineToFallbackSpec)({
        title: outline.title,
        ...(outline.subtitle ? { subtitle: outline.subtitle } : {}),
        themeId: outline.themeId,
        slides: [item],
    }, { injectMissingCover: false });
    return fb.slides[0];
}
async function callSlide(model, args) {
    const item = args.outline.slides[args.index];
    if (!item)
        throw new Error(`outline.slides[${args.index}] is missing`);
    const slideCtx = {
        ...(args.guidance.styleFamily ? { styleFamily: args.guidance.styleFamily } : {}),
        ...(item.layoutHint ? { layoutKinds: [item.layoutHint] } : {}),
    };
    const system = [(0, prompts_1.slideSystemPrompt)(args.host, slideCtx), args.systemExtra?.trim()].filter(Boolean).join("\n\n");
    return (0, aliases_1.generateSpecJson)(model, schema_1.SlideSpecSchema, system, (0, prompts_1.slideUserPrompt)({
        outline: args.outline,
        index: args.index,
        item,
        guidance: args.guidance,
    }), args.signal);
}
async function callSlotFill(model, args) {
    const item = args.outline.slides[args.index];
    if (!item)
        throw new Error(`outline.slides[${args.index}] is missing`);
    const system = [(0, prompts_1.slotFillSystemPrompt)(args.host, args.guidance.styleFamily), args.systemExtra?.trim()]
        .filter(Boolean)
        .join("\n\n");
    return (0, aliases_1.generateSpecJson)(model, SlotFillResultSchema, system, (0, prompts_1.slotFillUserPrompt)({
        outline: args.outline,
        index: args.index,
        item,
        guidance: args.guidance,
        slotsBlock: (0, slots_1.formatSlotsForPrompt)(args.schema),
    }), args.signal);
}
/** 常规路径：并发逐页生成 SlideSpec；失败页回退 outlineToFallbackSpec。 */
async function generateSlideSpecs(args) {
    const { outline } = args;
    const total = outline.slides.length;
    const specs = new Array(total);
    let done = 0;
    async function runOne(i) {
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
        }
        catch (e) {
            if (args.debug)
                console.warn(`[ai] slide #${i + 1} failed, using fallback`, e);
            specs[i] = fallbackSlideSpec(outline, outline.slides[i]);
        }
        finally {
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
    const workers = [];
    const parallelism = Math.max(1, args.concurrency ?? CONCURRENCY);
    for (let k = 0; k < Math.min(parallelism, total); k++) {
        workers.push((async () => {
            while (queue.length > 0) {
                const i = queue.shift();
                if (i === undefined)
                    return;
                await runOne(i);
            }
        })());
    }
    await Promise.all(workers);
    return specs;
}
/**
 * 参考模板填槽路径：映射大纲 → clone 参考页 → LLM 填 shapeId → 组装 Presentation。
 * 无槽位 / 映射失败的页回退到 layout compile，再拼进同一 deck。
 */
async function generateViaReferenceSlots(args) {
    const schemas = (0, slots_1.induceReferenceSchemas)(args.reference, args.lengthFactor);
    const { refIndices } = (0, slots_1.mapOutlineToReference)(args.outline, schemas);
    if (args.debug) {
        console.info(`[ai] reference slots: ${schemas.length} ref slides → map [${refIndices.join(",")}]`, schemas.map((s) => s.summary));
    }
    const total = args.outline.slides.length;
    const slides = new Array(total);
    const specs = new Array(total);
    const slotFilledMask = new Array(total).fill(false);
    let filled = 0;
    let fallback = 0;
    let done = 0;
    async function runOne(i) {
        const item = args.outline.slides[i];
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
                const { slide, idMap } = (0, slots_1.cloneReferenceSlideWithIdMap)(refSlide, i);
                const fills = (0, slots_1.remapFills)(result.fills, idMap);
                const slotMeta = (0, slots_1.remapSlots)(schema.slots, idMap);
                (0, slots_1.fillSlotsByShapeId)(slide, fills, slotMeta);
                if (result.notes?.trim())
                    slide.notes = result.notes.trim();
                else if (item.notes?.trim())
                    slide.notes = item.notes.trim();
                slides[i] = slide;
                // QA 节奏用 outline layoutHint；enrich 对本页跳过（mask）。
                const hint = item.layoutHint ?? "content";
                const fb = (0, compile_1.outlineToFallbackSpec)({
                    title: args.outline.title,
                    themeId: args.outline.themeId,
                    slides: [{ title: item.title, layoutHint: hint, bullets: item.bullets, notes: slide.notes }],
                });
                specs[i] = fb.slides[fb.slides.length - 1];
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
            }
            catch (e) {
                if (args.debug)
                    console.warn(`[ai] reference fill #${i + 1} failed, fallback compile`, e);
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
        }
        catch {
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
    const workers = [];
    const parallelism = Math.max(1, args.concurrency ?? CONCURRENCY);
    for (let k = 0; k < Math.min(parallelism, total); k++) {
        workers.push((async () => {
            while (queue.length > 0) {
                const i = queue.shift();
                if (i === undefined)
                    return;
                await runOne(i);
            }
        })());
    }
    await Promise.all(workers);
    // 仅对 compile 回退页做节奏/配图兜底（填槽页保留参考几何）。
    const fallbackIdxs = slotFilledMask.map((v, i) => (!v && specs[i] ? i : -1)).filter((i) => i >= 0);
    if (fallbackIdxs.length > 0) {
        const subset = fallbackIdxs.map((i) => specs[i]);
        const ensured = (0, ensure_spec_quality_1.ensureSlideSpecQuality)(subset, args.guidance, {
            partial: true,
            imageIdeas: fallbackIdxs.map((i) => args.outline.slides[i]?.imageIdea),
        });
        ensured.specs.forEach((s, j) => {
            specs[fallbackIdxs[j]] = s;
        });
        if (args.debug && ensured.fixes.length > 0) {
            console.info(`[ai] reference fallback ensure-quality:`, ensured.fixes);
        }
    }
    // 对 fallback 页走 compile，再与填槽页合并
    const theme = args.compileOpts.themeOverride ?? (0, themes_1.getTheme)(args.outline.themeId !== "ai" ? args.outline.themeId : "ocean");
    for (let i = 0; i < total; i++) {
        if (slides[i])
            continue;
        const spec = specs[i];
        const layout = (0, layouts_1.renderLayout)(spec, args.reference.size, theme, {
            ...(args.compileOpts.designSeed !== undefined ? { seed: (0, compile_1.hashKind)(args.compileOpts.designSeed, spec.kind) } : {}),
        });
        const decorationShapes = (0, decorations_1.buildDecorationShapesShared)(theme.decoration ?? "none", {
            palette: theme.palette,
            size: args.reference.size,
            locked: false,
            idPrefix: `fb_${Date.now().toString(36)}_${i}`,
            role: (0, compile_1.decorationRoleForKind)(spec.kind),
        });
        const slide = {
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
        const notes = spec.notes;
        if (notes?.trim())
            slide.notes = notes.trim();
        slides[i] = slide;
    }
    const pres = (0, slots_1.assembleReferencePresentation)(args.reference, slides.filter(Boolean));
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
