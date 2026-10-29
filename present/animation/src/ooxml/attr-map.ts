// ECMA-376 §19.5.5 attrNameLst 中允许的 OOXML 属性名清单。
// 这里把 OOXML 属性名映射到统一的运行时 property。
// 解码函数把字符串值规约为标量（number/color/string/bool），并对带"百分比/角度"语义的属性进行单位转换。

import { evalExpr, evalNumberValue } from "./expr";
import type { ColorResolveCtx } from "./color";
import type { SlideEnv, TargetBox } from "./types";

export type PropKind = "number" | "color" | "string" | "bool" | "point";

export interface DecodeCtx extends SlideEnv {
  bbox: TargetBox;
  // §20.1.2 scheme/sys color 解析需要主题配色表；compile 期透传到 decode 路径，
  // 让 decodeAnimVal / decodeTavValue 内部的 resolveAnimColor 拿到 schemeColors。
  colorCtx?: ColorResolveCtx;
}

export interface AttrSpec {
  property: string;
  kind: PropKind;
  // ECMA-376 §19.5.6 anim 的 from/to/values/tav.val 走 decode（绝对目标值）。
  decode?: (raw: string, ctx: DecodeCtx) => unknown;
  // anim 的 by 走 decodeBy（相对增量）。对绝大多数 prop，decodeBy === decode；
  // 但对 ppt_x/y（位置）与 ppt_w/h（尺寸），by 表示"位移/缩放变化"而非"绝对目标"，
  // 必须用独立的 decode 函数：v * slideDim，不做 bbox 偏移。
  decodeBy?: (raw: string, ctx: DecodeCtx) => unknown;
}

