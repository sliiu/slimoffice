// 从同一 preset 已提取的 subtype 变体改写出缺失的 subtype 变体。
//
// extracted.json 只收录了样本里出现过的方向（如 Fly In 只有 4 / 8），直接回退到基模板
// 会让「自顶部」仍按「自底部」的子树播放和导出。PowerPoint 各方向变体之间只差：
//   - animEffect@filter 的方向参数（§19.5.3 filter 语法：wipe(down) / slide(fromTop) /
//     blinds(vertical) / strips(upRight) / box(in) / barn(outHorizontal) / wheel(4) …）
//   - Fly In / Crawl In 这类 ppt_x / ppt_y 关键帧的屏外端点（0-#ppt_w/2、1+#ppt_h/2 …）
// 两者都按 presetSubtype 位标志（1 上、2 右、4 下、8 左；5 / 10 轴向；16 / 32 内 / 外）
// 确定，可以逐节点改写。伸展的半宽偏移、旋转的横竖对调也按这个改写。
// 认不出的写法（例如 Peek Out 的 #ppt_h*1.125）放弃，调用方退回原有行为。

import { getChildren, isBehavior, isContainer } from "../types";
import type { AnimNode, AnimEffectNode, TimeNode } from "../types";

/** subtype 在 UI 上的含义：罗盘方向 / 轴向 / 内外 / 劈裂 / 轮辐数 / 伸展。 */
export type SubtypeKind = "compass" | "axis" | "inOut" | "barn" | "spokes" | "stretch";

interface FilterFamily {
  kind: SubtypeKind;
  re: RegExp;
  bySubtype: Record<number, string>;
}

const FILTER_FAMILIES: FilterFamily[] = [
  { kind: "compass", re: /^wipe\((up|down|left|right)\)$/, bySubtype: { 1: "up", 2: "right", 4: "down", 8: "left" } },
  {
    kind: "compass",
    re: /^slide\((fromTop|fromBottom|fromLeft|fromRight)\)$/,
    bySubtype: { 1: "fromTop", 2: "fromRight", 4: "fromBottom", 8: "fromLeft" },
  },
  { kind: "axis", re: /^blinds\((horizontal|vertical)\)$/, bySubtype: { 10: "horizontal", 5: "vertical" } },
  { kind: "axis", re: /^randombar\((horizontal|vertical)\)$/, bySubtype: { 10: "horizontal", 5: "vertical" } },
  { kind: "axis", re: /^checkerboard\((across|down)\)$/, bySubtype: { 10: "across", 5: "down" } },
  {
    kind: "compass",
    re: /^strips\((upLeft|upRight|downLeft|downRight)\)$/,
    bySubtype: { 9: "upLeft", 3: "upRight", 12: "downLeft", 6: "downRight" },
  },
  { kind: "inOut", re: /^box\((in|out)\)$/, bySubtype: { 16: "in", 32: "out" } },
  { kind: "inOut", re: /^circle\((in|out)\)$/, bySubtype: { 16: "in", 32: "out" } },
  { kind: "inOut", re: /^diamond\((in|out)\)$/, bySubtype: { 16: "in", 32: "out" } },
  { kind: "inOut", re: /^plus\((in|out)\)$/, bySubtype: { 16: "in", 32: "out" } },
  {
    kind: "barn",
    re: /^barn\((inVertical|inHorizontal|outVertical|outHorizontal)\)$/,
    bySubtype: { 21: "inVertical", 26: "inHorizontal", 37: "outVertical", 42: "outHorizontal" },
  },
  { kind: "spokes", re: /^wheel\(([1-8])\)$/, bySubtype: { 1: "1", 2: "2", 3: "3", 4: "4", 8: "8" } },
];

const COMPASS_SUBTYPES = [1, 2, 4, 8, 3, 6, 9, 12];

