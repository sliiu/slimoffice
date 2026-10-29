// AI 动画时间线深度编辑工具集。
//
// 与 packages/ai/src/tools/index.ts 已有的 `addAnimation` / `applyMainstreamAnimations` /
// `clearAnimations` 互补：那几个是"加 / 批量 / 清"，本文件覆盖"对 timeline 中已有
// effect 做精确调整"——
//   - listSlideAnimations：返回某页所有 effect（id / trigger / preset / duration / delay /
//     easing accel|decel），让模型先看清当前状态再下手；
//   - updateAnimation：patch 单条 effect：trigger / duration / delay / iterations /
//     autoReverse / 缓动曲线 accel|decel；
//   - removeAnimation：按 id 删；
//   - reorderAnimation：移动到新 index；
//   - setAnimationEasing：缓动曲线的语义封装（"ease / easeIn / easeOut / linear /
//     cubic / quint"）→ 映射成 OOXML accel/decel ST_PositiveFixedPercentage；
//   - addEmphasisAnimation / addExitAnimation / addMotionPathAnimation：填补 entrance 之外
//     的动画类别（emph/exit/path），分别给 AI 一组常用 preset 名（与 OOXML §19.5.13
//     直接对齐）。
//
// 关键设计：
//   - 所有改动走 rt.apply（@ppt/editor 的命令栈），自动支持 undo。
//   - effectId 直接复用 buildEffectList 的稳定派生 id（"eff_<topIdx>_<cTnId>_<parentPath>"），
//     与编辑器 panel/timeline 一致；UI 上选中的 effect 与 AI 操作的 effect 一致。
//   - LLM 通过 listSlideAnimations 拿到当前 effects 列表后，**必须**用返回的 effectId
//     来调 update/remove/reorder —— 严禁自己拼 id。

import { z } from "zod";
import {
  AddAnimEffectCmd,
  MoveAnimEffectCmd,
  RemoveAnimEffectCmd,
  SetAnimEffectPropCmd,
  CopyShapeAnimationsCmd,
  buildEffectList,
  type Effect,
  type EffectClass,
  type EffectPath,
} from "@ppt/editor/commands";
import { defineTool, ok, err, type ToolRuntime } from "../types";

// ----------------------------------------------------------------------------
// 常用 emphasis preset name -> OOXML id（§19.5.13）。让 LLM 用语义名表达
// "颜色脉冲 / 旋转 / 抖动 / 放大缩小 / 闪烁"，避免硬背 OOXML 数字 id。
// ----------------------------------------------------------------------------
const EMPHASIS_PRESETS: Record<string, number> = {
  "pulse": 30,                  // Lighten — 轻快 pulse 视觉
  "color-pulse": 1,             // Change Fill Color
  "spin": 8,                    // Spin
  "grow-shrink": 6,             // Grow / Shrink
  "teeter": 32,                 // Teeter
  "shimmer": 36,                // Shimmer
  "flash-bulb": 26,             // Flash Bulb
  "wave": 34,                   // Wave
  "blink": 35,                  // Blink
  "transparency": 9,            // Transparency
  "bold-flash": 10,             // Bold Flash
};

// 常用 exit preset name -> OOXML id（§19.5.13）。与 entrance 1:1 配对，但
// 仅暴露最直觉的几种。
const EXIT_PRESETS: Record<string, number> = {
  "disappear": 1,
  "fade": 10,
  "fade-down": 42,              // Descend out
  "fade-up": 47,                // Ascend out
  "fly-out": 2,
  "wipe": 22,
  "zoom-out": 23,
  "shrink": 14,                 // Shrink & Turn (近似)
};

// 常用 motion path preset name -> OOXML id（§19.4.39 / motion-paths.ts）。
// 仅暴露 ~12 个高频 path；其余可通过 preset id 数字直接调用。
const MOTION_PATH_PRESETS: Record<string, number> = {
  "right": 6,
  "left": 5,
  "up": 7,
  "down": 3,
  "diagonal-dr": 1,             // 右下 0.4,0.4
  "diagonal-ur": 2,             // 右上 0.4,-0.4
  "circle": 9,
  "arc": 33,
  "wave": 49,
  "loop": 19,
  "spiral": 51,
  "zigzag": 44,
};

const triggerEnum = z.enum(["onClick", "withPrevious", "afterPrevious"]);

