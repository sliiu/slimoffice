import type { Rect } from "@ppt/core";
import { findByLocalName, findAllByLocalName, attr, orderedChildren, type XmlNode, stripNs } from "./xml";

export type FillMod = "norm" | "lighten" | "lightenLess" | "darken" | "darkenLess" | "none";

export interface SubPath {
  d: string;
  fillMod: FillMod;
  stroke: boolean;
}

export interface CustGeomResult {
  d: string;
  paths?: SubPath[];
  ahPositions?: Array<{ x: number; y: number }>;
  // ECMA-376 §20.1.9.10 cxnLst — 形状对外提供的连接点。
  // ang 单位为度（已从 60000ths 换算）。
  cxnPoints?: Array<{ x: number; y: number; ang?: number }>;
}

const PRESET_W = 21600;
const PRESET_H = 21600;

export function parseCustGeom(custGeom: XmlNode, bbox: Rect): string {
  return parseCustGeomFull(custGeom, bbox).d;
}

export function parseCustGeomFull(custGeom: XmlNode, bbox: Rect): CustGeomResult {
  const avLst = findByLocalName(custGeom, "avLst");
  const gdLst = findByLocalName(custGeom, "gdLst");
  const guides = createGuides(PRESET_W, PRESET_H);
  if (avLst) evalGdList(avLst, guides);
  if (gdLst) evalGdList(gdLst, guides);
  const pathLst = findByLocalName(custGeom, "pathLst");
  const paths = findAllByLocalName(pathLst, "path");
  const parts: string[] = [];
  for (const p of paths) {
    const pw = Number(attr(p, "w") ?? String(PRESET_W));
    const ph = Number(attr(p, "h") ?? String(PRESET_H));
    const sx = pw > 0 ? bbox.w / pw : 1;
    const sy = ph > 0 ? bbox.h / ph : 1;
    parts.push(parsePathCommands(p, bbox.x, bbox.y, sx, sy, guides));
  }
  const ahPositions = collectAhPositions(custGeom, bbox, guides, PRESET_W, PRESET_H);
  const cxnPoints = collectCxnPoints(custGeom, bbox, guides, PRESET_W, PRESET_H);
  return { d: parts.join(" "), ahPositions, cxnPoints };
}

// ECMA-376 §20.1.9.10 cxnLst / §20.1.9.9 cxn — 连接点（pos.x, pos.y, ang）。
function collectCxnPoints(
  custGeom: XmlNode,
  bbox: Rect,
  guides: Map<string, number>,
  presetW: number,
  presetH: number,
): Array<{ x: number; y: number; ang?: number }> | undefined {
  const cxnLst = findByLocalName(custGeom, "cxnLst");
  if (!cxnLst) return undefined;
  const out: Array<{ x: number; y: number; ang?: number }> = [];
  for (const cxn of findAllByLocalName(cxnLst, "cxn")) {
    const pos = findByLocalName(cxn, "pos");
    if (!pos) continue;
    const xRaw = attr(pos, "x");
    const yRaw = attr(pos, "y");
    if (xRaw === undefined || yRaw === undefined) continue;
    const xVal = resolveLength(xRaw, guides);
    const yVal = resolveLength(yRaw, guides);
    const x = bbox.x + (xVal / presetW) * bbox.w;
    const y = bbox.y + (yVal / presetH) * bbox.h;
    const angRaw = attr(cxn, "ang");
    const point: { x: number; y: number; ang?: number } = { x, y };
    if (angRaw !== undefined) {
      const a = Number(angRaw);
      if (Number.isFinite(a)) point.ang = a / 60000;
    }
    out.push(point);
  }
  return out.length ? out : undefined;
}