/** 子树里出现的方向写法各自允许的 subtype 集合；null = 有识别不了的方向相关写法。 */
function directionDomains(tree: TimeNode): number[][] | null {
  const domains: number[][] = [];
  let ok = true;
  walk(tree, (n) => {
    if (n.kind === "animEffect") {
      const fam = filterFamily(n);
      if (fam) domains.push(Object.keys(fam.bySubtype).map(Number));
    } else if (n.kind === "anim") {
      const axis = offscreenAxis(n);
      if (axis === "bad") ok = false;
      else if (axis) domains.push(COMPASS_SUBTYPES);
    }
  });
  return ok ? domains : null;
}

/** donor 里方向写法的含义；没有可识别的方向写法时为 undefined。 */
export function subtypeKind(donor: TimeNode): SubtypeKind | undefined {
  if (stretchInfo(donor)) return "stretch";
  if (swivelInfo(donor)) return "axis";
  let kind: SubtypeKind | undefined;
  walk(donor, (n) => {
    if (kind) return;
    if (n.kind === "animEffect") kind = filterFamily(n)?.kind;
    else if (n.kind === "anim") {
      const axis = offscreenAxis(n);
      if (axis === "x" || axis === "y") kind = "compass";
    }
  });
  return kind;
}

/** donor 能改写出的 subtype（不含 donor 自己没有方向写法的情况）。 */
export function derivableSubtypes(donor: TimeNode): number[] {
  const stretch = stretchInfo(donor);
  if (stretch) return STRETCH_TARGETS.filter((t) => stretchCan(stretch, t));
  if (swivelInfo(donor)) return [5, 10];
  const domains = directionDomains(donor);
  if (!domains || domains.length === 0) return [];
  return domains.reduce((acc, d) => acc.filter((s) => d.includes(s)));
}

/** 把 donor 改写成 target 方向；改写不了返回 null。不修改 donor。 */
export function deriveSubtypeVariant(donor: TimeNode, target: number): TimeNode | null {
  const stretched = deriveStretch(donor, target);
  if (stretched) return stretched;
  const swiveled = deriveSwivel(donor, target);
  if (swiveled) return swiveled;
  if (stretchInfo(donor) || swivelInfo(donor)) return null;
  if (!derivableSubtypes(donor).includes(target)) return null;
  const out = structuredClone(donor);
  const offIdx = offscreenIndex(out);
  let ok = true;
  walk(out, (n) => {
    if (n.kind === "animEffect") {
      const fam = filterFamily(n);
      if (fam) n.filter = n.filter!.replace(/\(.*\)$/, `(${fam.bySubtype[target]})`);
    } else if (n.kind === "anim" && offscreenAxis(n)) {
      if (offIdx === undefined || !rewriteOffscreen(n, target, offIdx)) ok = false;
    }
  });
  return ok ? out : null;
}

function filterFamily(n: AnimEffectNode): FilterFamily | undefined {
  const f = n.filter?.trim();
  if (!f) return undefined;
  return FILTER_FAMILIES.find((fam) => fam.re.test(f));
}

type Axis = "x" | "y";

// ppt_x / ppt_y 两帧关键帧，端点只可能是原位（#ppt_x）或屏外（0-#ppt_w/2、1+#ppt_w/2）。
function offscreenAxis(n: AnimNode): Axis | "bad" | undefined {
  const attrs = n.cBhvr.attrNameLst ?? [];
  const axis: Axis | undefined = attrs.includes("ppt_x") ? "x" : attrs.includes("ppt_y") ? "y" : undefined;
  if (!axis || attrs.length !== 1) return undefined;
  if ([n.from, n.to, n.by].some((v) => v !== undefined)) return "bad";
  const vals = (n.tavLst ?? []).map(tavStr);
  if (vals.length !== 2 || vals.some((v) => v === undefined)) return "bad";
  return vals.every((v) => classify(v!, axis) !== "other") ? axis : "bad";
}

function classify(v: string, axis: Axis): "home" | "off" | "other" {
  const pos = axis === "x" ? "ppt_x" : "ppt_y";
  const size = axis === "x" ? "ppt_w" : "ppt_h";
  const s = v.replace(/\s+/g, "");
  if (s === pos || s === `#${pos}`) return "home";
  if (s === `0-${size}/2` || s === `0-#${size}/2` || s === `1+${size}/2` || s === `1+#${size}/2`) return "off";
  return "other";
}