// 缓动曲线语义。OOXML 用 (accel, decel) 表达："开始有多平滑 + 结束有多平滑"，
// 单位 ST_PositiveFixedPercentage（0..100000，1000=1%）。常见 CSS 风格映射：
//   - linear       → accel=0,    decel=0
//   - ease-in      → accel=70000, decel=0      （慢启动）
//   - ease-out     → accel=0,    decel=70000   （慢结束，PowerPoint 默认）
//   - ease-in-out  → accel=50000, decel=50000  （两端都慢）
//   - smooth       → accel=30000, decel=30000  （轻度两端缓和）
//   - snap         → accel=0,    decel=15000   （末端轻微减速）
// 这些是 PowerPoint UI 常出现的"Smooth start / Smooth end"对应数值；不需要 LLM
// 直接拼数字。
const EASING_PRESETS: Record<string, { accel: number; decel: number }> = {
  linear:        { accel: 0,      decel: 0 },
  "ease-in":     { accel: 70000,  decel: 0 },
  "ease-out":    { accel: 0,      decel: 70000 },
  "ease-in-out": { accel: 50000,  decel: 50000 },
  smooth:        { accel: 30000,  decel: 30000 },
  snap:          { accel: 0,      decel: 15000 },
};

const easingEnum = z.enum([
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "smooth",
  "snap",
]);

