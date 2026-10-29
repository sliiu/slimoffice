"use strict";
// 动画基础工具：主流动效方案 / 清除动画 / 页间过渡 / 单个入场动画。
//
// 复用 @sliiu/present-animation 的 OOXML preset 子树模板：AI 只给一个语义化 effect 名
// （fade / fade-up / zoom-soft ...），由 animations.ts 翻译为 (presetClass,
// presetID, durationMs) 写入 slide.ooxmlTiming.tnLst。所有改动走 EditCommand
// 因此带 undo / redo 支持。
Object.defineProperty(exports, "__esModule", { value: true });
exports.animationBasicTools = void 0;
const zod_1 = require("zod");
const commands_1 = require("@sliiu/present-editor/commands");
const animation_commands_1 = require("../commands/animation-commands");
const animations_1 = require("../../animations");
const types_1 = require("../types");
const effectEnum = zod_1.z
    .enum(animations_1.MAINSTREAM_EFFECT_LIST)
    .describe("Mainstream entrance effect name. Picks: fade-up (default for titles), fade (default for bullets/body), zoom-soft (images), float-up (hero), zoom, glide, wipe (table headers), fade-down, appear (instant).");
exports.animationBasicTools = [
    (0, types_1.defineTool)({
        name: "applyMainstreamAnimations",
        description: [
            "Apply a curated 'mainstream aesthetic' motion scheme to one slide or the entire deck. This sets BOTH entrance animations on shapes AND a slide-to-slide transition.",
            "Pick a `style` based on the deck's design language:",
            "  - `minimal`   (default for business/SaaS/technical): restrained fade-up + fade, no slide transition.",
            "  - `cinematic` (default for dark/launch keynote): slower, dramatic, fade between slides.",
            "  - `editorial` (default for academic/magazine/serif): snappy fade-up, subtle fade transition.",
            "  - `playful`   (default for creative/brand/vibrant): energetic zoom/fade-up, push transition.",
            "Omit `style` to let the system pick automatically based on the current theme.",
            "Replaces any existing animations + transition on the targeted slides. Use when the user asks for animations, motion, transitions, or a 'nicer feel'.",
        ].join(" "),
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z
                .number()
                .int()
                .min(0)
                .optional()
                .describe("Target slide index (0-based). Omit to apply to the entire deck."),
            style: zod_1.z
                .enum(animations_1.MOTION_BUNDLE_IDS)
                .optional()
                .describe("Motion bundle. Omit to auto-pick based on the current theme."),
            maxEffectsPerSlide: zod_1.z
                .number()
                .int()
                .min(1)
                .max(12)
                .optional()
                .describe("Optional cap on click steps per slide. Omit so each item in a spread series waits for its own click. Past the cap, further units appear with the last click, still as whole units."),
            applySlideTransition: zod_1.z
                .boolean()
                .optional()
                .describe("If false, skip writing slide-to-slide transition. Default true."),
        }),
        tags: ["mutate", "animation"],
        execute: (rt, { slideIdx, style, maxEffectsPerSlide, applySlideTransition }) => {
            const opts = {};
            if (style !== undefined)
                opts.bundleId = style;
            if (maxEffectsPerSlide !== undefined)
                opts.maxEffects = maxEffectsPerSlide;
            if (applySlideTransition !== undefined)
                opts.applySlideTransition = applySlideTransition;
            return rt.apply(new animation_commands_1.ApplyAutoAnimationsCmd(slideIdx, opts));
        },
    }),
    (0, types_1.defineTool)({
        name: "clearAnimations",
        description: "Remove ALL motion from a slide (or the entire deck if slideIdx omitted) — both entrance animations AND the slide-to-slide transition. Use when the user asks for a static / calm / non-animated presentation. If you only want to remove the transition (keep entrance animations), call `setSlideTransition` with kind=\"cut\" instead.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0).optional(),
        }),
        tags: ["mutate", "animation"],
        execute: (rt, { slideIdx }) => rt.apply(new animation_commands_1.ClearSlideAnimationsCmd(slideIdx)),
    }),
    // 页间过渡：单独的 tool，让用户能"只换某一页的过渡"或"给整个 deck 换成 morph"。
    // duration 单位 *秒*（与 SlideTransition.duration 一致，注意不是 ms）。
    (0, types_1.defineTool)({
        name: "setSlideTransition",
        description: [
            "Set the slide-to-slide transition. Pick `kind` based on tone:",
            "  - `cut` (no transition) for technical/data-heavy decks.",
            "  - `fade` (universal, calm) for keynote / editorial / business.",
            "  - `push` / `cover` (energetic) for creative / brand / consumer.",
            "  - `morph` for visually-continuous slides where shared elements should animate between positions.",
            "  - `cube` / `pageCurl` / `flip` for showcase / cinematic moments — use sparingly (~1-2 per deck max).",
            "Pass `applyAll: true` to set the same transition on every slide (recommended for consistency).",
            "Note: `duration` is in SECONDS (typical 0.4-0.8s).",
        ].join(" "),
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z
                .number()
                .int()
                .min(0)
                .describe("Slide index. Ignored when applyAll=true (still required as an anchor)."),
            kind: zod_1.z
                .enum([
                "cut",
                "fade",
                "push",
                "cover",
                "uncover",
                "wipe",
                "split",
                "zoom",
                "morph",
                "cube",
                "flip",
                "pageCurl",
                "doors",
                "circle",
                "ripple",
            ])
                .describe("Transition kind. Use `cut` to clear (no transition)."),
            durationSec: zod_1.z
                .number()
                .min(0)
                .max(3)
                .optional()
                .describe("Duration in seconds (typical 0.4-0.8). Default 0.6."),
            applyAll: zod_1.z
                .boolean()
                .optional()
                .describe("Apply the same transition to every slide in the deck. Default false (only `slideIdx`)."),
        }),
        tags: ["mutate", "animation"],
        execute: (rt, { slideIdx, kind, durationSec, applyAll }) => {
            // cut + duration 0 ⇒ runTransition 跳过；与 PowerPoint 一致。
            const transition = kind === "cut" ? { kind: "cut", duration: 0 } : { kind, duration: durationSec ?? 0.6 };
            return rt.apply(new commands_1.SetSlideTransitionCmd(slideIdx, transition, applyAll ?? false));
        },
    }),
    (0, types_1.defineTool)({
        name: "addAnimation",
        description: "Add a single entrance animation to a shape. Prefer this over applyMainstreamAnimations when the user wants to tweak one element. Effects are appended to the slide's main sequence; default trigger is `afterPrevious` (auto-chains with prior effect). Avoid stacking more than 3 animations on one shape.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            effect: effectEnum,
            trigger: zod_1.z
                .enum(["onClick", "withPrevious", "afterPrevious"])
                .optional()
                .describe("Default afterPrevious."),
            durationMs: zod_1.z
                .number()
                .int()
                .min(50)
                .max(2000)
                .optional()
                .describe("Override default duration. Stay within 250–500ms for mainstream feel."),
            delayMs: zod_1.z.number().int().min(0).max(5000).optional(),
        }),
        tags: ["mutate", "animation"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, effect, trigger, durationMs, delayMs }) => {
            const args = { effect };
            if (trigger !== undefined)
                args.trigger = trigger;
            if (durationMs !== undefined)
                args.durationMs = durationMs;
            if (delayMs !== undefined)
                args.delayMs = delayMs;
            return rt.apply(new animation_commands_1.AddAnimationCmd(slideIdx, shapeId, args));
        },
    }),
];