// 进入是「屏外 → 原位」（屏外在第 0 帧），退出是「原位 → 屏外」（屏外在末帧）。
function offscreenIndex(tree: TimeNode): 0 | 1 | undefined {
  let idx: 0 | 1 | undefined;
  walk(tree, (n) => {
    if (idx !== undefined || n.kind !== "anim") return;
    const axis = offscreenAxis(n);
    if (axis !== "x" && axis !== "y") return;
    const vals = (n.tavLst ?? []).map(tavStr);
    if (classify(vals[0]!, axis) === "off") idx = 0;
    else if (classify(vals[1]!, axis) === "off") idx = 1;
  });
  return idx;
}

function rewriteOffscreen(n: AnimNode, target: number, offIdx: 0 | 1): boolean {
  const axis = offscreenAxis(n);
  if (axis !== "x" && axis !== "y") return false;
  const tav = n.tavLst!;
  const hash = tav.some((t) => tavStr(t)!.includes("#")) ? "#" : "";
  const [lo, hi, pos, size] = axis === "x" ? [8, 2, "ppt_x", "ppt_w"] : [1, 4, "ppt_y", "ppt_h"];
  const home = `${hash}${pos}`;
  const off = target & lo ? `0-${hash}${size}/2` : target & hi ? `1+${hash}${size}/2` : home;
  const homeIdx = offIdx === 0 ? 1 : 0;
  if (classify(tavStr(tav[homeIdx]!)!, axis) !== "home") return false;
  tav[offIdx] = { ...tav[offIdx]!, val: { kind: "str", val: off } };
  return true;
}

const STRETCH_TARGETS = [1, 2, 4, 5, 8, 10];

type SizeAttr = "ppt_w" | "ppt_h";
type PosAttr = "ppt_x" | "ppt_y";
type GeomAttr = SizeAttr | PosAttr;

interface GeomAnim {
  node: AnimNode;
  attr: GeomAttr;
  vals: string[];
}

interface StretchShape {
  anims: GeomAnim[];
  pos?: GeomAnim;
  axis: Axis;
  grow: boolean;
  hash: boolean;
}

// 伸展：一边的尺寸在 0 和全长之间，中心可以停在原位，或偏到该边半个尺寸。
// #ppt_x 在这些公式里是形状中心，+#ppt_w/2 把中心送到右缘。
function stretchInfo(tree: TimeNode): StretchShape | null {
  const anims = geomAnims(tree);
  if (!anims || anims.length === 0) return null;
  const sizes = anims.filter((a) => a.attr === "ppt_w" || a.attr === "ppt_h");
  const positions = anims.filter((a) => a.attr === "ppt_x" || a.attr === "ppt_y");
  const changing = sizes.filter((a) => !same(a.vals));
  if (changing.length !== 1) return null;
  const size = changing[0]!;
  if (size.vals.length !== 2) return null;
  const kinds = size.vals.map((v) => sizeKind(v, size.attr as SizeAttr));
  if (!kinds.includes("zero") || !kinds.includes("full") || kinds.some((k) => k === "other")) return null;
  for (const a of sizes) {
    if (a === size) continue;
    if (!same(a.vals) || a.vals.some((v) => sizeKind(v, a.attr as SizeAttr) !== "full")) return null;
  }
  const axis: Axis = size.attr === "ppt_w" ? "x" : "y";
  const posAttr: PosAttr = axis === "x" ? "ppt_x" : "ppt_y";
  let pos: GeomAnim | undefined;
  for (const a of positions) {
    const ks = a.vals.map((v) => posKind(v, a.attr as PosAttr));
    if (ks.some((k) => k === "other")) return null;
    if (!same(a.vals)) {
      if (a.attr !== posAttr || a.vals.length !== 2) return null;
      pos = a;
    }
  }
  return {
    anims,
    pos,
    axis,
    grow: kinds[0] === "zero",
    hash: anims.some((a) => a.vals.some((v) => v.includes("#"))),
  };
}

