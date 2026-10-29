// AI 艺术字工具集 —— 插入 / 编辑带描边、阴影、发光的样式化标题。
//
// 编辑器 ribbon 已有 WordArt dialog；这里暴露给 LLM，用于封面大标题、章节分隔字等场景。
// 与 insertTextBox / setRichText 的区别：艺术字默认更大、居中、带 outline/shadow preset。

import { z } from "zod";
import type { Shape, ShapeEffect, Stroke, TextRun } from "@ppt/core";
import { AddShapeCmd, EditTextCmd, SetTextStyleCmd, type TextStylePatch } from "@ppt/editor/commands";
import { WORDART_PRESETS, type WordArtGradient, type WordArtShadowKind } from "@ppt/editor/commands";
import { defineTool, ok, err } from "../types";

const colorRe = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const colorSchema = z.string().regex(colorRe, "must be #rrggbb or #rrggbbaa");

const PRESET_IDS = WORDART_PRESETS.map((p) => p.id) as [string, ...string[]];

type WordArtStyleInput = {
  text: string;
  preset?: string;
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  fillColor?: string;
  outlineColor?: string | null;
  outlineWidth?: number;
  fillGradient?: WordArtGradient | null;
  shadowKind?: WordArtShadowKind | null;
  shadowColor?: string;
};

function wordArtOutline(color: string, width: number): Stroke {
  return { paint: { kind: "solid", color }, width };
}

function wordArtEffectFor(
  kind: WordArtStyleInput["shadowKind"],
  color: string,
): ShapeEffect | null {
  if (!kind) return null;
  if (kind === "soft") return { kind: "outer", blur: 6, dx: 2, dy: 2, color, alpha: 0.45 };
  if (kind === "hard") return { kind: "outer", blur: 0, dx: 3, dy: 3, color, alpha: 1 };
  if (kind === "inner") return { kind: "inner", blur: 4, dx: 0, dy: 1.5, color, alpha: 0.65 };
  if (kind === "reflection") {
    return {
      kind: "reflection",
      blur: 0.5,
      startAlpha: 0.45,
      endAlpha: 0,
      startPos: 0,
      endPos: 0.55,
      dir: 90,
      dist: 2,
    };
  }
  return { kind: "glow", radius: 8, color, alpha: 0.7 };
}

function wordArtFill(st: WordArtStyleInput): TextRun["fill"] {
  const g = st.fillGradient;
  if (!g) return undefined;
  return {
    kind: "linear",
    angle: g.angle,
    stops: [
      { offset: 0, color: g.from },
      { offset: 1, color: g.to },
    ],
  };
}

function wordArtStateToRun(st: WordArtStyleInput): TextRun {
  const run: TextRun = {
    text: st.text,
    fontFamily: st.fontFamily ?? "Calibri, sans-serif",
    fontSize: st.fontSize ?? 54,
    fontWeight: st.bold === false ? 400 : 700,
    italic: !!st.italic,
    color: st.fillGradient?.from ?? st.fillColor ?? "#000000",
  };
  const fill = wordArtFill(st);
  if (fill) run.fill = fill;
  if (st.outlineColor) {
    run.textOutline = wordArtOutline(st.outlineColor, st.outlineWidth ?? 1);
  }
  const eff = wordArtEffectFor(st.shadowKind ?? null, st.shadowColor ?? "#000000");
  if (eff) run.effects = [eff];
  return run;
}

function wordArtStateToPatch(st: WordArtStyleInput): TextStylePatch {
  const eff = wordArtEffectFor(st.shadowKind ?? null, st.shadowColor ?? "#000000");
  return {
    fontFamily: st.fontFamily,
    fontSize: st.fontSize,
    fontWeight: st.bold === false ? 400 : 700,
    italic: st.italic,
    color: st.fillGradient?.from ?? st.fillColor,
    fill: wordArtFill(st) ?? null,
    textOutline: st.outlineColor ? wordArtOutline(st.outlineColor, st.outlineWidth ?? 1) : undefined,
    effects: eff ? [eff] : undefined,
  };
}

function resolveStyle(input: WordArtStyleInput): WordArtStyleInput {
  const preset = input.preset
    ? WORDART_PRESETS.find((p) => p.id === input.preset)?.state
    : WORDART_PRESETS[0]?.state;
  const base = preset ?? WORDART_PRESETS[0]!.state;
  return {
    text: input.text,
    fontFamily: input.fontFamily ?? base.fontFamily,
    fontSize: input.fontSize ?? base.fontSize,
    bold: input.bold ?? base.bold,
    italic: input.italic ?? base.italic,
    fillColor: input.fillColor ?? base.fillColor,
    outlineColor: input.outlineColor !== undefined ? input.outlineColor : base.outlineColor,
    outlineWidth: input.outlineWidth ?? base.outlineWidth,
    fillGradient: input.fillGradient !== undefined ? input.fillGradient : base.fillGradient,
    shadowKind: input.shadowKind !== undefined ? input.shadowKind : base.shadowKind,
    shadowColor: input.shadowColor ?? base.shadowColor,
  };
}

