"use strict";
// AI shape 工具集。
//
// 这是 chat-tool 层"暴露完整编辑能力"的核心 —— 让模型不仅能改现有 shape，还能：
//   1. 主动插入新 shape（文本框 / 80+ 种 OOXML 预设几何 / 直线 / 箭头），
//   2. 调整 stroke / opacity / rotation / visible / locked 等属性，
//   3. 编排 group / ungroup / align / distribute，
//   4. 段落级 bullet 编辑。
//
// 与 domains/shapes-basic.ts 等文件中已有的"基础"工具（replaceShapeText /
// setShapeFillColor / moveShape / reorderShape / deleteShape / setSlideTitle）
// 互补：它们都是"已有 shape 的属性 patch"，本文件覆盖"新增形状 + 进阶属性 + 多形状编排"。
//
// 设计要点：
//   - 所有命令都通过 rt.apply(...) 走 EditCommand，自动支持 undo / redo。
//   - 新插入的 shape 走 AddShapeCmd，append 到 layers[0]（与 editor.ts ribbon 插入一致）；
//     如果该 shape bbox > slide 50% 且与已有文字重叠，模型应紧跟一条 reorderShape({direction:"back"})。
//   - 工厂调用全部 reuse @sliiu/present-editor/shape-factory，避免与 editor.ts 行为分叉。
//   - SHAPE_LIBRARY 共 ~80 种预设几何 —— 不在 tool schema 里把所有 id 写死，
//     description 里列举常用类别 + 校验时 fallback to rect（与 editor 一致），
//     让 LLM 既能用主流 ~12 种 id（rect / ellipse / triangle / star / chevron /
//     rightArrow / flowChartDecision / lightningBolt / wedgeRectCallout / heart /
//     cloudCallout / hexagon），也能尝试罕见 id（库内现存即用，不在库内 fallback）。
Object.defineProperty(exports, "__esModule", { value: true });
exports.shapeTools = void 0;
const zod_1 = require("zod");
const commands_1 = require("@sliiu/present-editor/commands");
const core_1 = require("@sliiu/present-core");
const types_1 = require("../types");
// 用于 video/audio shape id 唯一性（与 image-tools.genId 同构，避免循环 import）。
function genMediaId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
// ---- 公共 Zod schema 片段 ----
const colorRe = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const colorSchema = zod_1.z.string().regex(colorRe, "must be #rrggbb or #rrggbbaa");
const rectSchema = zod_1.z.object({
    x: zod_1.z.number(),
    y: zod_1.z.number(),
    w: zod_1.z.number().min(1),
    h: zod_1.z.number().min(1),
});
// 全 Paint 联合 schema —— 与 setSlideBackground 里复用同一形状，但去掉 image
// 模式（image 适合做 background，shape 内嵌图片优先走 generateImage / stock）。
const shapePaintSchema = zod_1.z.discriminatedUnion("kind", [
    zod_1.z.object({
        kind: zod_1.z.literal("solid"),
        color: colorSchema,
        alpha: zod_1.z.number().min(0).max(1).optional(),
    }),
    zod_1.z.object({
        kind: zod_1.z.literal("linear"),
        angle: zod_1.z.number().min(0).max(360).describe("0=L→R, 90=T→B, 45=TL→BR."),
        stops: zod_1.z
            .array(zod_1.z.object({
            offset: zod_1.z.number().min(0).max(1),
            color: colorSchema,
            alpha: zod_1.z.number().min(0).max(1).optional(),
        }))
            .min(2)
            .max(6),
    }),
    zod_1.z.object({
        kind: zod_1.z.literal("radial"),
        stops: zod_1.z
            .array(zod_1.z.object({
            offset: zod_1.z.number().min(0).max(1),
            color: colorSchema,
            alpha: zod_1.z.number().min(0).max(1).optional(),
        }))
            .min(2)
            .max(6),
    }),
    zod_1.z.object({
        kind: zod_1.z.literal("none"),
    }),
]);
const dashEnum = zod_1.z.enum([
    "solid",
    "dot",
    "dash",
    "lgDash",
    "dashDot",
    "lgDashDot",
    "lgDashDotDot",
    "sysDash",
    "sysDot",
    "sysDashDot",
    "sysDashDotDot",
]);
const arrowEnum = zod_1.z.enum(["none", "triangle", "stealth", "diamond", "oval", "arrow"]);
// stroke 子结构（用于 setShapeStroke / insertShape / insertLine）。把 paint
// 拍平成 color + alpha 两字段，避免双层 union 让 LLM 出错；如果需要描边渐变，
// 再以专门的 strokePaint 字段提供（实战中描边渐变罕见，先不放）。
const strokePatchSchema = zod_1.z.object({
    color: colorSchema.optional(),
    alpha: zod_1.z.number().min(0).max(1).optional(),
    width: zod_1.z.number().min(0).max(48).optional(),
    dashPreset: dashEnum.optional(),
    cap: zod_1.z.enum(["butt", "round", "square"]).optional(),
    join: zod_1.z.enum(["miter", "round", "bevel"]).optional(),
    headEnd: arrowEnum.optional(),
    tailEnd: arrowEnum.optional(),
});
function buildStroke(patch, prev) {
    // 完全空 patch → 表示"清除 stroke"。
    if (patch.color === undefined &&
        patch.alpha === undefined &&
        patch.width === undefined &&
        patch.dashPreset === undefined &&
        patch.cap === undefined &&
        patch.join === undefined &&
        patch.headEnd === undefined &&
        patch.tailEnd === undefined) {
        return undefined;
    }
    // 复合：在已有 stroke 基础上 patch；首次创建则给一组安全默认值。
    const base = prev
        ? { ...prev, paint: { ...prev.paint } }
        : { paint: { kind: "solid", color: "#111827" }, width: 1 };
    if (patch.color !== undefined || patch.alpha !== undefined) {
        base.paint = {
            kind: "solid",
            color: patch.color ?? (base.paint.kind === "solid" ? base.paint.color : "#111827"),
            ...(patch.alpha !== undefined ? { alpha: patch.alpha } : {}),
        };
    }
    if (patch.width !== undefined)
        base.width = patch.width;
    if (patch.dashPreset !== undefined)
        base.dashPreset = patch.dashPreset;
    if (patch.cap !== undefined)
        base.cap = patch.cap;
    if (patch.join !== undefined)
        base.join = patch.join;
    if (patch.headEnd !== undefined) {
        if (patch.headEnd === "none")
            delete base.headEnd;
        else
            base.headEnd = { kind: patch.headEnd, w: "med", len: "med" };
    }
    if (patch.tailEnd !== undefined) {
        if (patch.tailEnd === "none")
            delete base.tailEnd;
        else
            base.tailEnd = { kind: patch.tailEnd, w: "med", len: "med" };
    }
    return base;
}
// ============================================================================
// Tool 集合：shapeTools
// ============================================================================
exports.shapeTools = [
    // --- 插入：文本框 ---
    (0, types_1.defineTool)({
        name: "insertTextBox",
        description: [
            "Insert a NEW text box on a slide. Use this when you need to add fresh text (callout, caption, label, key takeaway) that isn't replacing existing text on the slide.",
            "Defaults: 24px sans-serif, color=#111827, left-aligned, wrap=true. Provide `text` with \\n for multi-paragraph.",
            "Coordinate space matches `pres.size` — typical slide is 1280×720. Title baseline ~y=8% of slide height; safe area = 5% margin from each edge.",
        ].join(" "),
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            bbox: rectSchema.describe("Position + size in slide px. Common sizes: title ~960×60, caption ~400×40, body ~800×200."),
            text: zod_1.z.string().min(1).max(2000).describe("Text content. Use \\n to separate paragraphs."),
            fontFamily: zod_1.z.string().optional(),
            fontSize: zod_1.z.number().min(6).max(200).optional(),
            fontWeight: zod_1.z.number().int().min(100).max(900).optional(),
            italic: zod_1.z.boolean().optional(),
            color: colorSchema.optional(),
            align: zod_1.z.enum(["start", "middle", "end", "justify"]).optional(),
            vAlign: zod_1.z.enum(["top", "middle", "bottom"]).optional(),
            fillColor: colorSchema.optional().describe("Optional background fill for the text box itself."),
            name: zod_1.z.string().max(60).optional().describe("Shape display name (layers panel)."),
        }),
        tags: ["mutate", "shape"],
        execute: async (rt, { slideIdx, bbox, fillColor, ...rest }) => {
            const pres = rt.getPres();
            if (!pres.slides[slideIdx])
                return (0, types_1.err)(`slideIdx ${slideIdx} out of range`);
            const opts = {
                ...rest,
                ...(fillColor ? { fill: { kind: "solid", color: fillColor } } : {}),
            };
            const shape = (0, commands_1.createTextBox)(bbox, opts);
            const res = rt.apply(new commands_1.AddShapeCmd(slideIdx, 0, shape));
            if (!res.ok)
                return res;
            return (0, types_1.ok)({ slideIdx, shapeId: shape.id });
        },
    }),
    // --- 插入：几何 / OOXML preset 形状 ---
    (0, types_1.defineTool)({
        name: "insertShape",
        description: [
            "Insert a NEW geometric shape (from the 80+ OOXML presets in the shape library). Use to add visual structure: dividers, accent shapes, callouts, decorative geometry, flowchart steps, arrows pointing between items.",
            "Common `preset` ids you can use directly:",
            "  - Rectangles:   rect, roundRect, snipRect, plaque",
            "  - Basic:        ellipse, triangle, rtTriangle, diamond, pentagon, hexagon, octagon, plus, heart, donut, frame, sun, moon, lightningBolt, can, cube",
            "  - Arrows:       rightArrow, leftArrow, upArrow, downArrow, leftRightArrow, chevron, bentArrow, quadArrow, uTurnArrow",
            "  - Flowchart:    flowChartProcess, flowChartDecision, flowChartTerminator, flowChartData, flowChartConnector, flowChartDocument, flowChartPreparation, flowChartManualOperation",
            "  - Stars/banners: star4, star5, star6, star8, star12, ribbon, verticalScroll, wave",
            "  - Callouts:     wedgeRectCallout, wedgeRoundRectCallout, wedgeEllipseCallout, cloudCallout",
            "AFTER inserting: if the shape bbox is large (>50% of slide) and the slide already has text, immediately call `reorderShape { direction: \"back\" }` so it sits beneath the text. For full-slide backdrops prefer `setSlideBackground` instead.",
        ].join(" "),
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            preset: zod_1.z
                .string()
                .min(1)
                .describe("OOXML preset id from the shape library. Unknown ids fall back to a plain rectangle."),
            bbox: rectSchema,
            fill: shapePaintSchema.optional().describe("Override fill paint. Omit to use the library's default (usually a brand blue)."),
            stroke: strokePatchSchema.optional().describe("Override stroke (border / arrow ends / dash). Omit for default thin border."),
            opacity: zod_1.z.number().min(0).max(1).optional(),
            rotation: zod_1.z.number().min(-360).max(360).optional().describe("Rotation in degrees (clockwise)."),
            name: zod_1.z.string().max(60).optional(),
        }),
        tags: ["mutate", "shape"],
        execute: async (rt, { slideIdx, preset, bbox, fill, stroke, opacity, rotation, name }) => {
            const pres = rt.getPres();
            if (!pres.slides[slideIdx])
                return (0, types_1.err)(`slideIdx ${slideIdx} out of range`);
            const fillPaint = fill ? toShapePaint(fill) : undefined;
            const strokeObj = stroke ? buildStroke(stroke) : undefined;
            const shape = (0, commands_1.createShapeFromPreset)(preset, bbox, {
                ...(fillPaint !== undefined ? { fill: fillPaint } : {}),
                ...(strokeObj !== undefined ? { stroke: strokeObj } : {}),
                ...(opacity !== undefined ? { opacity } : {}),
                ...(rotation !== undefined ? { rotation } : {}),
                ...(name ? { name } : {}),
            });
            const res = rt.apply(new commands_1.AddShapeCmd(slideIdx, 0, shape));
            if (!res.ok)
                return res;
            return (0, types_1.ok)({ slideIdx, shapeId: shape.id, preset });
        },
    }),
    // --- 插入：直线 / 箭头 ---
    (0, types_1.defineTool)({
        name: "insertLine",
        description: [
            "Insert a straight line (optionally with arrow heads on either end). Use for: connectors between flowchart nodes, underline accents, divider lines, arrows pointing at content.",
            "Coordinates `(x1,y1)` → `(x2,y2)` are absolute slide-px. For a horizontal divider use the same y twice.",
        ].join(" "),
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            x1: zod_1.z.number(),
            y1: zod_1.z.number(),
            x2: zod_1.z.number(),
            y2: zod_1.z.number(),
            color: colorSchema.optional(),
            width: zod_1.z.number().min(0.5).max(48).optional().describe("Line thickness (default 2)."),
            dashPreset: dashEnum.optional(),
            headArrow: arrowEnum.optional().describe("Arrow at the (x1,y1) end. Default 'none'."),
            tailArrow: arrowEnum.optional().describe("Arrow at the (x2,y2) end. Default 'none' (use 'triangle' for a typical arrow)."),
            name: zod_1.z.string().max(60).optional(),
        }),
        tags: ["mutate", "shape"],
        execute: async (rt, { slideIdx, name, ...lineOpts }) => {
            const pres = rt.getPres();
            if (!pres.slides[slideIdx])
                return (0, types_1.err)(`slideIdx ${slideIdx} out of range`);
            const shape = (0, commands_1.createLine)({ ...lineOpts, ...(name ? { name } : {}) });
            const res = rt.apply(new commands_1.AddShapeCmd(slideIdx, 0, shape));
            if (!res.ok)
                return res;
            return (0, types_1.ok)({ slideIdx, shapeId: shape.id });
        },
    }),
    // --- 插入：视频 / 音频 ---
    //
    // 与 editor.ts ribbon 的 insertVideo/insertAudio 行为对齐：视频默认卡到 slide 60%
    // 内保持宽高比；音频是 100×100 的小图标控件。src 必须是 dataURL 才能嵌进导出的
    // pptx（http(s) URL 只在浏览器预览里可播，导出后媒体字节不存在）。
    (0, types_1.defineTool)({
        name: "insertVideo",
        description: [
            "Insert a video shape onto a slide. `src` should be a data: URL (base64 media) so the video embeds into the exported PPTX;",
            "an http(s) URL will play in the in-browser editor but will NOT embed on export — warn the user if you must use one.",
            "Default placement: centered, scaled to fit within 60% of the slide keeping aspect ratio; pass `bbox` to override.",
            "The shape is appended on top of the layer — if it overlaps existing text, follow up with reorderShape({direction:'back'}) or move it.",
        ].join(" "),
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            src: zod_1.z.string().min(4).describe("data: URL of the video (preferred) or http(s) URL."),
            bbox: rectSchema.optional().describe("Absolute slide-px placement. Omit for centered 60% default."),
            aspect: zod_1.z.number().positive().optional().describe("Width/height ratio used for the default bbox (default 16/9). Ignored when bbox is given."),
            autoplay: zod_1.z.boolean().optional(),
            loop: zod_1.z.boolean().optional(),
            muted: zod_1.z.boolean().optional(),
            name: zod_1.z.string().max(60).optional(),
        }),
        tags: ["mutate", "shape"],
        execute: async (rt, { slideIdx, src, bbox, aspect, autoplay, loop, muted, name }) => {
            const pres = rt.getPres();
            if (!pres.slides[slideIdx])
                return (0, types_1.err)(`slideIdx ${slideIdx} out of range`);
            const ar = aspect && aspect > 0 ? aspect : 16 / 9;
            let box;
            if (bbox) {
                box = bbox;
            }
            else {
                let w = Math.min(pres.size.width * 0.6, 480);
                let h = w / ar;
                if (h > pres.size.height * 0.6) {
                    h = pres.size.height * 0.6;
                    w = h * ar;
                }
                box = { x: (pres.size.width - w) / 2, y: (pres.size.height - h) / 2, w, h };
            }
            const shape = {
                id: genMediaId("vid"),
                name: name ?? "Video",
                kind: "video",
                bbox: box,
                transform: (0, core_1.identityTransform)(),
                zIndex: 0,
                visible: true,
                locked: false,
                opacity: 1,
                src,
                controls: true,
                ...(autoplay !== undefined ? { autoplay } : {}),
                ...(loop !== undefined ? { loop } : {}),
                ...(muted !== undefined ? { muted } : {}),
            };
            const res = rt.apply(new commands_1.AddShapeCmd(slideIdx, 0, shape));
            if (!res.ok)
                return res;
            const embedded = src.startsWith("data:");
            return (0, types_1.ok)({ slideIdx, shapeId: shape.id, embeddedOnExport: embedded });
        },
    }),
    (0, types_1.defineTool)({
        name: "insertAudio",
        description: [
            "Insert an audio shape (small playback control icon) onto a slide — e.g. narration or background music.",
            "`src` should be a data: URL so the audio embeds into the exported PPTX; an http(s) URL only plays in the in-browser editor.",
            "Renders as a 100×100 control; pass `bbox` to reposition (typically a corner, out of the content area).",
        ].join(" "),
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            src: zod_1.z.string().min(4).describe("data: URL of the audio (preferred) or http(s) URL."),
            bbox: rectSchema.optional().describe("Absolute slide-px placement. Omit for centered 100×100 default."),
            autoplay: zod_1.z.boolean().optional(),
            loop: zod_1.z.boolean().optional(),
            name: zod_1.z.string().max(60).optional(),
        }),
        tags: ["mutate", "shape"],
        execute: async (rt, { slideIdx, src, bbox, autoplay, loop, name }) => {
            const pres = rt.getPres();
            if (!pres.slides[slideIdx])
                return (0, types_1.err)(`slideIdx ${slideIdx} out of range`);
            const box = bbox ?? {
                x: (pres.size.width - 100) / 2,
                y: (pres.size.height - 100) / 2,
                w: 100,
                h: 100,
            };
            const shape = {
                id: genMediaId("aud"),
                name: name ?? "Audio",
                kind: "audio",
                bbox: box,
                transform: (0, core_1.identityTransform)(),
                zIndex: 0,
                visible: true,
                locked: false,
                opacity: 1,
                src,
                ...(autoplay !== undefined ? { autoplay } : {}),
                ...(loop !== undefined ? { loop } : {}),
            };
            const res = rt.apply(new commands_1.AddShapeCmd(slideIdx, 0, shape));
            if (!res.ok)
                return res;
            return (0, types_1.ok)({ slideIdx, shapeId: shape.id, embeddedOnExport: src.startsWith("data:") });
        },
    }),
    // --- 描边 / Stroke ---
    (0, types_1.defineTool)({
        name: "setShapeStroke",
        description: [
            "Set or update a shape's stroke (border + arrow heads + dash style). Pass an empty object `{}` (no fields) to CLEAR the stroke entirely.",
            "Examples:",
            "  - Thick brand border:         { color: '#1e40af', width: 3 }",
            "  - Dashed:                     { dashPreset: 'dash', width: 1.5 }",
            "  - Arrow tail only:            { tailEnd: 'triangle' }",
            "  - Subtle outline on photo:    { color: '#ffffff', width: 4 }",
        ].join(" "),
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            stroke: strokePatchSchema.describe("Patch on the existing stroke. Fields you omit keep their previous value. Pass `{}` (no fields) to clear stroke."),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId, stroke }) => {
            const pres = rt.getPres();
            const slide = pres.slides[slideIdx];
            if (!slide)
                return (0, types_1.err)(`slideIdx ${slideIdx} out of range`);
            const prev = findShapeRecursive(slide, shapeId);
            if (!prev)
                return (0, types_1.err)(`shape ${shapeId} not found on slide ${slideIdx}`);
            const next = buildStroke(stroke, prev.stroke);
            return rt.apply(new commands_1.SetStrokeCmd(slideIdx, shapeId, next));
        },
    }),
    (0, types_1.defineTool)({
        name: "setShapeFill",
        description: "Set a shape's fill to any paint: solid / linear / radial / none. Use this (not setShapeFillColor) for gradients or to clear the fill. Ripple: re-check text contrast on top of the shape afterwards.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            fill: shapePaintSchema,
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, fill }) => rt.apply(new commands_1.SetFillCmd(slideIdx, shapeId, toShapePaint(fill))),
    }),
    (0, types_1.defineTool)({
        name: "copyShapeFormat",
        description: "Format painter: copy fill / stroke / opacity / effects / text style / bullets from sourceShapeId onto targetShapeId. Both shapes must be on the given slides. Does not copy text content or geometry.",
        inputSchema: zod_1.z.object({
            sourceSlideIdx: zod_1.z.number().int().min(0),
            sourceShapeId: zod_1.z.string(),
            targetSlideIdx: zod_1.z.number().int().min(0),
            targetShapeId: zod_1.z.string(),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { sourceSlideIdx, sourceShapeId, targetSlideIdx, targetShapeId }) => {
            const pres = rt.getPres();
            const srcSlide = pres.slides[sourceSlideIdx];
            const dstSlide = pres.slides[targetSlideIdx];
            if (!srcSlide)
                return (0, types_1.err)(`sourceSlideIdx ${sourceSlideIdx} out of range`);
            if (!dstSlide)
                return (0, types_1.err)(`targetSlideIdx ${targetSlideIdx} out of range`);
            const src = findShapeRecursive(srcSlide, sourceShapeId);
            if (!src)
                return (0, types_1.err)(`source shape ${sourceShapeId} not found`);
            if (!findShapeRecursive(dstSlide, targetShapeId)) {
                return (0, types_1.err)(`target shape ${targetShapeId} not found`);
            }
            return rt.apply(new commands_1.ApplyFormatCmd(targetSlideIdx, targetShapeId, (0, commands_1.captureFormatSnapshot)(src)));
        },
    }),
    // --- 透明度 ---
    (0, types_1.defineTool)({
        name: "setShapeOpacity",
        description: "Set a shape's overall opacity (0 = fully transparent, 1 = fully opaque). Useful for ghosted images, watermark text, layered decorations.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            opacity: zod_1.z.number().min(0).max(1),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId, opacity }) => rt.apply(new commands_1.SetShapeOpacityCmd(slideIdx, shapeId, opacity)),
    }),
    // --- 旋转 ---
    (0, types_1.defineTool)({
        name: "setShapeRotation",
        description: "Set absolute rotation of a shape in degrees (clockwise; 0 = upright). Negative values rotate counter-clockwise. Pass 0 to reset.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            degrees: zod_1.z.number().min(-360).max(360),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId, degrees }) => rt.apply(new commands_1.SetShapeRotationCmd(slideIdx, shapeId, degrees)),
    }),
    // --- 翻转 ---
    (0, types_1.defineTool)({
        name: "flipShape",
        description: "Flip a shape horizontally ('h') or vertically ('v'). Each call toggles — calling twice returns to the original orientation.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            axis: zod_1.z.enum(["h", "v"]),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId, axis }) => rt.apply(new commands_1.FlipShapeCmd(slideIdx, shapeId, axis)),
    }),
    // --- 可见性 ---
    (0, types_1.defineTool)({
        name: "setShapeVisible",
        description: "Show or hide a shape on a slide. Hidden shapes still exist in the layer (and remain in the .pptx export) but won't render.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            visible: zod_1.z.boolean(),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId, visible }) => rt.apply(new commands_1.SetShapeVisibleCmd(slideIdx, shapeId, visible)),
    }),
    // --- 锁定 ---
    (0, types_1.defineTool)({
        name: "setShapeLocked",
        description: "Lock or unlock a shape — locked shapes can't be moved/resized by drag in the editor (but can still be edited via tools like this). Use sparingly: locking decorative backgrounds prevents accidental drag during user edits.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            locked: zod_1.z.boolean(),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId, locked }) => rt.apply(new commands_1.SetShapeLockedCmd(slideIdx, shapeId, locked)),
    }),
    // --- 编组 / 解组 ---
    (0, types_1.defineTool)({
        name: "groupShapes",
        description: "Combine multiple shapes into a single group. Required: at least 2 shapeIds, all on the same slide & layer. Useful when you've built a multi-shape composition (icon + label, callout + arrow) and want to move/animate them together.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeIds: zod_1.z.array(zod_1.z.string()).min(2).max(50),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeIds }) => rt.apply(new commands_1.GroupShapesCmd(slideIdx, shapeIds)),
    }),
    (0, types_1.defineTool)({
        name: "ungroupShapes",
        description: "Dissolve a group, lifting its children back to the parent layer. shapeId must be a group.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId }) => rt.apply(new commands_1.UngroupShapesCmd(slideIdx, shapeId)),
    }),
    // --- 对齐 ---
    (0, types_1.defineTool)({
        name: "alignShapes",
        description: [
            "Align 2+ shapes against their combined bounding box. Pick mode:",
            "  - left / centerH / right       → align horizontally",
            "  - top  / centerV  / bottom     → align vertically",
            "Common patterns: align bullets visually with centerH; align icons at the top of a row with top.",
        ].join(" "),
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeIds: zod_1.z.array(zod_1.z.string()).min(2).max(50),
            mode: zod_1.z.enum(["left", "centerH", "right", "top", "centerV", "bottom"]),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeIds, mode }) => rt.apply(new commands_1.AlignShapesCmd(slideIdx, shapeIds, mode)),
    }),
    // --- 等距分布 ---
    (0, types_1.defineTool)({
        name: "distributeShapes",
        description: "Distribute 3+ shapes evenly along the horizontal ('h') or vertical ('v') axis. Endpoint shapes stay put; middle shapes are spaced equally between them. Useful for evenly-spaced icon rows / step indicators.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeIds: zod_1.z.array(zod_1.z.string()).min(3).max(50),
            axis: zod_1.z.enum(["h", "v"]),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeIds, axis }) => rt.apply(new commands_1.DistributeShapesCmd(slideIdx, shapeIds, axis)),
    }),
    // --- 段落 bullet / numbering ---
    (0, types_1.defineTool)({
        name: "setParagraphBullet",
        description: [
            "Set or clear the bullet (or numbering) style on EVERY paragraph of a text shape.",
            "Bullet types:",
            "  - { kind: 'char', char: '•' }                   → custom char bullet",
            "  - { kind: 'number', numType: 'arabicPeriod' }   → 1. 2. 3. (common numTypes: arabicPeriod, arabicParenR, romanUcPeriod, alphaLcPeriod)",
            "  - { kind: 'none' }                              → strip bullets",
            "Effect applies to ALL paragraphs of the shape (or all visible cells if shape is a table group). When ADDING bullets, the command auto-applies PowerPoint's default hanging indent so text doesn't sit underneath the bullet.",
        ].join(" "),
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            bullet: zod_1.z.discriminatedUnion("kind", [
                zod_1.z.object({ kind: zod_1.z.literal("none") }),
                zod_1.z.object({
                    kind: zod_1.z.literal("char"),
                    char: zod_1.z.string().min(1).max(4).describe("Bullet character (e.g. '•', '◦', '◆', '–')."),
                    color: colorSchema.optional(),
                    font: zod_1.z.string().optional(),
                    sizePct: zod_1.z.number().min(25).max(400).optional().describe("Bullet size as % of run font size (PowerPoint convention)."),
                }),
                zod_1.z.object({
                    kind: zod_1.z.literal("number"),
                    numType: zod_1.z
                        .string()
                        .describe("OOXML autoNum scheme. Common: arabicPeriod (1.), arabicParenR (1)), arabicParenBoth ((1)), romanUcPeriod (I.), romanLcPeriod (i.), alphaUcPeriod (A.), alphaLcPeriod (a.)."),
                    startAt: zod_1.z.number().int().min(1).optional(),
                    color: colorSchema.optional(),
                    font: zod_1.z.string().optional(),
                }),
            ]),
        }),
        tags: ["mutate", "shape", "text"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId, bullet }) => {
            const def = bullet.kind === "none" ? undefined : bullet;
            return rt.apply(new commands_1.SetParagraphBulletCmd(slideIdx, shapeId, def));
        },
    }),
    // --- 工具元数据：列出所有可用形状预设（让模型自查） ---
    (0, types_1.defineTool)({
        name: "listShapePresets",
        description: "List all available shape presets that `insertShape` accepts, grouped by category. Call this if you need a niche shape and aren't sure of the exact id.",
        inputSchema: zod_1.z.object({
            category: zod_1.z
                .enum(["lines", "rect", "basic", "arrows", "flowchart", "starsBanners", "callouts"])
                .optional()
                .describe("Filter to a single category. Omit to see all."),
        }),
        tags: ["read", "shape"],
        execute: async (rt, { category }) => {
            const items = commands_1.SHAPE_LIBRARY.filter((e) => !category || e.category === category).map((e) => ({
                id: e.id,
                category: e.category,
                name: e.fallback,
            }));
            return (0, types_1.ok)({ count: items.length, presets: items });
        },
    }),
    (0, types_1.defineTool)({
        name: "setLineEndpoints",
        description: "Move the two endpoints of a line / connector (kind=line). Pass x1,y1,x2,y2 in slide px; bbox is derived.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            x1: zod_1.z.number(),
            y1: zod_1.z.number(),
            x2: zod_1.z.number(),
            y2: zod_1.z.number(),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, x1, y1, x2, y2 }) => {
            const x = Math.min(x1, x2);
            const y = Math.min(y1, y2);
            const bbox = { x, y, w: Math.max(1, Math.abs(x2 - x1)), h: Math.max(1, Math.abs(y2 - y1)) };
            return rt.apply(new commands_1.SetLineEndpointsCmd(slideIdx, shapeId, { x1, y1, x2, y2 }, bbox));
        },
    }),
    (0, types_1.defineTool)({
        name: "setPathConnectorEnds",
        description: "Adjust an elbow / curved connector (kind=path): write bbox plus flip scales. scaleX/scaleY of -1 mirror the path. Prefer setLineEndpoints for straight lines.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            bbox: rectSchema,
            scaleX: zod_1.z.number().default(1),
            scaleY: zod_1.z.number().default(1),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, bbox, scaleX, scaleY }) => rt.apply(new commands_1.SetPathConnectorEndsCmd(slideIdx, shapeId, bbox, scaleX, scaleY)),
    }),
    (0, types_1.defineTool)({
        name: "setPolygonPoints",
        description: "Rewrite a polygon's vertices (kind=polygon). Points are {x,y} in slide px; bbox is derived from the hull.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            points: zod_1.z.array(zod_1.z.object({ x: zod_1.z.number(), y: zod_1.z.number() })).min(3),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, points }) => {
            const pts = points.map((p) => [p.x, p.y]);
            const xs = pts.map((p) => p[0]);
            const ys = pts.map((p) => p[1]);
            const x = Math.min(...xs);
            const y = Math.min(...ys);
            const bbox = { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) };
            return rt.apply(new commands_1.SetPolygonPointsCmd(slideIdx, shapeId, pts, bbox));
        },
    }),
    (0, types_1.defineTool)({
        name: "setPresetAdj",
        description: "Write preset geometry adjust values (avLst) on a path shape — the yellow diamond handles (corner radius, arrow head size, etc.). Keys are OOXML adj names (adj, adj2, …) mapped to numbers. Call listShapesOnSlide first to read current presetAdj.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            adj: zod_1.z.record(zod_1.z.string(), zod_1.z.number()),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, adj }) => rt.apply(new commands_1.SetPresetAdjCmd(slideIdx, shapeId, adj)),
    }),
    (0, types_1.defineTool)({
        name: "setMediaProps",
        description: "Patch playback properties on a video / audio shape: autoplay, loop, muted, volume (0..1), trim {start,end} seconds, poster (video only, data URL). Omitted fields stay unchanged.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            autoplay: zod_1.z.boolean().optional(),
            loop: zod_1.z.boolean().optional(),
            muted: zod_1.z.boolean().optional(),
            volume: zod_1.z.number().min(0).max(1).optional(),
            trim: zod_1.z.object({ start: zod_1.z.number().min(0).optional(), end: zod_1.z.number().min(0).optional() }).optional(),
            poster: zod_1.z.string().optional(),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, ...patch }) => rt.apply(new commands_1.SetMediaPropsCmd(slideIdx, shapeId, patch)),
    }),
    (0, types_1.defineTool)({
        name: "replaceMediaSrc",
        description: "Replace the source of a video / audio shape. `src` should be a data: URL so it embeds on export. Clears trim / poster. Optional duration in seconds.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            src: zod_1.z.string().min(4),
            duration: zod_1.z.number().positive().optional(),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, src, duration }) => rt.apply(new commands_1.UpdateMediaSrcCmd(slideIdx, shapeId, src, duration)),
    }),
    (0, types_1.defineTool)({
        name: "setShapeHyperlink",
        description: [
            "Set a shape-level click (or hover) action — OOXML a:hlinkClick / a:hlinkHover. Distinct from setRichText hyperlinkUrl (that is run-level, underlined text).",
            "Use when the user wants 'click this picture/shape to go to slide N / open a URL / next slide / end show / play a sound'.",
            "kind=url needs `url`; kind=slide needs `slideNumber` (1-based, same as PowerPoint); next/prev/first/last/back/endShow need no target; kind=sound needs soundSrc as a data: URL.",
            "slot=hover writes mouse-over instead of click. Other shapes on the slide are unchanged.",
        ].join(" "),
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            kind: zod_1.z.enum(["url", "slide", "next", "prev", "first", "last", "back", "endShow", "sound"]),
            slot: zod_1.z.enum(["click", "hover"]).optional().describe("Default click (hlinkClick). hover = hlinkHover."),
            url: zod_1.z.string().min(1).optional().describe("Required when kind=url."),
            slideNumber: zod_1.z
                .number()
                .int()
                .min(1)
                .optional()
                .describe("1-based slide index when kind=slide (PowerPoint numbering)."),
            tooltip: zod_1.z.string().optional(),
            soundName: zod_1.z.string().optional(),
            soundSrc: zod_1.z.string().optional().describe("data: URL of the sound file (kind=sound, or extra click sound)."),
            highlightClick: zod_1.z.boolean().optional(),
            endSnd: zod_1.z.boolean().optional(),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, input) => {
            const pres = rt.getPres();
            const slide = pres.slides[input.slideIdx];
            if (!slide)
                return (0, types_1.err)(`slideIdx ${input.slideIdx} out of range`);
            if (!findShapeRecursive(slide, input.shapeId)) {
                return (0, types_1.err)(`shape ${input.shapeId} not found on slide ${input.slideIdx}`);
            }
            if (input.kind === "url") {
                const url = (0, core_1.sanitizeExternalUrl)(input.url);
                if (!url)
                    return (0, types_1.err)("kind=url requires an http(s) or mailto URL.");
            }
            if (input.kind === "slide") {
                if (input.slideNumber === undefined)
                    return (0, types_1.err)("kind=slide requires `slideNumber` (1-based).");
                if (input.slideNumber > pres.slides.length) {
                    return (0, types_1.err)(`slideNumber ${input.slideNumber} out of range (have ${pres.slides.length} slides).`);
                }
            }
            if (input.kind === "sound" && !input.soundSrc?.startsWith("data:")) {
                return (0, types_1.err)("kind=sound requires soundSrc as a data: URL.");
            }
            const link = { kind: input.kind };
            if (input.kind === "url")
                link.target = (0, core_1.sanitizeExternalUrl)(input.url);
            if (input.kind === "slide")
                link.target = String(input.slideNumber);
            if (input.tooltip)
                link.tooltip = input.tooltip;
            if (input.highlightClick !== undefined)
                link.highlightClick = input.highlightClick;
            if (input.endSnd !== undefined)
                link.endSnd = input.endSnd;
            if (input.soundSrc) {
                link.sound = {
                    src: input.soundSrc,
                    ...(input.soundName ? { name: input.soundName } : {}),
                };
            }
            return rt.apply(new commands_1.SetShapeHyperlinkCmd(input.slideIdx, input.shapeId, link, input.slot ?? "click"));
        },
    }),
    (0, types_1.defineTool)({
        name: "clearShapeHyperlink",
        description: "Remove a shape-level click or hover hyperlink (a:hlinkClick / a:hlinkHover). Does not clear run-level hyperlinkUrl inside text. Pass slot=hover to clear only the mouse-over action.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            slot: zod_1.z.enum(["click", "hover"]).optional(),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, slot }) => {
            const pres = rt.getPres();
            const slide = pres.slides[slideIdx];
            if (!slide)
                return (0, types_1.err)(`slideIdx ${slideIdx} out of range`);
            if (!findShapeRecursive(slide, shapeId)) {
                return (0, types_1.err)(`shape ${shapeId} not found on slide ${slideIdx}`);
            }
            return rt.apply(new commands_1.SetShapeHyperlinkCmd(slideIdx, shapeId, undefined, slot ?? "click"));
        },
    }),
];
// 把 tool schema 的 Paint(简化版) 转成 core Paint（discriminator 等价 + 透传 alpha）。
function toShapePaint(p) {
    if (p.kind === "none")
        return { kind: "none" };
    if (p.kind === "solid") {
        return {
            kind: "solid",
            color: p.color,
            ...(p.alpha !== undefined ? { alpha: p.alpha } : {}),
        };
    }
    if (p.kind === "linear") {
        return {
            kind: "linear",
            angle: p.angle,
            stops: p.stops.map((s) => ({
                offset: s.offset,
                color: s.color,
                ...(s.alpha !== undefined ? { alpha: s.alpha } : {}),
            })),
        };
    }
    if (p.kind === "radial") {
        return {
            kind: "radial",
            stops: p.stops.map((s) => ({
                offset: s.offset,
                color: s.color,
                ...(s.alpha !== undefined ? { alpha: s.alpha } : {}),
            })),
            // 与 SetSlideBackgroundCmd 的渲染端一致：缺省全图填充。
            path: "circle",
            fillToRect: { l: 0, t: 0, r: 0, b: 0 },
        };
    }
    return undefined;
}
// 递归查找 shape（含 group children），用于 setShapeStroke 取 prev。
function findShapeRecursive(slide, id) {
    for (const layer of slide.layers) {
        for (const s of layer.shapes) {
            const found = walk(s, id);
            if (found)
                return found;
        }
    }
    return undefined;
}
function walk(s, id) {
    if (s.id === id)
        return s;
    if (s.kind === "group") {
        for (const c of s.children) {
            const f = walk(c, id);
            if (f)
                return f;
        }
    }
    return undefined;
}