// 旋转：一条轴上的 ppt_w / ppt_h 在变，另一条保持不动，位置不偏。
function swivelInfo(tree: TimeNode): { anims: GeomAnim[]; attr: SizeAttr } | null {
  if (stretchInfo(tree)) return null;
  const anims = geomAnims(tree);
  if (!anims) return null;
  const sizes = anims.filter((a) => a.attr === "ppt_w" || a.attr === "ppt_h");
  const changing = sizes.filter((a) => !same(a.vals));
  if (changing.length !== 1) return null;
  for (const a of sizes) {
    if (a !== changing[0] && !same(a.vals)) return null;
  }
  for (const a of anims) {
    const attr = a.attr;
    if (attr !== "ppt_x" && attr !== "ppt_y") continue;
    if (!same(a.vals) || a.vals.some((v) => posKind(v, attr) === "other")) return null;
  }
  return { anims, attr: changing[0]!.attr as SizeAttr };
}

function stretchTarget(sub: number): { axis: Axis; sign: -1 | 0 | 1 } | null {
  switch (sub) {
    case 8: return { axis: "x", sign: -1 };
    case 2: return { axis: "x", sign: 1 };
    case 1: return { axis: "y", sign: -1 };
    case 4: return { axis: "y", sign: 1 };
    case 10: return { axis: "x", sign: 0 };
    case 5: return { axis: "y", sign: 0 };
    default: return null;
  }
}

function stretchCan(info: StretchShape, target: number): boolean {
  const spec = stretchTarget(target);
  if (!spec) return false;
  return spec.sign === 0 || info.pos !== undefined;
}

function deriveStretch(donor: TimeNode, target: number): TimeNode | null {
  const info = stretchInfo(donor);
  if (!info || !stretchCan(info, target)) return null;
  const spec = stretchTarget(target)!;
  const out = structuredClone(donor);
  const cloned = stretchInfo(out);
  if (!cloned) return null;
  if (cloned.axis !== spec.axis) swapGeom(cloned.anims);
  const again = stretchInfo(out);
  if (!again) return null;
  const sizeAttr: SizeAttr = spec.axis === "x" ? "ppt_w" : "ppt_h";
  const posAttr: PosAttr = spec.axis === "x" ? "ppt_x" : "ppt_y";
  const size = again.anims.find((a) => a.attr === sizeAttr && !same(a.vals));
  const pos = again.anims.find((a) => a.attr === posAttr);
  if (!size) return null;
  const full = again.hash ? `#${sizeAttr}` : sizeAttr;
  if (!writeTavs(size.node, again.grow ? ["0", full] : [full, "0"])) return null;
  if (spec.sign === 0) {
    if (pos && !writeTavs(pos.node, [home(spec.axis, again.hash), home(spec.axis, again.hash)])) return null;
  } else if (!pos || !writeTavs(pos.node, again.grow
    ? [half(spec.axis, spec.sign, again.hash), home(spec.axis, again.hash)]
    : [home(spec.axis, again.hash), half(spec.axis, spec.sign, again.hash)])) {
    return null;
  }
  return out;
}

function deriveSwivel(donor: TimeNode, target: number): TimeNode | null {
  const info = swivelInfo(donor);
  if (!info || (target !== 5 && target !== 10)) return null;
  const want: SizeAttr = target === 10 ? "ppt_w" : "ppt_h";
  const out = structuredClone(donor);
  if (info.attr !== want) {
    const anims = geomAnims(out);
    if (!anims) return null;
    swapGeom(anims);
  }
  return out;
}

function geomAnims(tree: TimeNode): GeomAnim[] | null {
  const anims: GeomAnim[] = [];
  let bad = false;
  walk(tree, (n) => {
    if (bad || n.kind !== "anim") return;
    const attrs = n.cBhvr.attrNameLst ?? [];
    if (attrs.length !== 1) return;
    const attr = attrs[0];
    if (attr !== "ppt_x" && attr !== "ppt_y" && attr !== "ppt_w" && attr !== "ppt_h") return;
    const vals = (n.tavLst ?? []).map(tavText);
    if (vals.some((v) => v === undefined) || vals.length < 2) {
      bad = true;
      return;
    }
    anims.push({ node: n, attr, vals: vals as string[] });
  });
  return bad ? null : anims;
}

