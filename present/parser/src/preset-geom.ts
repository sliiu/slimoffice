import type { Rect } from "@ppt/core";
import {
  adjFromAdjustHandleDrag,
  evalPresetAdjustHandles,
  evalPresetDef,
  type FillMod,
  type ResolvedAdjustHandle,
  type SubPath,
} from "./cust-geom";
import { OFFICIAL_PRESETS } from "./preset-shapes.gen";

export type { FillMod };

export interface PresetSubPath {
  d: string;
  fillMod: FillMod;
  stroke: boolean;
}

export interface PresetResult {
  kind: "rect" | "ellipse" | "path" | "polygon" | "line" | "multiPath";
  rx?: number;
  ry?: number;
  d?: string;
  points?: Array<[number, number]>;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  paths?: PresetSubPath[];
}

function presetFromDef(
  def: import("./cust-geom").PresetDef,
  bbox: Rect,
  adj: Record<string, number>,
): PresetResult | null {
  const result = evalPresetDef(def, bbox, adj);
  if (!result.paths || result.paths.length === 0) return null;
  // Collapse to a single `<path>` only when the preset truly is one filled
  // path with no stroke-only ornaments and no per-path fill modulation.
  // ECMA-376 ornaments like scroll curls use `fill="none"` paths whose stroke
  // we MUST preserve, so any such mix forces multiPath rendering.
  const allNormStroke =
    result.paths.length === 1 &&
    result.paths[0]!.fillMod === "norm" &&
    result.paths[0]!.stroke;
  if (allNormStroke) {
    return { kind: "path", d: result.paths[0]!.d };
  }
  const paths: PresetSubPath[] = result.paths.map((p: SubPath) => ({
    d: p.d,
    fillMod: p.fillMod,
    stroke: p.stroke,
  }));
  return { kind: "multiPath", paths };
}

// ECMA-376 §20.1.9.15 — DrawingML 路径的填充约定使用偶奇填充：当一条 path 内有
// 多条子路径（M…Z…M…Z），后续子路径在外层封闭区域内会成为「孔」（hole），渲染
// 出 noSmoking 的禁止符内圈、verticalScroll 卷边内圆、actionButton 三角缺口等
// 几何造型。SVG 默认是 nonzero（按缠绕数判断），用 nonzero 会把孔填满；这里在
// 路径包含 ≥2 个 `M`（即真正含子路径）时显式设置 fillRule="evenodd"。
export function pathHasSubPaths(d: string): boolean {
  if (!d) return false;
  let count = 0;
  for (let i = 0; i < d.length; i++) {
    const c = d[i];
    if (c === "M" || c === "m") {
      count++;
      if (count >= 2) return true;
    }
  }
  return false;
}

// All preset shape geometry now flows through the official OOXML
// presetShapeDefinitions.xml (bundled as `preset-shapes.gen.ts`). For the few
// names where a native primitive renders better than a path (rect/ellipse for
// example), we expose a thin wrapper that the renderer can specialize.
export function presetToShape(
  name: string,
  bbox: Rect,
  adj: Record<string, number> = {},
): PresetResult {
  switch (name) {
    case "rect":
      return { kind: "rect" };
    case "line":
    case "straightConnector1":
      return { kind: "line", x1: bbox.x, y1: bbox.y, x2: bbox.x + bbox.w, y2: bbox.y + bbox.h };
  }
  const officialDef = OFFICIAL_PRESETS[name];
  if (officialDef) {
    const r = presetFromDef(officialDef, bbox, adj);
    if (r) return r;
  }
  return { kind: "rect" };
}

export function officialPresetAdjDefaults(name: string): Record<string, number> | undefined {
  const def = OFFICIAL_PRESETS[name];
  if (!def?.avLst) return undefined;
  return { ...def.avLst };
}

export function listOfficialAdjustHandles(
  name: string,
  bbox: Rect,
  adj: Record<string, number> = {},
): ResolvedAdjustHandle[] {
  const def = OFFICIAL_PRESETS[name];
  if (!def) return [];
  return evalPresetAdjustHandles(def, bbox, adj);
}

export function dragOfficialAdjustHandle(
  name: string,
  bbox: Rect,
  adj: Record<string, number>,
  handleIndex: number,
  localX: number,
  localY: number,
): Record<string, number> {
  const def = OFFICIAL_PRESETS[name];
  if (!def) return { ...adj };
  return adjFromAdjustHandleDrag(def, bbox, adj, handleIndex, localX, localY);
}