export const animationEditTools = [
  // ---------------------------------------------------------------------------
  // 1) 列出某页所有 effect
  // ---------------------------------------------------------------------------
  defineTool({
    name: "listSlideAnimations",
    description: [
      "List all entrance/emphasis/exit/motion-path effects on a slide's main timing sequence.",
      "Returns effect objects with: `id` (use it verbatim in update/remove/reorder), `targetShapeId`, `presetClass` (entr/emph/exit/path/media), `presetId`, `trigger`, `durationMs`, `delayMs`, `accel`/`decel` (easing %), `iterations`.",
      "Call this BEFORE updateAnimation / removeAnimation / reorderAnimation — you need the live id (PowerPoint cTn id), not the shape id.",
    ].join(" "),
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
    }),
    tags: ["read", "animation"],
    execute: async (rt, { slideIdx }) => {
      const pres = rt.getPres();
      const slide = pres.slides[slideIdx];
      if (!slide) return err(`slideIdx ${slideIdx} out of range`);
      const list = buildEffectList(slide.ooxmlTiming);
      return ok({
        slideIdx,
        count: list.length,
        effects: list.map((e, i) => ({
          index: i,
          id: e.id,
          targetShapeId: e.targetShapeId,
          presetClass: e.presetClass,
          presetId: e.presetId,
          trigger: e.trigger,
          durationMs: e.durationMs,
          delayMs: e.delayMs,
          accel: e.accel ?? 0,
          decel: e.decel ?? 0,
          iterations: e.iterations === Infinity ? "indefinite" : e.iterations,
          autoReverse: e.autoReverse,
        })),
      });
    },
  }),

  // ---------------------------------------------------------------------------
  // 2) Patch 已有 effect 的 timing / trigger / easing
  // ---------------------------------------------------------------------------
  defineTool({
    name: "updateAnimation",
    description: [
      "Patch ONE existing animation effect on a slide. Resolve the target via `id` (from listSlideAnimations).",
      "Patchable fields (all optional):",
      "  - `trigger`        onClick / withPrevious / afterPrevious — restructures play order.",
      "  - `durationMs`     overall effect duration (50..6000). Internal keyframes scale proportionally.",
      "  - `delayMs`        delay before the effect starts (0..10000).",
      "  - `iterations`     repeat N times. Pass 'indefinite' to loop forever.",
      "  - `autoReverse`    play forwards then reverse.",
      "  - `easing`         CSS-style curve: linear / ease-in / ease-out / ease-in-out / smooth / snap. Mapped to OOXML accel/decel.",
      "  - `accel` / `decel` direct % overrides for the OOXML accel/decel fields (0..100). Use ONLY for very fine tuning — prefer `easing`.",
      "  - `presetSubtype` direction for direction-aware effects (Fly In / Wipe etc.), OOXML bit flags: 1 top, 2 right, 4 bottom, 8 left; corners add up (3 top-right, 6 bottom-right, 12 bottom-left, 9 top-left); Blinds-style axis 5 vertical / 10 horizontal.",
      "Pass exactly the fields you want to change; omitted fields stay as-is.",
    ].join(" "),
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      id: z.string().describe("Effect id from listSlideAnimations."),
      trigger: triggerEnum.optional(),
      durationMs: z.number().int().min(50).max(6000).optional(),
      delayMs: z.number().int().min(0).max(10000).optional(),
      iterations: z.union([z.number().int().min(1).max(99), z.literal("indefinite")]).optional(),
      autoReverse: z.boolean().optional(),
      easing: easingEnum.optional(),
      accel: z.number().min(0).max(100).optional().describe("Smooth start % (0..100). Maps to OOXML accel = pct*1000."),
      decel: z.number().min(0).max(100).optional().describe("Smooth end % (0..100). Maps to OOXML decel = pct*1000."),
      presetSubtype: z.number().int().min(0).max(64).optional(),
    }),
    tags: ["mutate", "animation"],
    execute: async (rt, args) => {
      const path = resolveEffectPath(rt, args.slideIdx, args.id);
      if (!path) return err(`effect id "${args.id}" not found on slide ${args.slideIdx}. Call listSlideAnimations first.`);
      const patch: Record<string, unknown> = {};
      if (args.trigger !== undefined) patch.trigger = args.trigger;
      if (args.durationMs !== undefined) patch.durationMs = args.durationMs;
      if (args.delayMs !== undefined) patch.delayMs = args.delayMs;
      if (args.iterations !== undefined) {
        patch.iterations = args.iterations === "indefinite" ? Infinity : args.iterations;
      }
      if (args.autoReverse !== undefined) patch.autoReverse = args.autoReverse;
      // easing 优先级高于裸 accel/decel —— 先应用 preset，再让显式数值覆盖。
      if (args.easing !== undefined) {
        const e = EASING_PRESETS[args.easing]!;
        patch.accel = e.accel;
        patch.decel = e.decel;
      }
      if (args.accel !== undefined) patch.accel = Math.round(args.accel * 1000);
      if (args.decel !== undefined) patch.decel = Math.round(args.decel * 1000);
      if (args.presetSubtype !== undefined) patch.presetSubtype = args.presetSubtype;
      if (Object.keys(patch).length === 0) return err("No fields to patch.");
      return rt.apply(new SetAnimEffectPropCmd(args.slideIdx, path, patch as never));
    },
  }),

  // ---------------------------------------------------------------------------
  // 3) 缓动曲线快捷别名（仅 easing 这一件事；让 LLM 习惯调它）
  // ---------------------------------------------------------------------------
  defineTool({
    name: "setAnimationEasing",
    description: [
      "Convenience: set ONLY the easing curve of one animation effect. Map of named curves → OOXML accel/decel:",
      "  - linear       no easing (constant velocity)",
      "  - ease-in      slow start, fast end",
      "  - ease-out     fast start, slow end  (PowerPoint default for most preset effects)",
      "  - ease-in-out  slow at both ends     (snappy, polished)",
      "  - smooth       light easing both ends (most refined-looking)",
      "  - snap         tiny easing at end only (clipped, energetic)",
      "Prefer `updateAnimation { easing: ... }` if you also need to change duration etc.",
    ].join(" "),
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      id: z.string(),
      easing: easingEnum,
    }),
    tags: ["mutate", "animation"],
    execute: async (rt, { slideIdx, id, easing }) => {
      const path = resolveEffectPath(rt, slideIdx, id);
      if (!path) return err(`effect id "${id}" not found on slide ${slideIdx}`);
      const e = EASING_PRESETS[easing]!;
      return rt.apply(new SetAnimEffectPropCmd(slideIdx, path, { accel: e.accel, decel: e.decel } as never));
    },
  }),

  // ---------------------------------------------------------------------------
  // 4) 删除 effect
  // ---------------------------------------------------------------------------
  defineTool({
    name: "removeAnimation",
    description: "Remove ONE animation effect by id (from listSlideAnimations). Following effects shift up; trigger relationships re-evaluate at play time.",
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      id: z.string(),
    }),
    tags: ["mutate", "animation"],
    execute: async (rt, { slideIdx, id }) => {
      const path = resolveEffectPath(rt, slideIdx, id);
      if (!path) return err(`effect id "${id}" not found on slide ${slideIdx}`);
      return rt.apply(new RemoveAnimEffectCmd(slideIdx, path));
    },
  }),

  // ---------------------------------------------------------------------------
  // 5) 在 mainSeq 内重新排序
  // ---------------------------------------------------------------------------
  defineTool({
    name: "reorderAnimation",
    description: "Move an animation effect to a new index in the slide's main sequence. Index 0 = first. Useful when you want a later-inserted effect to play earlier.",
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      id: z.string(),
      newIndex: z.number().int().min(0),
    }),
    tags: ["mutate", "animation"],
    execute: async (rt, { slideIdx, id, newIndex }) => {
      const path = resolveEffectPath(rt, slideIdx, id);
      if (!path) return err(`effect id "${id}" not found on slide ${slideIdx}`);
      return rt.apply(new MoveAnimEffectCmd(slideIdx, path, newIndex));
    },
  }),

  // ---------------------------------------------------------------------------
  // 6) 添加 Emphasis 动画（preset 名 → OOXML id）
  // ---------------------------------------------------------------------------
  defineTool({
    name: "addEmphasisAnimation",
    description: [
      "Add an EMPHASIS animation (§19.5.13 presetClass=emph) on a shape. Use for: highlight key callouts after they appear, draw attention, hover-style pulses.",
      "Pick `preset` by intent:",
      "  - `pulse`        subtle lightness flash (most common; non-obtrusive)",
      "  - `color-pulse`  briefly shift fill hue back to original",
      "  - `spin`         360° rotate in place",
      "  - `grow-shrink`  scale up then back",
      "  - `teeter`       gentle rock side-to-side",
      "  - `shimmer`      faint sparkle",
      "  - `flash-bulb`   bright camera-flash blowout",
      "  - `wave`         a single sinus wave through the shape",
      "  - `blink`        quick on/off",
      "  - `transparency` partial fade out & in",
      "  - `bold-flash`   weight pulse to bold and back",
      "Default duration 2000ms, default trigger `afterPrevious`. Override with `durationMs` / `trigger` / `delayMs` if needed.",
    ].join(" "),
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      shapeId: z.string(),
      preset: z.enum(Object.keys(EMPHASIS_PRESETS) as [string, ...string[]]),
      trigger: triggerEnum.optional(),
      durationMs: z.number().int().min(100).max(6000).optional(),
      delayMs: z.number().int().min(0).max(10000).optional(),
      iterations: z.union([z.number().int().min(1).max(99), z.literal("indefinite")]).optional(),
    }),
    tags: ["mutate", "animation"],
    shapeScoped: true,
    execute: async (rt, { slideIdx, shapeId, preset, trigger, durationMs, delayMs, iterations }) => {
      const presetId = EMPHASIS_PRESETS[preset]!;
      const args: import("@ppt/editor").InsertEffectArgs = {
        targetShapeId: shapeId,
        presetClass: "emph",
        presetId,
        trigger: trigger ?? "afterPrevious",
        durationMs: durationMs ?? 2000,
      };
      if (delayMs !== undefined) args.delayMs = delayMs;
      const res = rt.apply(new AddAnimEffectCmd(slideIdx, args));
      if (!res.ok) return res;
      if (iterations !== undefined) {
        // 用 patch 再写一次 iterations；新加 effect 是 mainSeq 末尾，定位它的 path 较繁，
        // 让 buildEffectList 重新派生即可。
        const list = buildEffectList(rt.getPres().slides[slideIdx]?.ooxmlTiming);
        const last = list[list.length - 1];
        if (last) {
          rt.apply(new SetAnimEffectPropCmd(slideIdx, last.path, { iterations: iterations === "indefinite" ? Infinity : iterations } as never));
        }
      }
      return ok();
    },
  }),

  // ---------------------------------------------------------------------------
  // 7) 添加 Exit 动画
  // ---------------------------------------------------------------------------
  defineTool({
    name: "addExitAnimation",
    description: [
      "Add an EXIT animation (§19.5.13 presetClass=exit). Use to remove items from view: 'first show A, then make A vanish before showing B'.",
      "`preset` options:",
      "  - `disappear`  instant off",
      "  - `fade`       fade out (default for clean reveals)",
      "  - `fade-up`/`fade-down`  exit while drifting up/down",
      "  - `fly-out`    slide off-edge (direction via presetSubtype: 1 top, 2 right, 4 bottom, 8 left, corners add up)",
      "  - `wipe`       progressive reveal-then-hide",
      "  - `zoom-out`   shrink and fade",
      "  - `shrink`     shrink-and-rotate exit",
      "Default duration 500ms, default trigger `afterPrevious`.",
    ].join(" "),
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      shapeId: z.string(),
      preset: z.enum(Object.keys(EXIT_PRESETS) as [string, ...string[]]),
      trigger: triggerEnum.optional(),
      durationMs: z.number().int().min(50).max(4000).optional(),
      delayMs: z.number().int().min(0).max(10000).optional(),
    }),
    tags: ["mutate", "animation"],
    shapeScoped: true,
    execute: async (rt, { slideIdx, shapeId, preset, trigger, durationMs, delayMs }) => {
      const presetId = EXIT_PRESETS[preset]!;
      const args: import("@ppt/editor").InsertEffectArgs = {
        targetShapeId: shapeId,
        presetClass: "exit",
        presetId,
        trigger: trigger ?? "afterPrevious",
        durationMs: durationMs ?? 500,
      };
      if (delayMs !== undefined) args.delayMs = delayMs;
      return rt.apply(new AddAnimEffectCmd(slideIdx, args));
    },
  }),

  // ---------------------------------------------------------------------------
  // 8) 添加 Motion Path 动画
  // ---------------------------------------------------------------------------
  defineTool({
    name: "addMotionPathAnimation",
    description: [
      "Add a MOTION PATH animation (§19.4.39 presetClass=path) that moves a shape along a preset path.",
      "`preset` options:",
      "  - `right` / `left` / `up` / `down`  straight slide",
      "  - `diagonal-dr` / `diagonal-ur`      diagonal slide",
      "  - `circle`                            close loop around start",
      "  - `arc`                                quarter-arc",
      "  - `wave`                              left-right wave",
      "  - `loop` / `spiral`                   decorative loops",
      "  - `zigzag`                            short zigzag",
      "Default duration 2000ms, trigger `afterPrevious`. Path is OOXML-normalised: 1.0 = full slide width/height of travel — most paths use ~0.4 to stay on-canvas.",
    ].join(" "),
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      shapeId: z.string(),
      preset: z.enum(Object.keys(MOTION_PATH_PRESETS) as [string, ...string[]]),
      trigger: triggerEnum.optional(),
      durationMs: z.number().int().min(200).max(8000).optional(),
      delayMs: z.number().int().min(0).max(10000).optional(),
    }),
    tags: ["mutate", "animation"],
    shapeScoped: true,
    execute: async (rt, { slideIdx, shapeId, preset, trigger, durationMs, delayMs }) => {
      const presetId = MOTION_PATH_PRESETS[preset]!;
      const args: import("@ppt/editor").InsertEffectArgs = {
        targetShapeId: shapeId,
        presetClass: "path",
        presetId,
        trigger: trigger ?? "afterPrevious",
        durationMs: durationMs ?? 2000,
      };
      if (delayMs !== undefined) args.delayMs = delayMs;
      return rt.apply(new AddAnimEffectCmd(slideIdx, args));
    },
  }),

  // ---------------------------------------------------------------------------
  // 9) 通用 addAnimationByPreset —— 直接给 class + presetId 数字
  // ---------------------------------------------------------------------------
  defineTool({
    name: "addAnimationByPreset",
    description: [
      "Power-user escape hatch: insert ANY animation by raw OOXML (presetClass, presetID). Use ONLY when the named helpers above don't expose what you need.",
      "presetClass: 'entr' / 'emph' / 'exit' / 'path'.",
      "presetID: OOXML §19.5.13 id (e.g., entr 1 Appear / entr 23 Zoom / emph 30 Lighten / exit 22 Wipe).",
    ].join(" "),
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      shapeId: z.string(),
      presetClass: z.enum(["entr", "emph", "exit", "path"]),
      presetId: z.number().int().min(1).max(99),
      presetSubtype: z.number().int().min(0).max(64).optional(),
      trigger: triggerEnum.optional(),
      durationMs: z.number().int().min(50).max(8000).optional(),
      delayMs: z.number().int().min(0).max(10000).optional(),
    }),
    tags: ["mutate", "animation"],
    shapeScoped: true,
    execute: async (rt, a) => {
      const args: import("@ppt/editor").InsertEffectArgs = {
        targetShapeId: a.shapeId,
        presetClass: a.presetClass as EffectClass,
        presetId: a.presetId,
        trigger: a.trigger ?? "afterPrevious",
      };
      if (a.presetSubtype !== undefined) args.presetSubtype = a.presetSubtype;
      if (a.durationMs !== undefined) args.durationMs = a.durationMs;
      if (a.delayMs !== undefined) args.delayMs = a.delayMs;
      return rt.apply(new AddAnimEffectCmd(a.slideIdx, args));
    },
  }),

  defineTool({
    name: "copyShapeAnimations",
    description:
      "Copy every animation effect from one shape to another on the same slide (animation painter). Call listSlideAnimations first if you need to inspect the result. Existing effects on the target are kept and the copies are appended.",
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      sourceShapeId: z.string(),
      targetShapeId: z.string(),
    }),
    tags: ["mutate", "animation"],
    shapeScoped: true,
    execute: (rt, { slideIdx, sourceShapeId, targetShapeId }) =>
      rt.apply(new CopyShapeAnimationsCmd(slideIdx, sourceShapeId, targetShapeId)),
  }),
];

function resolveEffectPath(rt: ToolRuntime, slideIdx: number, id: string): EffectPath | null {
  const slide = rt.getPres().slides[slideIdx];
  if (!slide) return null;
  const list: Effect[] = buildEffectList(slide.ooxmlTiming);
  const found = list.find((e) => e.id === id);
  return found ? found.path : null;
}