function same(vals: string[]): boolean {
  const head = norm(vals[0] ?? "");
  return vals.every((v) => norm(v) === head);
}

function sizeKind(v: string, attr: SizeAttr): "zero" | "full" | "other" {
  const s = norm(v);
  if (s === "0") return "zero";
  if (s === attr || s === `#${attr}`) return "full";
  return "other";
}

function posKind(v: string, attr: PosAttr): "home" | "plus" | "minus" | "other" {
  const s = norm(v);
  const size = attr === "ppt_x" ? "ppt_w" : "ppt_h";
  if (s === attr || s === `#${attr}`) return "home";
  const h = s.startsWith("#") ? "#" : "";
  if (s === `${h}${attr}+${h}${size}/2`) return "plus";
  if (s === `${h}${attr}-${h}${size}/2`) return "minus";
  return "other";
}

function swapGeom(anims: GeomAnim[]): void {
  for (const a of anims) {
    a.node.cBhvr.attrNameLst = [swapAttr(a.attr)];
    const tav = a.node.tavLst ?? [];
    for (let i = 0; i < tav.length; i++) {
      const cur = tav[i]!;
      const v = tavStr(cur);
      if (v === undefined) continue;
      tav[i] = { ...cur, val: { kind: "str", val: swapTokens(v) } };
    }
  }
}

function swapAttr(attr: GeomAttr): GeomAttr {
  switch (attr) {
    case "ppt_x": return "ppt_y";
    case "ppt_y": return "ppt_x";
    case "ppt_w": return "ppt_h";
    case "ppt_h": return "ppt_w";
  }
}

function swapTokens(s: string): string {
  return s
    .replaceAll("ppt_x", "\0x")
    .replaceAll("ppt_y", "\0y")
    .replaceAll("ppt_w", "\0w")
    .replaceAll("ppt_h", "\0h")
    .replaceAll("\0x", "ppt_y")
    .replaceAll("\0y", "ppt_x")
    .replaceAll("\0w", "ppt_h")
    .replaceAll("\0h", "ppt_w");
}

function writeTavs(node: AnimNode, vals: string[]): boolean {
  const tav = node.tavLst;
  if (!tav || tav.length !== vals.length) return false;
  for (let i = 0; i < tav.length; i++) {
    tav[i] = { ...tav[i]!, val: { kind: "str", val: vals[i]! } };
  }
  return true;
}

function home(axis: Axis, hash: boolean): string {
  const name = axis === "x" ? "ppt_x" : "ppt_y";
  return hash ? `#${name}` : name;
}

function half(axis: Axis, sign: -1 | 1, hash: boolean): string {
  const h = hash ? "#" : "";
  const pos = axis === "x" ? "ppt_x" : "ppt_y";
  const size = axis === "x" ? "ppt_w" : "ppt_h";
  return `${h}${pos}${sign < 0 ? "-" : "+"}${h}${size}/2`;
}

function norm(s: string): string {
  return s.replace(/\s+/g, "");
}

function tavStr(t: { val?: { kind: string; val?: unknown } }): string | undefined {
  return t.val?.kind === "str" && typeof t.val.val === "string" ? t.val.val : undefined;
}

function tavText(t: { val?: { kind: string; val?: unknown } }): string | undefined {
  const s = tavStr(t);
  if (s !== undefined) return s;
  const val = t.val?.val;
  if ((t.val?.kind === "flt" || t.val?.kind === "int") && typeof val === "number") return String(val);
  return undefined;
}

function walk(node: TimeNode, fn: (n: AnimNode | AnimEffectNode) => void): void {
  if (isContainer(node)) {
    for (const c of getChildren(node)) walk(c, fn);
    return;
  }
  if (isBehavior(node) && (node.kind === "anim" || node.kind === "animEffect")) fn(node);
}