function resolveLength(raw: string, guides: Map<string, number>): number {
  if (guides.has(raw)) return guides.get(raw)!;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function createGuides(w: number = PRESET_W, h: number = PRESET_H): Map<string, number> {
  const guides = new Map<string, number>();
  initBuiltins(guides, w, h);
  return guides;
}

function initBuiltins(guides: Map<string, number>, w: number, h: number): void {
  guides.set("w", w);
  guides.set("h", h);
  guides.set("l", 0);
  guides.set("t", 0);
  guides.set("r", w);
  guides.set("b", h);
  guides.set("wd2", w / 2);
  guides.set("hd2", h / 2);
  guides.set("hc", w / 2);
  guides.set("vc", h / 2);
  guides.set("ss", Math.min(w, h));
  guides.set("ls", Math.max(w, h));
  guides.set("ssd2", Math.min(w, h) / 2);
  guides.set("ssd4", Math.min(w, h) / 4);
  guides.set("ssd6", Math.min(w, h) / 6);
  guides.set("ssd8", Math.min(w, h) / 8);
  guides.set("ssd16", Math.min(w, h) / 16);
  guides.set("ssd32", Math.min(w, h) / 32);
  guides.set("hd3", h / 3);
  guides.set("hd4", h / 4);
  guides.set("hd5", h / 5);
  guides.set("hd6", h / 6);
  guides.set("hd8", h / 8);
  guides.set("wd3", w / 3);
  guides.set("wd4", w / 4);
  guides.set("wd5", w / 5);
  guides.set("wd6", w / 6);
  guides.set("wd8", w / 8);
  guides.set("wd10", w / 10);
  guides.set("wd32", w / 32);
  // PowerPoint angle units are 60,000-th degrees.
  guides.set("cd2", 10800000);
  guides.set("cd4", 5400000);
  guides.set("cd8", 2700000);
  guides.set("3cd4", 16200000);
  guides.set("3cd8", 8100000);
  guides.set("5cd8", 13500000);
  guides.set("7cd8", 18900000);
}

function evalGdList(node: XmlNode, guides: Map<string, number>): void {
  for (const gd of findAllByLocalName(node, "gd")) {
    const name = attr(gd, "name");
    const fmla = attr(gd, "fmla");
    if (!name || !fmla) continue;
    const v = evalFmla(fmla, guides);
    guides.set(name, v);
  }
}

export function evalFmla(fmla: string, guides: Map<string, number>): number {
  const tokens = fmla.trim().split(/\s+/);
  if (tokens.length === 0) return 0;
  const op = tokens[0]!;
  const args = tokens.slice(1).map((a) => resolveVar(a, guides));
  return runOp(op, args);
}

export function resolveVar(token: string, guides: Map<string, number>): number {
  const n = Number(token);
  if (Number.isFinite(n)) return n;
  return guides.get(token) ?? 0;
}

function runOp(op: string, args: number[]): number {
  const a = args[0] ?? 0;
  const b = args[1] ?? 0;
  const c = args[2] ?? 0;
  const DEG = Math.PI / (180 * 60000);
  switch (op) {
    case "val":
      return a;
    case "*/":
      return c !== 0 ? (a * b) / c : 0;
    case "+-":
      return a + b - c;
    case "+/":
      return c !== 0 ? (a + b) / c : 0;
    case "?:":
      return a > 0 ? b : c;
    case "abs":
      return Math.abs(a);
    case "at2":
      return Math.atan2(b, a) / DEG;
    case "cat2":
      return a * Math.cos(Math.atan2(c, b));
    case "cos":
      return a * Math.cos(b * DEG);
    case "max":
      return Math.max(a, b);
    case "min":
      return Math.min(a, b);
    case "mod":
      return Math.hypot(a, b, c);
    case "pin":
      if (a < b) return b;
      if (a > c) return c;
      return a;
    case "sat2":
      return a * Math.sin(Math.atan2(c, b));
    case "sin":
      return a * Math.sin(b * DEG);
    case "sqrt":
      return Math.sqrt(Math.max(0, a));
    case "tan":
      return a * Math.tan(b * DEG);
    default:
      return 0;
  }
}

function parsePathCommands(
  pathNode: XmlNode,
  ox: number,
  oy: number,
  sx: number,
  sy: number,
  guides: Map<string, number>,
): string {
  const out: string[] = [];
  let cx = 0;
  let cy = 0;
  const tx = (pt: XmlNode | undefined): { x: number; y: number } => {
    const xRaw = attr(pt, "x") ?? "0";
    const yRaw = attr(pt, "y") ?? "0";
    const x = resolveVar(xRaw, guides);
    const y = resolveVar(yRaw, guides);
    return { x: ox + x * sx, y: oy + y * sy };
  };
  for (const ref of orderedChildren(pathNode)) {
    const local = stripNs(ref.tag);
    const it = ref.node;
    switch (local) {
      case "moveTo": {
        const pt = tx(findByLocalName(it, "pt"));
        out.push(`M ${pt.x} ${pt.y}`);
        cx = pt.x;
        cy = pt.y;
        break;
      }
      case "lnTo": {
        const pt = tx(findByLocalName(it, "pt"));
        out.push(`L ${pt.x} ${pt.y}`);
        cx = pt.x;
        cy = pt.y;
        break;
      }
      case "cubicBezTo": {
        const pts = findAllByLocalName(it, "pt").map(tx);
        if (pts.length >= 3) {
          out.push(`C ${pts[0]!.x} ${pts[0]!.y} ${pts[1]!.x} ${pts[1]!.y} ${pts[2]!.x} ${pts[2]!.y}`);
          cx = pts[2]!.x;
          cy = pts[2]!.y;
        }
        break;
      }
      case "quadBezTo": {
        const pts = findAllByLocalName(it, "pt").map(tx);
        if (pts.length >= 2) {
          out.push(`Q ${pts[0]!.x} ${pts[0]!.y} ${pts[1]!.x} ${pts[1]!.y}`);
          cx = pts[1]!.x;
          cy = pts[1]!.y;
        }
        break;
      }
      case "arcTo": {
        const wRRaw = attr(it, "wR") ?? "0";
        const hRRaw = attr(it, "hR") ?? "0";
        const stAngRaw = attr(it, "stAng") ?? "0";
        const swAngRaw = attr(it, "swAng") ?? "0";
        const wR = resolveVar(wRRaw, guides) * sx;
        const hR = resolveVar(hRRaw, guides) * sy;
        const stAng = (resolveVar(stAngRaw, guides) / 60000) * (Math.PI / 180);
        const swAng = (resolveVar(swAngRaw, guides) / 60000) * (Math.PI / 180);
        const start = dmlArcOffset(wR, hR, stAng);
        const cxc = cx - start.x;
        const cyc = cy - start.y;
        const arc = emitArcSegments(cxc, cyc, wR, hR, stAng, swAng);
        out.push(arc.d);
        cx = arc.ex;
        cy = arc.ey;
        break;
      }
      case "close":
        out.push("Z");
        break;
    }
  }
  return out.join(" ");
}

// ECMA-376 §20.1.9.11 cat2/sat2 与 §20.1.9.4 arcTo 用同一套角度。
// 预设弧的 moveTo 终点是 cat2/sat2 点，不是 (wR·cos θ, hR·sin θ)。
// 扁椭圆上这两套差一截，圆心会漂出形状框，弧不再贴着外接椭圆，扫不满一圈。
// φ = atan2(wR·sin θ, hR·cos θ)，点 = (wR·cos φ, hR·sin φ)。正圆时 φ = θ，与旧结果一致。
function dmlArcOffset(wR: number, hR: number, ang: number): { x: number; y: number; phi: number } {
  const phi = Math.atan2(wR * Math.sin(ang), hR * Math.cos(ang));
  return { x: wR * Math.cos(phi), y: hR * Math.sin(phi), phi };
}

function unwrapPhi(from: number, to: number, sign: number): number {
  const PI2 = Math.PI * 2;
  let d = to - from;
  if (sign > 0) {
    while (d <= 1e-12) d += PI2;
    while (d > PI2) d -= PI2;
  } else {
    while (d >= -1e-12) d -= PI2;
    while (d < -PI2) d += PI2;
  }
  return from + d;
}

// ECMA-376 §20.1.9.4 arcTo → SVG arc 转换。
// SVG 的 `A` 弧命令在「起点 == 终点」时不渲染（典型：swAng=21600000 即 360° 整圆）。
// 按 φ 切片，每段 |Δφ| ≤ 90°，large-arc 保持 0，整圆不会退化成空路径。
function emitArcSegments(
  cxc: number,
  cyc: number,
  wR: number,
  hR: number,
  stAng: number,
  swAng: number,
): { d: string; ex: number; ey: number } {
  const aWR = Math.abs(wR);
  const aHR = Math.abs(hR);
  const total = swAng;
  const sign = total >= 0 ? 1 : -1;
  let remaining = Math.abs(total);
  let curAng = stAng;
  const parts: string[] = [];
  if (!Number.isFinite(remaining) || remaining < 1e-12) {
    const o = dmlArcOffset(wR, hR, stAng);
    return { d: "", ex: cxc + o.x, ey: cyc + o.y };
  }
  const STEP = Math.PI / 2;
  while (remaining > 1e-9) {
    let step = sign * Math.min(STEP, remaining);
    let nextAng = curAng + step;
    let a0 = dmlArcOffset(wR, hR, curAng);
    let a1 = dmlArcOffset(wR, hR, nextAng);
    let phi1 = unwrapPhi(a0.phi, a1.phi, sign);
    while (Math.abs(phi1 - a0.phi) > STEP + 1e-6 && Math.abs(step) > 1e-4) {
      step /= 2;
      nextAng = curAng + step;
      a1 = dmlArcOffset(wR, hR, nextAng);
      phi1 = unwrapPhi(a0.phi, a1.phi, sign);
    }
    const nx = cxc + a1.x;
    const ny = cyc + a1.y;
    const sweep = phi1 >= a0.phi ? 1 : 0;
    parts.push(`A ${aWR} ${aHR} 0 0 ${sweep} ${nx} ${ny}`);
    curAng = nextAng;
    remaining -= Math.abs(step);
  }
  const end = dmlArcOffset(wR, hR, stAng + total);
  return { d: parts.join(" "), ex: cxc + end.x, ey: cyc + end.y };
}

export type PresetCmdKind = "moveTo" | "lnTo" | "cubicBezTo" | "quadBezTo" | "arcTo" | "close";

export interface PresetCmd {
  kind: PresetCmdKind;
  x?: string;
  y?: string;
  x1?: string;
  y1?: string;
  x2?: string;
  y2?: string;
  x3?: string;
  y3?: string;
  wR?: string;
  hR?: string;
  stAng?: string;
  swAng?: string;
}

export interface PresetPath {
  w?: number;
  h?: number;
  commands: PresetCmd[];
  stroke?: boolean;
  fill?: "none" | "norm" | "lighten" | "lightenLess" | "darken" | "darkenLess";
}

export interface PresetGd {
  name: string;
  formula: string;
}

export interface PresetTxRect {
  l: string;
  t: string;
  r: string;
  b: string;
}

/** ECMA-376 §20.1.9.3 ahXY / §20.1.9.2 ahPolar — 预设几何的黄色调整手柄。 */
export interface PresetAh {
  kind: "xy" | "polar";
  posX: string;
  posY: string;
  gdRefX?: string;
  gdRefY?: string;
  minX?: string;
  maxX?: string;
  minY?: string;
  maxY?: string;
  gdRefR?: string;
  gdRefAng?: string;
  minR?: string;
  maxR?: string;
  minAng?: string;
  maxAng?: string;
}

export interface ResolvedAdjustHandle {
  x: number;
  y: number;
  def: PresetAh;
}

export interface PresetDef {
  name: string;
  avLst?: Record<string, number>;
  gdLst?: PresetGd[];
  pathLst: PresetPath[];
  ahLst?: PresetAh[];
  // ECMA-376 §20.1.9.30 <rect l/t/r/b/> — shape text bounding rectangle, expressed
  // as references to gd-list names (or built-ins like l/t/r/b/hc/vc/wd2/hd2…). Defines
  // the area within the shape where the text body should be laid out before bodyPr
  // insets are applied. Without this, text falls back to the shape's full bbox, which
  // for shapes like pie / star inscribes into the shape boundary incorrectly.
  rect?: PresetTxRect;
}

// ECMA-376 §20.1.9.18 — gdLst 公式中的 w / h / ss / ls / hc / vc / hd*/wd*/ssd* 等
// 都是「形状的几何属性」，意指应用该几何的 SHAPE 的实际包围盒尺寸，而不是 path 自身
// 的归一化坐标空间。因此 buildPresetGuides 接受 shape 实际宽高（bbox.w / bbox.h）。
//
// 这是 roundRect 圆角保持「圆形」、verticalScroll curl 保持「圆形」等行为的关键：
// ss = min(actual_w, actual_h)，所有派生量都在 EMU 实际单位下。
function buildPresetGuides(
  def: PresetDef,
  adjOverrides: Record<string, number> = {},
  w: number = PRESET_W,
  h: number = PRESET_H,
): Map<string, number> {
  const guides = createGuides(w, h);
  const av = { ...(def.avLst ?? {}), ...adjOverrides };
  for (const k of Object.keys(av)) guides.set(k, av[k]!);
  if (def.gdLst) {
    for (const gd of def.gdLst) guides.set(gd.name, evalFmla(gd.formula, guides));
  }
  return guides;
}

export function evalPresetDef(
  def: PresetDef,
  bbox: Rect,
  adjOverrides: Record<string, number> = {},
): CustGeomResult {
  // gdLst 求值使用形状实际坐标空间。
  const guides = buildPresetGuides(def, adjOverrides, bbox.w, bbox.h);
  const paths: SubPath[] = [];
  for (const p of def.pathLst) {
    // ECMA-376 §20.1.9.15 path/@w @h — 当声明时，path 命令使用 path-local 坐标
    // 空间（线性映射到 bbox）；当省略时（或 0），命令直接处于形状坐标空间，
    // 与 guides 共用同一坐标系，sx = sy = 1。
    const pw = p.w && p.w > 0 ? p.w : 0;
    const ph = p.h && p.h > 0 ? p.h : 0;
    const sx = pw > 0 ? bbox.w / pw : 1;
    const sy = ph > 0 ? bbox.h / ph : 1;
    const d = buildPathFromCommands(p.commands, bbox.x, bbox.y, sx, sy, guides);
    if (!d) continue;
    paths.push({
      d,
      fillMod: (p.fill as FillMod) ?? "norm",
      stroke: p.stroke !== false,
    });
  }
  const filledD = paths
    .filter((p) => p.fillMod !== "none")
    .map((p) => p.d)
    .join(" ");
  return { d: filledD, paths };
}

export function evalPresetAdjustHandles(
  def: PresetDef,
  bbox: Rect,
  adjOverrides: Record<string, number> = {},
): ResolvedAdjustHandle[] {
  if (!def.ahLst?.length) return [];
  const guides = buildPresetGuides(def, adjOverrides, bbox.w, bbox.h);
  return def.ahLst.map((ah) => {
    const p = handleLocalPos(ah, guides);
    return { x: bbox.x + p.x, y: bbox.y + p.y, def: ah };
  });
}

function handleLocalPos(ah: PresetAh, guides: Map<string, number>): { x: number; y: number } {
  return { x: resolveVar(ah.posX, guides), y: resolveVar(ah.posY, guides) };
}

function guideLimit(token: string | undefined, guides: Map<string, number>, fallback: number): number {
  if (token === undefined || token === "") return fallback;
  return resolveVar(token, guides);
}

function searchAdjValue(
  def: PresetDef,
  bbox: Rect,
  adj: Record<string, number>,
  name: string,
  min: number,
  max: number,
  measure: (guides: Map<string, number>) => number,
  target: number,
): number {
  if (!(max > min)) return Math.min(max, Math.max(min, adj[name] ?? min));
  const at = (v: number): number => {
    const guides = buildPresetGuides(def, { ...adj, [name]: v }, bbox.w, bbox.h);
    return measure(guides);
  };
  const lo0 = at(min);
  const hi0 = at(max);
  const increasing = hi0 >= lo0;
  let lo = min;
  let hi = max;
  for (let i = 0; i < 42; i++) {
    const mid = (lo + hi) / 2;
    const m = at(mid);
    if (increasing) {
      if (m < target) lo = mid;
      else hi = mid;
    } else {
      if (m > target) lo = mid;
      else hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * 把调整手柄拖到局部坐标 (localX, localY)（相对 bbox 左上），反解对应 adj。
 * 对 ahXY 按 x/y 分别拟合 gdRef；对 ahPolar 按半径 / 角度拟合。
 */
export function adjFromAdjustHandleDrag(
  def: PresetDef,
  bbox: Rect,
  adj: Record<string, number>,
  handleIndex: number,
  localX: number,
  localY: number,
): Record<string, number> {
  const ah = def.ahLst?.[handleIndex];
  if (!ah) return { ...adj };
  const next = { ...(def.avLst ?? {}), ...adj };
  const guides0 = buildPresetGuides(def, next, bbox.w, bbox.h);
  const hc = guides0.get("hc") ?? bbox.w / 2;
  const vc = guides0.get("vc") ?? bbox.h / 2;

  const applyRef = (
    name: string | undefined,
    minTok: string | undefined,
    maxTok: string | undefined,
    measure: (guides: Map<string, number>) => number,
    target: number,
  ): void => {
    if (!name) return;
    const g = buildPresetGuides(def, next, bbox.w, bbox.h);
    const min = guideLimit(minTok, g, -1e9);
    const max = guideLimit(maxTok, g, 1e9);
    next[name] = searchAdjValue(def, bbox, next, name, min, max, measure, target);
  };

  applyRef(ah.gdRefX, ah.minX, ah.maxX, (g) => handleLocalPos(ah, g).x, localX);
  applyRef(ah.gdRefY, ah.minY, ah.maxY, (g) => handleLocalPos(ah, g).y, localY);
  applyRef(
    ah.gdRefR,
    ah.minR,
    ah.maxR,
    (g) => {
      const p = handleLocalPos(ah, g);
      return Math.hypot(p.x - hc, p.y - vc);
    },
    Math.hypot(localX - hc, localY - vc),
  );
  applyRef(
    ah.gdRefAng,
    ah.minAng,
    ah.maxAng,
    (g) => {
      const p = handleLocalPos(ah, g);
      return Math.atan2(p.y - vc, p.x - hc);
    },
    Math.atan2(localY - vc, localX - hc),
  );
  return next;
}

// 按变量名后缀识别 preset 引导变量是 X 坐标还是 Y 坐标。
//   X 系：以 `l`/`r`/`x` 结尾，或 `hc` / `wd*` / 含 `wd`；如 `il`/`ir`/`x1`/`hc`/`wd2`。
//   Y 系：以 `t`/`b`/`y` 结尾，或 `vc` / `hd*` / 含 `hd`；如 `it`/`ib`/`y1`/`vc`/`hd2`。
// 数字字面量或无法识别的名字返回 "unknown"。
function classifyCoordKind(token: string): "x" | "y" | "unknown" {
  if (/^-?\d+(?:\.\d+)?$/.test(token)) return "unknown";
  if (token === "hc" || token === "l" || token === "r") return "x";
  if (token === "vc" || token === "t" || token === "b") return "y";
  if (/^wd\d*$/.test(token)) return "x";
  if (/^hd\d*$/.test(token)) return "y";
  // 形如 `x1` / `y2`、`il` / `it`、`ir` / `ib`，按最后一个字母分类（去掉尾部数字）。
  const stripped = token.replace(/\d+$/, "");
  if (stripped.length === 0) return "unknown";
  const last = stripped[stripped.length - 1]!;
  if (last === "l" || last === "r" || last === "x") return "x";
  if (last === "t" || last === "b" || last === "y") return "y";
  return "unknown";
}

// 给定希望得到的坐标类型（X 或 Y），把一个被错置的变量名转成同族的正确变量名。
//   il <-> it, ir <-> ib, x1 <-> y1, hc <-> vc, wd* <-> hd*。
function flipCoordToken(token: string, want: "x" | "y"): string {
  if (token === "hc" && want === "y") return "vc";
  if (token === "vc" && want === "x") return "hc";
  if (token === "l" && want === "y") return "t";
  if (token === "r" && want === "y") return "b";
  if (token === "t" && want === "x") return "l";
  if (token === "b" && want === "x") return "r";
  // 处理 wd* / hd*
  const mWd = /^wd(\d*)$/.exec(token);
  if (mWd && want === "y") return `hd${mWd[1]}`;
  const mHd = /^hd(\d*)$/.exec(token);
  if (mHd && want === "x") return `wd${mHd[1]}`;
  // 处理两字母后缀变量：去掉尾部数字、改尾字母。
  const m = /^(.*?)([a-zA-Z])(\d*)$/.exec(token);
  if (!m) return token;
  const prefix = m[1]!;
  const suffix = m[2]!;
  const digits = m[3]!;
  const flipped =
    want === "y"
      ? (suffix === "l" ? "t" : suffix === "r" ? "b" : suffix === "x" ? "y" : suffix)
      : (suffix === "t" ? "l" : suffix === "b" ? "r" : suffix === "y" ? "x" : suffix);
  return prefix + flipped + digits;
}

// 把 PresetDef.rect 求值为以 slide-local 坐标表达的文字矩形（应用 bbox 缩放）。
// 当 rect 未声明时返回 undefined，调用方应回退到 bbox 自身。
//
// ECMA-376 5th edition 的若干 prst 在 <rect> 里写反了变量类型——例如 pie 写
// `l="il" t="ir" r="it" b="ib"`，但 `ir` 是 X 坐标、`it` 是 Y 坐标，按字面解释会
// 把 textRect 完全错位。这是 spec 早就被记录的勘误，PowerPoint 内部依变量命名
// 约定（结尾 l/r/x → X；结尾 t/b/y → Y）而不是 rect 字面位置来分类。这里照做：
//   1. 用 classifyCoordKind 判断每个槽位的应有/实际类型；
//   2. 若 t 槽位被赋了 X 类型变量、r 槽位被赋了 Y 类型变量，做 t↔r 互换；
//   3. 若个别槽位与隔壁同名（典型如 roundRect 的 `l=il t=il`），尝试把 t/b 换成
//      Y 同族 (it/ib)，l/r 换成 X 同族 (il/ir)，再次求值；
//   4. 仍解不出来时退回字面值，至少保证不抛异常。
export function evalPresetTextRect(
  def: PresetDef,
  bbox: Rect,
  adjOverrides: Record<string, number> = {},
): Rect | undefined {
  if (!def.rect) return undefined;
  // guides 在形状实际坐标空间，无需再 sx/sy 缩放。
  const guides = buildPresetGuides(def, adjOverrides, bbox.w, bbox.h);

  let lRaw = def.rect.l;
  let tRaw = def.rect.t;
  let rRaw = def.rect.r;
  let bRaw = def.rect.b;

  // Step 1: 经典 pie 风格 t↔r 互换。
  const tKind = classifyCoordKind(tRaw);
  const rKind = classifyCoordKind(rRaw);
  if (tKind === "x" && rKind === "y") {
    [tRaw, rRaw] = [rRaw, tRaw];
  }

  // Step 2: 槽位与同行同名（如 roundRect 的 t=il=l、bevel 的 t=x1=l），尝试
  // 把 t/b 翻到对应 Y 族名上（it/ib、y1/y2…）。l/r 已正确为 X 族，无需翻。
  if (tRaw === lRaw) tRaw = flipCoordToken(tRaw, "y");
  if (bRaw === rRaw) bRaw = flipCoordToken(bRaw, "y");

  // Step 3: 改写后 guides 中可能没有目标名（极少见），回退到原 raw 解析以避免
  // 用 0 占位破坏布局。
  const resolveOrFallback = (preferred: string, fallback: string): number => {
    if (guides.has(preferred)) return guides.get(preferred)!;
    return resolveVar(fallback, guides);
  };
  const l = resolveOrFallback(lRaw, def.rect.l);
  const t = resolveOrFallback(tRaw, def.rect.t);
  const r = resolveOrFallback(rRaw, def.rect.r);
  const b = resolveOrFallback(bRaw, def.rect.b);
  return {
    x: bbox.x + l,
    y: bbox.y + t,
    w: r - l,
    h: b - t,
  };
}

function buildPathFromCommands(
  commands: PresetCmd[],
  ox: number,
  oy: number,
  sx: number,
  sy: number,
  guides: Map<string, number>,
): string {
  const out: string[] = [];
  let cx = 0;
  let cy = 0;
  const px = (raw: string | undefined): number => ox + resolveVar(raw ?? "0", guides) * sx;
  const py = (raw: string | undefined): number => oy + resolveVar(raw ?? "0", guides) * sy;
  for (const c of commands) {
    switch (c.kind) {
      case "moveTo": {
        const x = px(c.x);
        const y = py(c.y);
        out.push(`M ${x} ${y}`);
        cx = x;
        cy = y;
        break;
      }
      case "lnTo": {
        const x = px(c.x);
        const y = py(c.y);
        out.push(`L ${x} ${y}`);
        cx = x;
        cy = y;
        break;
      }
      case "cubicBezTo": {
        const x1 = px(c.x1);
        const y1 = py(c.y1);
        const x2 = px(c.x2);
        const y2 = py(c.y2);
        const x3 = px(c.x3);
        const y3 = py(c.y3);
        out.push(`C ${x1} ${y1} ${x2} ${y2} ${x3} ${y3}`);
        cx = x3;
        cy = y3;
        break;
      }
      case "quadBezTo": {
        const x1 = px(c.x1);
        const y1 = py(c.y1);
        const x2 = px(c.x2);
        const y2 = py(c.y2);
        out.push(`Q ${x1} ${y1} ${x2} ${y2}`);
        cx = x2;
        cy = y2;
        break;
      }
      case "arcTo": {
        const wR = resolveVar(c.wR ?? "0", guides) * sx;
        const hR = resolveVar(c.hR ?? "0", guides) * sy;
        const stAng = (resolveVar(c.stAng ?? "0", guides) / 60000) * (Math.PI / 180);
        const swAng = (resolveVar(c.swAng ?? "0", guides) / 60000) * (Math.PI / 180);
        const start = dmlArcOffset(wR, hR, stAng);
        const cxc = cx - start.x;
        const cyc = cy - start.y;
        const arc = emitArcSegments(cxc, cyc, wR, hR, stAng, swAng);
        out.push(arc.d);
        cx = arc.ex;
        cy = arc.ey;
        break;
      }
      case "close":
        out.push("Z");
        break;
    }
  }
  return out.join(" ");
}

function collectAhPositions(
  custGeom: XmlNode,
  bbox: Rect,
  guides: Map<string, number>,
  w: number,
  h: number,
): Array<{ x: number; y: number }> | undefined {
  const ahLst = findByLocalName(custGeom, "ahLst");
  if (!ahLst) return undefined;
  const ahs: Array<{ x: number; y: number }> = [];
  for (const ah of orderedChildren(ahLst)) {
    const local = stripNs(ah.tag);
    if (local !== "ahPolar" && local !== "ahXY") continue;
    const pos = findByLocalName(ah.node, "pos");
    const x = resolveVar(attr(pos, "x") ?? "0", guides);
    const y = resolveVar(attr(pos, "y") ?? "0", guides);
    ahs.push({ x: bbox.x + (x / w) * bbox.w, y: bbox.y + (y / h) * bbox.h });
  }
  return ahs.length > 0 ? ahs : undefined;
}
