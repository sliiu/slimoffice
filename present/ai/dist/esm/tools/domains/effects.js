// AI 视觉效果工具集：shadow / glow / softEdge / reflection / blur + image crop。
//
// 严格按 ECMA-376 §20.1.8 effectLst：每类效果在 shape 上互斥（PowerPoint UI 也只
// 允许设置一个 shadow、一个 glow 等），SetShapeEffectsCmd 内部已经实现"先删后加"。
//
// 这里提供分立的 5 个 tool（每类一个）+ 一个 clearShapeEffects，让 LLM 用更接近
// 自然语言的方式描述："给图片加一点投影"→ setShapeShadow，"给标题做柔和外发光" →
// setShapeGlow。每个 tool 内部都映射到 SetShapeEffectsCmd 的 patch。
//
// setImageCrop 走裁剪窗口：画面矩形不动，外框和 srcRect 一起变。
import { z } from "zod";
import { SetCropFrameCmd, SetImageDescrCmd, SetShape3DCmd, SetShapeEffectsCmd, ZERO_CROP, cropHost, imageFrame, readCrop, setCropEdge, } from "@sliiu/present-editor/commands";
import { findShapeDeep } from "../summaries.js";
import { defineTool, err } from "../types.js";
const colorRe = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const colorSchema = z.string().regex(colorRe, "must be #rrggbb or #rrggbbaa");
export const effectTools = [
    // ============================================================================
    // 1) Shadow（投影）
    // ============================================================================
    defineTool({
        name: "setShapeShadow",
        description: [
            "Add or update a shape's drop shadow (§20.1.8.45 outerShdw / §20.1.8.40 innerShdw). One shadow per shape.",
            "Common patterns:",
            "  - Subtle UI card:      { blur: 8, dir: 90, dist: 4, color: '#000000', alpha: 0.15 }",
            "  - Strong cinematic:    { blur: 24, dir: 90, dist: 12, color: '#000000', alpha: 0.45 }",
            "  - Brand-tinted glow:   { kind: 'outer', blur: 16, dist: 6, color: '#1e40af', alpha: 0.35 }",
            "  - Inner depth (hollow): { kind: 'inner', blur: 10, dist: 2, color: '#000000', alpha: 0.3 }",
            "`dir` is direction in degrees (90 = below, 0 = right). Distance + direction implicitly derive dx/dy; pass dx/dy directly only for fine control.",
        ].join(" "),
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
            kind: z.enum(["outer", "inner"]).optional().describe("Default 'outer'."),
            blur: z.number().min(0).max(100).optional().describe("Blur radius in px. Default 4."),
            dir: z.number().min(0).max(360).optional().describe("Direction in degrees. Default 90 (downward)."),
            dist: z.number().min(0).max(100).optional().describe("Offset distance in px from shape edge. Default 4."),
            dx: z.number().min(-100).max(100).optional(),
            dy: z.number().min(-100).max(100).optional(),
            color: colorSchema.optional().describe("Shadow color, default #000000."),
            alpha: z.number().min(0).max(1).optional().describe("Shadow opacity 0..1, default 0.4."),
        }),
        tags: ["mutate", "effect"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId, ...patch }) => rt.apply(new SetShapeEffectsCmd(slideIdx, shapeId, { shadow: patch })),
    }),
    defineTool({
        name: "clearShapeShadow",
        description: "Remove a shape's drop shadow (sets shadow to null).",
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
        }),
        tags: ["mutate", "effect"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId }) => rt.apply(new SetShapeEffectsCmd(slideIdx, shapeId, { shadow: null })),
    }),
    // ============================================================================
    // 2) Glow（外发光）
    // ============================================================================
    defineTool({
        name: "setShapeGlow",
        description: [
            "Add or update a shape's outer glow (§20.1.8.32 glow). Great for: emphasizing a CTA button, making a chip pop, neon accents on dark themes.",
            "Examples:",
            "  - Soft brand glow on dark:  { radius: 16, color: '#3b82f6', alpha: 0.6 }",
            "  - Subtle hover ring:        { radius: 8,  color: '#ffffff', alpha: 0.4 }",
            "  - Neon-style heavy glow:    { radius: 32, color: '#ec4899', alpha: 0.8 }",
        ].join(" "),
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
            radius: z.number().min(1).max(100).describe("Glow radius in px."),
            color: colorSchema,
            alpha: z.number().min(0).max(1).optional().describe("Default 0.6."),
        }),
        tags: ["mutate", "effect"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId, radius, color, alpha }) => rt.apply(new SetShapeEffectsCmd(slideIdx, shapeId, { glow: { radius, color, ...(alpha !== undefined ? { alpha } : {}) } })),
    }),
    defineTool({
        name: "clearShapeGlow",
        description: "Remove a shape's glow.",
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
        }),
        tags: ["mutate", "effect"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId }) => rt.apply(new SetShapeEffectsCmd(slideIdx, shapeId, { glow: null })),
    }),
    // ============================================================================
    // 3) Soft edge（柔化边缘）
    // ============================================================================
    defineTool({
        name: "setShapeSoftEdge",
        description: "Soften a shape's edges with a fade (§20.1.8.58 softEdge). Common on photos to blend into backgrounds. `radius` 2..10 = subtle, 12..30 = strong vignette.",
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
            radius: z.number().min(1).max(100),
        }),
        tags: ["mutate", "effect"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId, radius }) => rt.apply(new SetShapeEffectsCmd(slideIdx, shapeId, { softEdge: { radius } })),
    }),
    defineTool({
        name: "clearShapeSoftEdge",
        description: "Remove a shape's soft-edge.",
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
        }),
        tags: ["mutate", "effect"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId }) => rt.apply(new SetShapeEffectsCmd(slideIdx, shapeId, { softEdge: null })),
    }),
    // ============================================================================
    // 4) Reflection（倒影）
    // ============================================================================
    defineTool({
        name: "setShapeReflection",
        description: [
            "Add or update a shape's reflection (§20.1.8.50 reflection). Use sparingly — typical on product hero shots / device mockups.",
            "Defaults: blur=4, startAlpha=0.5, endAlpha=0, dist=4, dir=90 (downward).",
        ].join(" "),
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
            blur: z.number().min(0).max(40).optional(),
            startAlpha: z.number().min(0).max(1).optional(),
            endAlpha: z.number().min(0).max(1).optional(),
            dist: z.number().min(0).max(60).optional(),
            dir: z.number().min(0).max(360).optional(),
        }),
        tags: ["mutate", "effect"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId, ...patch }) => rt.apply(new SetShapeEffectsCmd(slideIdx, shapeId, { reflection: patch })),
    }),
    defineTool({
        name: "clearShapeReflection",
        description: "Remove a shape's reflection.",
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
        }),
        tags: ["mutate", "effect"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId }) => rt.apply(new SetShapeEffectsCmd(slideIdx, shapeId, { reflection: null })),
    }),
    // ============================================================================
    // 5) Blur（模糊）— 整体高斯模糊
    // ============================================================================
    defineTool({
        name: "setShapeBlur",
        description: "Apply gaussian blur to a shape (§20.1.8.15 blur). Useful for backdrop / depth-of-field photos. `radius` 2..8 = subtle, 10..30 = obvious.",
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
            radius: z.number().min(0).max(100),
            grow: z.boolean().optional().describe("Default false. When true the blur extends beyond shape bounds."),
        }),
        tags: ["mutate", "effect"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId, radius, grow }) => rt.apply(new SetShapeEffectsCmd(slideIdx, shapeId, { blur: { radius, ...(grow !== undefined ? { grow } : {}) } })),
    }),
    defineTool({
        name: "clearShapeBlur",
        description: "Remove a shape's blur.",
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
        }),
        tags: ["mutate", "effect"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId }) => rt.apply(new SetShapeEffectsCmd(slideIdx, shapeId, { blur: null })),
    }),
    // ============================================================================
    // 6) 一键清理所有视觉效果
    // ============================================================================
    defineTool({
        name: "clearShapeEffects",
        description: "Remove ALL visual effects (shadow + glow + softEdge + reflection + blur) from a shape in a single call.",
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
        }),
        tags: ["mutate", "effect"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId }) => rt.apply(new SetShapeEffectsCmd(slideIdx, shapeId, {
            shadow: null,
            glow: null,
            softEdge: null,
            reflection: null,
            blur: null,
        })),
    }),
    // ============================================================================
    // 7) Image crop（裁切）
    // ============================================================================
    defineTool({
        name: "setImageCrop",
        description: [
            "Crop the window of a picture, video, or image-filled shape (§20.1.8.55 srcRect). The picture's pixel rectangle on the slide stays put; the visible window (bbox) moves.",
            "Each value is the fraction cut from that edge of the full picture. 0.1 on the right hides the right 10% and shrinks the window. Negative values let the window extend past the picture. Omit an edge to leave it.",
            "Works on image and video shapes, and on shapes whose fill is a stretched image. Not for tiled fills, audio, or locked shapes.",
            "Pass `clear: true` to show the whole picture again.",
        ].join(" "),
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
            l: z.number().min(-0.5).max(0.9).optional(),
            t: z.number().min(-0.5).max(0.9).optional(),
            r: z.number().min(-0.5).max(0.9).optional(),
            b: z.number().min(-0.5).max(0.9).optional(),
            clear: z.boolean().optional(),
        }),
        tags: ["mutate", "effect"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, l, t, r, b, clear }) => {
            const slide = rt.getPres().slides[slideIdx];
            const shape = slide ? findShapeDeep(slide, shapeId) : undefined;
            if (!shape)
                return err(`Shape ${shapeId} not found on slide ${slideIdx}.`);
            if (!cropHost(shape)) {
                return err("Crop applies to a picture, a video, or a shape with a stretched image fill.");
            }
            const picture = imageFrame(shape.bbox, readCrop(shape));
            if (clear)
                return rt.apply(new SetCropFrameCmd(slideIdx, shapeId, picture, { ...ZERO_CROP }));
            const edges = { l, t, r, b };
            if (l === undefined && t === undefined && r === undefined && b === undefined) {
                return err("Pass at least one edge (l, t, r, b) or clear: true.");
            }
            let window = { ...shape.bbox };
            let crop = readCrop(shape);
            for (const edge of ["l", "t", "r", "b"]) {
                const value = edges[edge];
                if (value === undefined)
                    continue;
                const next = setCropEdge(window, crop, edge, value);
                window = next.window;
                crop = next.crop;
            }
            return rt.apply(new SetCropFrameCmd(slideIdx, shapeId, window, crop));
        },
    }),
    defineTool({
        name: "setImageDescr",
        description: "Set or clear the alt-text / description (cNvPr descr) on an image shape. Pass an empty string to clear. Use for accessibility and export alt text.",
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
            descr: z.string(),
        }),
        tags: ["mutate", "effect"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, descr }) => rt.apply(new SetImageDescrCmd(slideIdx, shapeId, descr)),
    }),
    defineTool({
        name: "setShape3D",
        description: "Patch a shape's 3D properties (sp3d / scene3d): extrusionH in px, cameraPrst (orthographicFront / isometricLeftDown / …), prstMaterial (plastic / metal / warmMatte / …). Pass clear=true to remove all 3D.",
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
            clear: z.boolean().optional(),
            extrusionH: z.number().min(0).max(200).optional(),
            cameraPrst: z.string().optional(),
            prstMaterial: z.string().optional(),
        }),
        tags: ["mutate", "effect"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, ...patch }) => rt.apply(new SetShape3DCmd(slideIdx, shapeId, patch)),
    }),
];