const stripQuotes = (s: string): string => s.replace(/^['"]|['"]$/g, "");

const dropQ = (r: string): string => stripQuotes(r).trim();

const decodeNumber = (r: string, ctx: DecodeCtx): number => evalExpr(r, { ...ctx, bbox: ctx.bbox });

const decodePosX = (r: string, ctx: DecodeCtx): number => {
  const v = evalExpr(r, { ...ctx, bbox: ctx.bbox });
  return v * ctx.slideWidth - ctx.bbox.x - ctx.bbox.w / 2;
};

const decodePosY = (r: string, ctx: DecodeCtx): number => {
  const v = evalExpr(r, { ...ctx, bbox: ctx.bbox });
  return v * ctx.slideHeight - ctx.bbox.y - ctx.bbox.h / 2;
};

const decodeWScale = (r: string, ctx: DecodeCtx): number => {
  const v = evalExpr(r, { ...ctx, bbox: ctx.bbox });
  const target = v * ctx.slideWidth;
  return ctx.bbox.w > 0 ? target / ctx.bbox.w : 1;
};

const decodeHScale = (r: string, ctx: DecodeCtx): number => {
  const v = evalExpr(r, { ...ctx, bbox: ctx.bbox });
  const target = v * ctx.slideHeight;
  return ctx.bbox.h > 0 ? target / ctx.bbox.h : 1;
};

// by 解码：相对位移/缩放变化，只缩放 slide 维度，不做 bbox 偏移。
const decodeByPosX = (r: string, ctx: DecodeCtx): number => {
  const v = evalExpr(r, { ...ctx, bbox: ctx.bbox });
  return v * ctx.slideWidth;
};

const decodeByPosY = (r: string, ctx: DecodeCtx): number => {
  const v = evalExpr(r, { ...ctx, bbox: ctx.bbox });
  return v * ctx.slideHeight;
};

const decodeByWScale = (r: string, ctx: DecodeCtx): number => {
  const v = evalExpr(r, { ...ctx, bbox: ctx.bbox });
  const targetDelta = v * ctx.slideWidth;
  return ctx.bbox.w > 0 ? targetDelta / ctx.bbox.w : 0;
};

const decodeByHScale = (r: string, ctx: DecodeCtx): number => {
  const v = evalExpr(r, { ...ctx, bbox: ctx.bbox });
  const targetDelta = v * ctx.slideHeight;
  return ctx.bbox.h > 0 ? targetDelta / ctx.bbox.h : 0;
};

const decodeRotation = (r: string, ctx: DecodeCtx): number => {
  const v = evalExpr(r, { ...ctx, bbox: ctx.bbox });
  return Math.abs(v) > 360 ? v / 60000 : v;
};

const decodeColor = (r: string): string => {
  const s = dropQ(r);
  if (s.startsWith("#")) return s;
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s}`;
  if (/^rgba?\(/i.test(s)) return s;
  return s;
};

const decodeBool = (r: string): boolean => {
  const s = dropQ(r).toLowerCase();
  return s === "visible" || s === "true" || s === "1" || s === "show";
};

const decodeOpacity = (r: string): number => {
  const v = evalNumberValue(r);
  if (v === undefined) return 1;
  return Math.abs(v) > 1.5 ? v / 100000 : v;
};

const decodeFontSize = (r: string): number => {
  const s = dropQ(r);
  const m = /^([\d.]+)(pt|px)?$/i.exec(s);
  if (!m) return Number(s) || 0;
  const v = Number(m[1]);
  return m[2]?.toLowerCase() === "pt" ? v * (96 / 72) : v;
};

const decodeFontWeight = (r: string): number => {
  const s = dropQ(r).toLowerCase();
  if (s === "bold") return 700;
  if (s === "normal") return 400;
  if (s === "lighter") return 200;
  if (s === "bolder") return 800;
  return Number(s) || 400;
};

const decodeUnderline = (r: string): string => {
  const s = dropQ(r).toLowerCase();
  if (s === "single" || s === "true" || s === "1") return "single";
  if (s === "double") return "double";
  return "none";
};

const decodeItalic = (r: string): boolean => {
  const s = dropQ(r).toLowerCase();
  return s === "italic" || s === "true" || s === "1";
};

const SPEC: Record<string, AttrSpec> = {
  "style.opacity": { property: "opacity", kind: "number", decode: decodeOpacity },
  "style.visibility": {
    property: "opacity",
    kind: "number",
    decode: (r) => (decodeBool(r) ? 1 : 0),
  },
  "style.display": {
    property: "opacity",
    kind: "number",
    decode: (r) => (dropQ(r).toLowerCase() === "none" ? 0 : 1),
  },
  "style.rotation": { property: "rotation", kind: "number", decode: decodeRotation },
  "style.color": { property: "fontColor", kind: "color", decode: decodeColor },
  "style.fontsize": { property: "fontSize", kind: "number", decode: decodeFontSize },
  "style.fontweight": { property: "fontWeight", kind: "number", decode: decodeFontWeight },
  "style.fontstyle": { property: "fontStyle", kind: "bool", decode: decodeItalic },
  "style.textdecoration": { property: "underline", kind: "string", decode: decodeUnderline },
  "style.textdecorationunderline": {
    property: "underline",
    kind: "string",
    decode: decodeUnderline,
  },
  "style.fontfamily": { property: "fontFamily", kind: "string", decode: dropQ },
  "style.text-color": { property: "fontColor", kind: "color", decode: decodeColor },
  ppt_x: { property: "tx", kind: "number", decode: decodePosX, decodeBy: decodeByPosX },
  ppt_y: { property: "ty", kind: "number", decode: decodePosY, decodeBy: decodeByPosY },
  ppt_w: { property: "scaleX", kind: "number", decode: decodeWScale, decodeBy: decodeByWScale },
  ppt_h: { property: "scaleY", kind: "number", decode: decodeHScale, decodeBy: decodeByHScale },
  ppt_c: { property: "fillColor", kind: "color", decode: decodeColor },
  ppt_r: { property: "rotation", kind: "number", decode: decodeRotation },
  r: { property: "rotation", kind: "number", decode: decodeRotation },
  xshear: { property: "scaleX", kind: "number", decode: decodeNumber },
  yshear: { property: "scaleY", kind: "number", decode: decodeNumber },
  imagedata: { property: "imageSrc", kind: "string", decode: dropQ },
  "fillcolor.rgb": { property: "fillColor", kind: "color", decode: decodeColor },
  fillcolor: { property: "fillColor", kind: "color", decode: decodeColor },
  "fill.color": { property: "fillColor", kind: "color", decode: decodeColor },
  "fill.color2": { property: "fillColor2", kind: "color", decode: decodeColor },
  "fill.on": {
    property: "fillOn",
    kind: "number",
    decode: (r) => (decodeBool(r) ? 1 : 0),
  },
  "fill.opacity": { property: "fillOpacity", kind: "number", decode: decodeOpacity },
  "fill.type": { property: "fillType", kind: "string", decode: dropQ },
  "stroke.color": { property: "strokeColor", kind: "color", decode: decodeColor },
  "stroke.weight": { property: "strokeWidth", kind: "number", decode: decodeNumber },
  "stroke.on": {
    property: "strokeOn",
    kind: "number",
    decode: (r) => (decodeBool(r) ? 1 : 0),
  },
  "stroke.opacity": { property: "strokeOpacity", kind: "number", decode: decodeOpacity },
  "stroke.dashstyle": { property: "strokeDash", kind: "string", decode: dropQ },
  "shadow.color": { property: "shadowColor", kind: "color", decode: decodeColor },
  "shadow.opacity": { property: "shadowOpacity", kind: "number", decode: decodeOpacity },
  "shadow.on": {
    property: "shadowOn",
    kind: "number",
    decode: (r) => (decodeBool(r) ? 1 : 0),
  },
};

export function lookupAttr(name: string): AttrSpec | undefined {
  const n = name.toLowerCase().replace(/\s+/g, "");
  return SPEC[n];
}