function genShapeId(prefix = "wa"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function findWordArt(slide: import("@ppt/core").Slide, shapeId: string): import("@ppt/core").TextShape | null {
  const walk = (shapes: Shape[]): import("@ppt/core").TextShape | null => {
    for (const s of shapes) {
      if (s.id === shapeId && s.kind === "text" && s.name === "WordArt") return s;
      if (s.kind === "group") {
        const f = walk(s.children);
        if (f) return f;
      }
    }
    return null;
  };
  for (const layer of slide.layers) {
    const f = walk(layer.shapes);
    if (f) return f;
  }
  return null;
}

const styleFields = {
  preset: z
    .enum(PRESET_IDS)
    .optional()
    .describe(
      "WordArt gallery preset. Dark launch titles: fillAccent1GlowAccent2 / fillPurpleHardWhite. Outline-only: outlineAccent1.",
    ),
  fontFamily: z.string().optional(),
  fontSize: z.number().min(12).max(200).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  fillColor: z.union([colorSchema, z.literal("transparent")]).optional().describe('Use "transparent" for outline-only styles.'),
  outlineColor: colorSchema.nullable().optional(),
  outlineWidth: z.number().min(0).max(20).optional(),
  shadowKind: z.enum(["soft", "hard", "glow", "inner", "reflection"]).nullable().optional(),
  shadowColor: colorSchema.optional(),
};

export const wordArtTools = [
  defineTool({
    name: "listWordArtPresets",
    description:
      "List available WordArt gallery preset ids for insertWordArt / setWordArtStyle. Call before picking a preset for dark launch titles or outline-only styles.",
    inputSchema: z.object({}),
    tags: ["read", "wordart"],
    execute: async () =>
      ok({
        presets: WORDART_PRESETS.map((p) => ({
          id: p.id,
          hasOutline: !!p.state.outlineColor,
          shadow: p.state.shadowKind ?? "none",
          suggestedFor:
            p.id.includes("Glow") || p.id.includes("glow")
              ? "dark backgrounds, keynote heroes"
              : p.id === "outlineAccent1"
                ? "minimal outline-only titles"
                : "general display titles",
        })),
      }),
  }),

  defineTool({
    name: "insertWordArt",
    description: [
      "Insert stylized WordArt text (large display title with optional outline + shadow/glow).",
      "Use for cover heroes, section dividers, keynote-style headlines — NOT for body bullets (use insertTextBox / setRichText).",
      "Pick a `preset` from the PowerPoint-style gallery, then override fontSize / fillColor as needed.",
      "On dark backgrounds prefer presets with glow or white outline; ensure contrast vs slide bg (see ripple-check rules).",
    ].join(" "),
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      text: z.string().min(1).max(200),
      bbox: z
        .object({
          x: z.number(),
          y: z.number(),
          w: z.number().min(40),
          h: z.number().min(24),
        })
        .optional()
        .describe("Position in slide px. Default: centered, 480×100."),
      ...styleFields,
    }),
    tags: ["mutate", "wordart"],
    execute: async (rt, { slideIdx, text, bbox, ...style }) => {
      const pres = rt.getPres();
      const slide = pres.slides[slideIdx];
      if (!slide) return err(`slideIdx ${slideIdx} out of range`);
      const st = resolveStyle({ text, ...style });
      const w = bbox?.w ?? 480;
      const h = bbox?.h ?? 100;
      const cx = pres.size.width / 2;
      const cy = pres.size.height / 2;
      const shape: Shape = {
        id: genShapeId(),
        name: "WordArt",
        zIndex: 0,
        visible: true,
        locked: false,
        opacity: 1,
        bbox: bbox ?? { x: cx - w / 2, y: cy - h / 2, w, h },
        transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 },
        kind: "text",
        paragraphs: [{ align: "middle", runs: [wordArtStateToRun(st)] }],
        vAlign: "middle",
        wrap: false,
      } as Shape;
      const res = rt.apply(new AddShapeCmd(slideIdx, 0, shape));
      if (!res.ok) return res;
      return ok({ slideIdx, shapeId: shape.id });
    },
  }),

  defineTool({
    name: "setWordArtStyle",
    description: [
      "Edit an existing WordArt shape (name === 'WordArt'). Changes text and/or visual style (preset, fill, outline, shadow).",
      "Use listShapesOnSlide first to get the shapeId. For deck-wide title styling prefer edit_master_text_style instead.",
    ].join(" "),
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      shapeId: z.string(),
      text: z.string().min(1).max(200).optional(),
      ...styleFields,
    }),
    tags: ["mutate", "wordart"],
    shapeScoped: true,
    execute: async (rt, { slideIdx, shapeId, text, ...style }) => {
      const pres = rt.getPres();
      const slide = pres.slides[slideIdx];
      if (!slide) return err(`slideIdx ${slideIdx} out of range`);
      const target = findWordArt(slide, shapeId);
      if (!target) return err(`WordArt shape "${shapeId}" not found on slide ${slideIdx}`);
      const currentText = target.paragraphs[0]?.runs.map((r) => r.text).join("") ?? "";
      const st = resolveStyle({ text: text ?? currentText, ...style });
      if (text !== undefined) {
        const r = rt.apply(new EditTextCmd(slideIdx, shapeId, [st.text]));
        if (!r.ok) return r;
      }
      const patch = wordArtStateToPatch(st);
      return rt.apply(new SetTextStyleCmd(slideIdx, shapeId, patch));
    },
  }),
];
