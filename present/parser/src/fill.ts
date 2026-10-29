import type {
  CustomDashStop,
  GlowEffect,
  GradientRect,
  GradientStop,
  LinearGradientPaint,
  Paint,
  PatternPaint,
  RadialGradientPaint,
  ReflectionEffect,
  ShadowEffect,
  ShapeEffect,
  SoftEdgeEffect,
  Stroke,
  StrokeAlign,
  StrokeCompound,
  StrokeDashPreset,
} from "@ppt/core";
import { angle60kToDeg, boolish, percentToFloat } from "./units";
import { findAllByLocalName, findByLocalName, attr, orderedChildren, stripNs, type XmlNode } from "./xml";
import { resolveColor, resolveColorEx, type ThemeData, type ThemeStyleEntry } from "./theme";
import type { RelMap } from "./parts";

export interface FillCtx {
  theme?: ThemeData;
  rels?: RelMap;
  resolveImage?: (relPath: string) => string | undefined;
}

export function parseFill(spPr: XmlNode | undefined, ctx: FillCtx): Paint | undefined {
  if (!spPr) return undefined;
  if (findByLocalName(spPr, "noFill")) return { kind: "none" };
  const solid = findByLocalName(spPr, "solidFill");
  if (solid) {
    const c = resolveColorEx(solid, ctx.theme);
    if (c) {
      const out: Paint = { kind: "solid", color: c.color };
      if (c.alpha < 1) out.alpha = c.alpha;
      return out;
    }
  }
  const grad = findByLocalName(spPr, "gradFill");
  if (grad) return parseGradient(grad, ctx);
  const blip = findByLocalName(spPr, "blipFill");
  if (blip) return parseImage(blip, ctx);
  const patt = findByLocalName(spPr, "pattFill");
  if (patt) return parsePattern(patt, ctx);
  if (findByLocalName(spPr, "grpFill")) return { kind: "groupFill" };
  return undefined;
}

// ECMA-376 §20.1.8.47 (`<a:pattFill>`). 图案填充：
//   • prst — 预设图案名称（pct5/pct10/.../weave/cross/...）
//   • fgClr — 前景色
//   • bgClr — 背景色
function parsePattern(node: XmlNode, ctx: FillCtx): PatternPaint {
  const prst = attr(node, "prst") ?? "pct50";
  const fgEl = findByLocalName(node, "fgClr");
  const bgEl = findByLocalName(node, "bgClr");
  const fg = fgEl ? resolveColorEx(fgEl, ctx.theme) : undefined;
  const bg = bgEl ? resolveColorEx(bgEl, ctx.theme) : undefined;
  const out: PatternPaint = {
    kind: "pattern",
    prst,
    fg: fg?.color ?? "#000000",
    bg: bg?.color ?? "#FFFFFF",
  };
  if (fg && fg.alpha < 1) out.fgAlpha = fg.alpha;
  if (bg && bg.alpha < 1) out.bgAlpha = bg.alpha;
  return out;
}

// ECMA-376 §20.1.4.2.3 (`<p:bgRef>`). 引用主题 bgFillStyleLst[idx-1] 的填充。
// idx==0 表示 noFill。phClr（schemeClr 子节点）作为占位色注入解析上下文。
export function resolveBgRef(node: XmlNode, ctx: FillCtx): Paint | undefined {
  const idxAttr = attr(node, "idx");
  const idx = idxAttr ? Number(idxAttr) : 0;
  // ECMA-376 §20.1.4.2.3 bgRef@idx：0 或 1000 = 无背景；1..999 → fillStyleLst[idx-1]；
  // 1001.. → bgFillStyleLst[idx-1001]。之前统一按 list[idx-1] 取 bgFillStyleLst，
  // 而真实文件里 bgRef 几乎都是 1001..1003 → 越界 undefined → 母版背景整体丢失。
  if (!Number.isFinite(idx) || idx <= 0 || idx === 1000) return { kind: "none" };
  const entry =
    idx >= 1001 ? ctx.theme?.bgFillStyleLst?.[idx - 1001] : ctx.theme?.fillStyleLst?.[idx - 1];
  if (!entry) return undefined;
  const phClr = resolveColor(node, ctx.theme);
  const phHex = phClr ? phClr.replace(/^#/, "") : undefined;
  const fakeSpPr: XmlNode = { [entry.tag]: entry.raw };
  Object.defineProperty(fakeSpPr, "$children", {
    value: [{ tag: entry.tag, node: entry.raw }],
    enumerable: false,
    configurable: true,
  });
  return parseFill(fakeSpPr, withThemeRels(withPhClr(ctx, phHex)));
}

export function resolveFillRef(idx: number, ctx: FillCtx, phClrHex?: string): Paint | undefined {
  const list = ctx.theme?.fillStyleLst;
  if (!list || idx <= 0) return undefined;
  const entry: ThemeStyleEntry | undefined = list[idx - 1];
  if (!entry) return undefined;
  const fakeSpPr: XmlNode = { [entry.tag]: entry.raw };
  Object.defineProperty(fakeSpPr, "$children", {
    value: [{ tag: entry.tag, node: entry.raw }],
    enumerable: false,
    configurable: true,
  });
  return parseFill(fakeSpPr, withThemeRels(withPhClr(ctx, phClrHex)));
}

// theme styleLst 里的 raw 节点（gradFill/blipFill/...）来自 theme part，其中的
// `r:embed` 是 theme part 作用域的 rId —— 解析时必须切到 theme 的 rels，否则会
// 在 master/slide rels 里误命中同名 rId（典型症状：背景图 src 变成某个 XML 部件字节）。
function withThemeRels(ctx: FillCtx): FillCtx {
  const themeRels = ctx.theme?.rels;
  if (!themeRels) return ctx;
  return { ...ctx, rels: themeRels };
}

export function resolveLnRef(idx: number, ctx: FillCtx, phClrHex?: string): Stroke | undefined {
  const list = ctx.theme?.lnStyleLst;
  if (!list || idx <= 0) return undefined;
  const entry = list[idx - 1];
  if (!entry) return undefined;
  const fakeSpPr: XmlNode = { ln: entry.raw };
  Object.defineProperty(fakeSpPr, "$children", {
    value: [{ tag: "ln", node: entry.raw }],
    enumerable: false,
    configurable: true,
  });
  return resolveShapeStroke(fakeSpPr, withPhClr(ctx, phClrHex), undefined);
}

// ECMA-376 §20.1.4.1.7 — references theme `effectStyleLst[idx-1]/effectLst`.
export function resolveEffectRef(
  idx: number,
  ctx: FillCtx,
  phClrHex?: string,
): ShapeEffect[] {
  const list = ctx.theme?.effectStyleLst;
  if (!list || idx <= 0) return [];
  const entry = list[idx - 1];
  if (!entry) return [];
  const inner = findByLocalName(entry.raw, "effectLst");
  if (!inner) return [];
  const fakeSpPr: XmlNode = { effectLst: inner };
  Object.defineProperty(fakeSpPr, "$children", {
    value: [{ tag: "effectLst", node: inner }],
    enumerable: false,
    configurable: true,
  });
  return parseEffectListFull(fakeSpPr, withPhClr(ctx, phClrHex));
}

// Theme fillStyleLst / lnStyleLst entries reference the `phClr` placeholder
// scheme color. The actual color is supplied by the consumer via the
// fillRef/lnRef child schemeClr in the shape's <p:style>. We inject it into
// a forked schemeColors map so that resolveColor can resolve it.
function withPhClr(ctx: FillCtx, phClrHex: string | undefined): FillCtx {
  if (!phClrHex || !ctx.theme) return ctx;
  const next = new Map(ctx.theme.schemeColors);
  next.set("phClr", phClrHex.toUpperCase().replace(/^#/, ""));
  return { ...ctx, theme: { ...ctx.theme, schemeColors: next } };
}

// ECMA-376 §20.1.8.33 (`<a:gradFill>`). Parses every documented attribute:
//   • flip          — none | x | y | xy
//   • rotWithShape  — gradient rotates with the shape
//   • gsLst/gs      — stops (sorted by pos), each with full color mods + alpha
//   • lin/ang       — linear angle (60000-ths of a degree)
//   • lin/scaled    — angle scales with shape aspect ratio
//   • path/path     — radial path type: circle | rect | shape
//   • fillToRect    — focus rectangle (insets in 1000-ths of a percent)
//   • tileRect      — tile rectangle used when flip != none
function parseGradient(grad: XmlNode, ctx: FillCtx): Paint {
  const flipAttr = attr(grad, "flip");
  const flip =
    flipAttr === "x" || flipAttr === "y" || flipAttr === "xy" || flipAttr === "none"
      ? flipAttr
      : undefined;
  const rotWithShape = boolish(attr(grad, "rotWithShape"));

  const stopList = findByLocalName(grad, "gsLst");
  const stopNodes = findAllByLocalName(stopList, "gs");
  const stops: GradientStop[] = [];
  for (const g of stopNodes) {
    const posAttr = attr(g, "pos");
    if (posAttr === undefined) continue;
    const c = resolveColorEx(g, ctx.theme);
    const stop: GradientStop = {
      offset: clamp01(percentToFloat(posAttr)),
      color: c?.color ?? "#000000",
    };
    if (c && c.alpha < 1) stop.alpha = c.alpha;
    stops.push(stop);
  }
  stops.sort((a, b) => a.offset - b.offset);
  if (stops.length === 0) {
    stops.push({ offset: 0, color: "#000000" });
    stops.push({ offset: 1, color: "#FFFFFF" });
  }

  const tileRect = parseGradientRect(findByLocalName(grad, "tileRect"));

  const lin = findByLocalName(grad, "lin");
  if (lin) {
    const out: LinearGradientPaint = {
      kind: "linear",
      stops,
      angle: angle60kToDeg(attr(lin, "ang")),
    };
    const scaled = boolish(attr(lin, "scaled"));
    if (scaled !== undefined) out.scaled = scaled;
    if (flip !== undefined) out.flip = flip;
    if (rotWithShape !== undefined) out.rotWithShape = rotWithShape;
    if (tileRect) out.tileRect = tileRect;
    return out;
  }

  const pathEl = findByLocalName(grad, "path");
  if (pathEl) {
    const p = attr(pathEl, "path") ?? "circle";
    const pathType: RadialGradientPaint["path"] =
      p === "rect" || p === "shape" ? p : "circle";
    const fillToRect =
      parseGradientRect(findByLocalName(pathEl, "fillToRect")) ?? { l: 0, t: 0, r: 0, b: 0 };
    const out: RadialGradientPaint = {
      kind: "radial",
      stops,
      path: pathType,
      fillToRect,
    };
    if (flip !== undefined) out.flip = flip;
    if (rotWithShape !== undefined) out.rotWithShape = rotWithShape;
    if (tileRect) out.tileRect = tileRect;
    return out;
  }

  return { kind: "linear", stops, angle: 0 };
}

function parseGradientRect(el: XmlNode | undefined): GradientRect | undefined {
  if (!el) return undefined;
  return {
    l: percentToFloat(attr(el, "l")),
    t: percentToFloat(attr(el, "t")),
    r: percentToFloat(attr(el, "r")),
    b: percentToFloat(attr(el, "b")),
  };
}

function parseImage(blip: XmlNode, ctx: FillCtx): Paint | undefined {
  const blipEl = findByLocalName(blip, "blip");
  if (!blipEl) return undefined;
  const embed = attr(blipEl, "r:embed") ?? attr(blipEl, "embed");
  const link = attr(blipEl, "r:link") ?? attr(blipEl, "link");
  const rid = embed ?? link;
  if (!rid) return undefined;
  const path = ctx.rels?.resolve(rid);
  if (!path) return undefined;
  const src = /^https?:\/\//i.test(path) || /^file:/i.test(path) ? path : ctx.resolveImage?.(path);
  if (!src) return undefined;
  const stretch = findByLocalName(blip, "stretch");
  const tile = findByLocalName(blip, "tile");
  const srcRectEl = findByLocalName(blip, "srcRect");
  const srcRect = srcRectEl
    ? {
        l: percentToFloat(attr(srcRectEl, "l")) || 0,
        t: percentToFloat(attr(srcRectEl, "t")) || 0,
        r: percentToFloat(attr(srcRectEl, "r")) || 0,
        b: percentToFloat(attr(srcRectEl, "b")) || 0,
      }
    : undefined;
  let tileAlign: string | undefined;
  let tileSx: number | undefined;
  let tileSy: number | undefined;
  let tileTx: number | undefined;
  let tileTy: number | undefined;
  let tileFlip: "none" | "x" | "y" | "xy" | undefined;
  if (tile) {
    tileAlign = attr(tile, "algn") ?? undefined;
    const sx = attr(tile, "sx");
    const sy = attr(tile, "sy");
    const tx = attr(tile, "tx");
    const ty = attr(tile, "ty");
    if (sx) tileSx = Number(sx) / 100000;
    if (sy) tileSy = Number(sy) / 100000;
    if (tx) tileTx = Number(tx) / 9525;
    if (ty) tileTy = Number(ty) / 9525;
    const fl = attr(tile, "flip");
    if (fl === "x" || fl === "y" || fl === "xy" || fl === "none") tileFlip = fl;
  }
  const dpiAttr = attr(blip, "dpi");
  const dpi = dpiAttr !== undefined ? Number(dpiAttr) : undefined;
  const rotWithShape = boolish(attr(blip, "rotWithShape"));
  const adjust = parseColorAdjust(blipEl);
  const out: Paint = {
    kind: "image",
    src,
    fit: tile ? "tile" : stretch ? "fill" : "cover",
    srcRect,
    tileAlign,
    tileSx,
    tileSy,
    tileTx,
    tileTy,
    tileFlip,
    dpi: Number.isFinite(dpi) ? dpi : undefined,
    rotWithShape,
    adjust: adjust && Object.keys(adjust).length ? adjust : undefined,
  };
  // 简单 alphaModFix（无其它 adjust）→ ImagePaint.alpha，与 serializer blipAlphaXml 对称。
  if (adjust?.alphaModFixed !== undefined) {
    const { alphaModFixed, alphaMod, ...rest } = adjust;
    const onlyAlpha =
      Object.keys(rest).length === 0 &&
      (alphaMod === undefined || alphaMod === alphaModFixed);
    if (onlyAlpha) {
      out.alpha = alphaModFixed;
      delete out.adjust;
    }
  }
  return out;
}

export function parseColorAdjust(blipEl: XmlNode):
  | import("@ppt/core").ImageColorAdjust
  | undefined {
  const adjust: import("@ppt/core").ImageColorAdjust = {};
  for (const child of orderedChildren(blipEl)) {
    const local = stripNs(child.tag);
    const n = child.node;
    if (local === "duotone") {
      const cols: string[] = [];
      for (const cc of orderedChildren(n)) {
        const c = resolveColor(wrapColor(cc.tag, cc.node), undefined);
        if (c) cols.push(c);
      }
      if (cols.length >= 2) adjust.duotone = [cols[0]!, cols[1]!];
    } else if (local === "lum") {
      const bright = attr(n, "bright");
      const contrast = attr(n, "contrast");
      const out: { bright?: number; contrast?: number } = {};
      if (bright !== undefined) out.bright = Number(bright) / 100000;
      if (contrast !== undefined) out.contrast = Number(contrast) / 100000;
      if (Object.keys(out).length) adjust.lum = out;
    } else if (local === "hsl") {
      const hue = attr(n, "hue");
      const sat = attr(n, "sat");
      const lum = attr(n, "lum");
      const out: { hue?: number; sat?: number; lum?: number } = {};
      if (hue !== undefined) out.hue = Number(hue) / 60000;
      if (sat !== undefined) out.sat = Number(sat) / 100000;
      if (lum !== undefined) out.lum = Number(lum) / 100000;
      if (Object.keys(out).length) adjust.hsl = out;
    } else if (local === "grayscl") {
      adjust.grayscale = true;
    } else if (local === "alphaModFix") {
      const amt = attr(n, "amt");
      if (amt !== undefined) adjust.alphaModFixed = Number(amt) / 100000;
      // 兼容旧字段：第一个 alphaModFix 同时写入 alphaMod
      if (adjust.alphaMod === undefined && amt !== undefined) adjust.alphaMod = Number(amt) / 100000;
    } else if (local === "alphaCeiling") {
      adjust.alphaCeiling = true;
    } else if (local === "alphaFloor") {
      adjust.alphaFloor = true;
    } else if (local === "alphaInv") {
      const col = resolveColor(n, undefined);
      adjust.alphaInv = col ? { color: col } : {};
    } else if (local === "alphaReplace" || local === "alphaRepl") {
      const a = attr(n, "a");
      if (a !== undefined) adjust.alphaReplace = Number(a) / 100000;
    } else if (local === "alphaBiLevel") {
      const t = attr(n, "thresh");
      if (t !== undefined) adjust.alphaBiLevel = Number(t) / 100000;
    } else if (local === "alphaOutset") {
      const rad = attr(n, "rad");
      if (rad !== undefined) adjust.alphaOutset = Number(rad) / 12700;
    } else if (local === "biLevel") {
      const t = attr(n, "thresh");
      if (t !== undefined) adjust.biLevel = Number(t) / 100000;
    } else if (local === "blur") {
      const rad = Number(attr(n, "rad") ?? "0") / 12700;
      const grow = attr(n, "grow");
      adjust.blur = { radius: rad, grow: grow !== "0" };
    } else if (local === "clrChange") {
      const fromEl = findByLocalName(n, "clrFrom");
      const toEl = findByLocalName(n, "clrTo");
      const useA = boolish(attr(n, "useA"));
      const fromC = fromEl ? resolveColor(fromEl, undefined) : undefined;
      const toC = toEl ? resolveColor(toEl, undefined) : undefined;
      if (fromC && toC) adjust.clrChange = { from: fromC, to: toC, useA };
    } else if (local === "clrRepl") {
      const c = resolveColor(n, undefined);
      if (c) adjust.clrRepl = c;
    } else if (local === "fillOverlay") {
      const blend = attr(n, "blend");
      const c = resolveColor(n, undefined);
      const validBlend =
        blend === "over" || blend === "mult" || blend === "screen" || blend === "darken" || blend === "lighten"
          ? blend
          : undefined;
      adjust.fillOverlay = { color: c ?? "#000000", blend: validBlend };
    } else if (local === "tint") {
      const hue = attr(n, "hue");
      const amt = attr(n, "amt");
      const out: { hue?: number; amount?: number } = {};
      if (hue !== undefined) out.hue = Number(hue) / 60000;
      if (amt !== undefined) out.amount = Number(amt) / 100000;
      if (Object.keys(out).length) adjust.tint = out;
    }
  }
  return Object.keys(adjust).length ? adjust : undefined;
}

function wrapColor(tag: string, node: XmlNode): XmlNode {
  const wrap: XmlNode = { [tag]: node };
  Object.defineProperty(wrap, "$children", {
    value: [{ tag, node }],
    enumerable: false,
    configurable: true,
  });
  return wrap;
}

// ECMA-376 §20.1.10.49 (ST_PresetLineDashVal) standard dash patterns.
function dashFromPrst(style: string, width: number): number[] | undefined {
  switch (style) {
    case "solid": return undefined;
    case "dash": return [width * 4, width * 3];
    case "dashDot": return [width * 4, width * 3, width, width * 3];
    case "dot": return [width, width * 3];
    case "lgDash": return [width * 8, width * 3];
    case "lgDashDot": return [width * 8, width * 3, width, width * 3];
    case "lgDashDotDot": return [width * 8, width * 3, width, width * 3, width, width * 3];
    case "sysDash": return [width * 3, width];
    case "sysDashDot": return [width * 3, width, width, width];
    case "sysDashDotDot": return [width * 3, width, width, width, width, width];
    case "sysDot": return [width, width];
    default: return undefined;
  }
}

// ECMA-376 §20.1.2.2.24 (`<a:ln>`). Performs property-level merge with the
// supplied base stroke (resolved from `<a:lnRef>`):
//   • no `<a:ln>` element                    → returns base stroke
//   • `<a:ln><a:noFill/></a:ln>`             → undefined (explicitly disables stroke)
//   • `<a:ln w="…"><a:headEnd/></a:ln>`     → base stroke with width override
//   • `<a:ln><a:solidFill>…</a:solidFill></a:ln>` → base stroke with paint override
// Each child element overrides the corresponding base property; missing
// children inherit from the base (per OOXML inheritance model §20.1.2.2.24).
function isStrokeCompound(v: string | undefined): v is StrokeCompound {
  return v === "sng" || v === "dbl" || v === "thickThin" || v === "thinThick" || v === "tri";
}

function isStrokeAlign(v: string | undefined): v is StrokeAlign {
  return v === "ctr" || v === "in";
}

// ECMA-376 §20.1.10.31 ST_LineCap: rnd | sq | flat → CSS butt/round/square。
function mapCap(v: string | undefined): Stroke["cap"] | undefined {
  if (v === "rnd" || v === "round") return "round";
  if (v === "sq" || v === "square") return "square";
  if (v === "flat" || v === "butt") return "butt";
  return undefined;
}

function isDashPreset(v: string | undefined): v is StrokeDashPreset {
  switch (v) {
    case "solid":
    case "dot":
    case "dash":
    case "lgDash":
    case "dashDot":
    case "lgDashDot":
    case "lgDashDotDot":
    case "sysDash":
    case "sysDot":
    case "sysDashDot":
    case "sysDashDotDot":
      return true;
    default:
      return false;
  }
}

// ECMA-376 §20.1.2.2.24 ln@w 默认值是 0，但 PowerPoint / WPS 实际渲染时会把
// "有可见 paint 但 w=0 / w 缺省" 的描边钳位到设备最小可见线宽（"hairline"）。
// 实测 PPT 把 hairline 渲染为约 0.75pt = 1px @96dpi（= 9525 EMU）。这里采用
// 同样的钳位，保证 `<a:ln w="0"><a:solidFill/></a:ln>` / `<a:ln w="0"/>`（继承
// 到非 noFill paint）都能可见地画出来，而不是被 SVG 的 stroke-width:0 隐藏。
const HAIRLINE_PX = 1;

export function resolveShapeStroke(
  spPr: XmlNode | undefined,
  ctx: FillCtx,
  baseStroke: Stroke | undefined,
): Stroke | undefined {
  if (!spPr) return baseStroke;
  const ln = findByLocalName(spPr, "ln");
  if (!ln) return baseStroke;
  if (findByLocalName(ln, "noFill")) return undefined;
  const hasFillSpec =
    !!findByLocalName(ln, "solidFill") ||
    !!findByLocalName(ln, "gradFill") ||
    !!findByLocalName(ln, "pattFill") ||
    !!findByLocalName(ln, "blipFill");
  const paintOverride = hasFillSpec ? parseFill(ln, ctx) : undefined;
  const widthAttr = attr(ln, "w");
  // §20.1.2.2.24 — 解析 w：
  //   • 缺省（`<a:ln>` 不带 w）→ widthOverride=undefined，回落到 baseStroke.width。
  //   • w="0" → 显式 0，下文统一钳位到 hairline（前提是最终有可见 paint）。
  //   • w>0  → 按 EMU/9525 转 px。
  const widthOverride =
    widthAttr !== undefined && widthAttr !== ""
      ? Number(widthAttr) / 9525
      : undefined;
  const capAttr = mapCap(attr(ln, "cap"));
  const cmpdAttr = attr(ln, "cmpd");
  const cmpdOverride: StrokeCompound | undefined = isStrokeCompound(cmpdAttr) ? cmpdAttr : undefined;
  const algnAttr = attr(ln, "algn");
  const algnOverride: StrokeAlign | undefined = isStrokeAlign(algnAttr) ? algnAttr : undefined;
  let joinOverride: Stroke["join"] | undefined;
  let miterLimitOverride: number | undefined;
  const miterEl = findByLocalName(ln, "miter");
  if (miterEl) {
    joinOverride = "miter";
    const lim = attr(miterEl, "lim");
    if (lim !== undefined) {
      const n = Number(lim) / 100000;
      if (Number.isFinite(n)) miterLimitOverride = n;
    }
  } else if (findByLocalName(ln, "round")) joinOverride = "round";
  else if (findByLocalName(ln, "bevel")) joinOverride = "bevel";
  const dashEl = findByLocalName(ln, "prstDash");
  const dashStyle = attr(dashEl, "val");
  const custDashEl = findByLocalName(ln, "custDash");
  // dash 段长度以 stroke-width 为单位换算。w=0 时 PowerPoint 用 hairline 宽度
  // 来折算 dash，所以这里同步钳位，避免出现「0×N=0」的隐形虚线。
  const widthForDashRaw = widthOverride ?? baseStroke?.width ?? 0;
  const widthForDash = widthForDashRaw > 0 ? widthForDashRaw : HAIRLINE_PX;
  let dashOverride: number[] | undefined;
  let dashPresetOverride: StrokeDashPreset | undefined;
  let custDashOverride: CustomDashStop[] | undefined;
  let hasDashOverride = false;
  if (custDashEl) {
    const stops: CustomDashStop[] = [];
    for (const ds of findAllByLocalName(custDashEl, "ds")) {
      const d = Number(attr(ds, "d") ?? "0") / 100000;
      const sp = Number(attr(ds, "sp") ?? "0") / 100000;
      if (Number.isFinite(d) && Number.isFinite(sp)) stops.push({ d, sp });
    }
    if (stops.length) {
      custDashOverride = stops;
      // 把 ds 段（以 stroke-width 倍数表示）转换成 px 数组用于直接渲染。
      dashOverride = stops.flatMap((s) => [s.d * widthForDash, s.sp * widthForDash]);
      hasDashOverride = true;
    }
  } else if (dashStyle) {
    dashOverride = dashFromPrst(dashStyle, widthForDash);
    if (isDashPreset(dashStyle)) dashPresetOverride = dashStyle;
    hasDashOverride = true;
  }
  const headEndOverride = parseArrowEnd(findByLocalName(ln, "headEnd"));
  const tailEndOverride = parseArrowEnd(findByLocalName(ln, "tailEnd"));
  const paint = paintOverride ?? baseStroke?.paint;
  if (!paint || paint.kind === "none") return undefined;
  // 经过 paint 检查：到这里 paint 一定存在且非 noFill，因此 PowerPoint / WPS
  // 都会画出可见线条；把 w=0 / 全链条都没有正向 width 的情形钳位到 hairline。
  const resolvedWidth = widthOverride ?? baseStroke?.width ?? 0;
  const finalWidth = resolvedWidth > 0 ? resolvedWidth : HAIRLINE_PX;
  return {
    paint,
    width: finalWidth,
    dash: hasDashOverride ? dashOverride : baseStroke?.dash,
    dashPreset: hasDashOverride ? dashPresetOverride : baseStroke?.dashPreset,
    custDash: hasDashOverride ? custDashOverride : baseStroke?.custDash,
    cap: capAttr ?? baseStroke?.cap,
    join: joinOverride ?? baseStroke?.join,
    miterLimit: miterLimitOverride ?? baseStroke?.miterLimit,
    cmpd: cmpdOverride ?? baseStroke?.cmpd,
    align: algnOverride ?? baseStroke?.align,
    headEnd: headEndOverride ?? baseStroke?.headEnd,
    tailEnd: tailEndOverride ?? baseStroke?.tailEnd,
  };
}

// Legacy entrypoint retained for `<a:lnL/lnR/lnT/lnB>` (table cell sides) which
// have the same content model as `<a:ln>` but no inheritance source.
export function parseStroke(spPr: XmlNode | undefined, ctx: FillCtx): Stroke | undefined {
  return resolveShapeStroke(spPr, ctx, undefined);
}

export function parseEffectLst(
  spPr: XmlNode | undefined,
  ctx: FillCtx,
): ShadowEffect | undefined {
  const list = parseEffectListFull(spPr, ctx);
  for (const e of list) {
    if (e.kind === "outer" || e.kind === "inner") return e;
  }
  return undefined;
}

// ECMA-376 §20.1.8.26 (`<a:effectLst>`). Returns:
//   `undefined` — element absent, caller should inherit from `<a:effectRef>`.
//   `[]`        — element present but empty, explicitly clears inherited effects.
//   `[...]`     — resolved list of effects.
export function parseEffectListWithPresence(
  spPr: XmlNode | undefined,
  ctx: FillCtx,
): ShapeEffect[] | undefined {
  if (!spPr) return undefined;
  const effectLst = findByLocalName(spPr, "effectLst");
  const effectDag = findByLocalName(spPr, "effectDag");
  if (!effectLst && !effectDag) return undefined;
  const out: ShapeEffect[] = [];
  if (effectLst) out.push(...parseEffectListFull(spPr, ctx));
  if (effectDag) out.push(...parseEffectDag(spPr, ctx));
  return out;
}

export function parseEffectListFull(
  spPr: XmlNode | undefined,
  ctx: FillCtx,
): ShapeEffect[] {
  if (!spPr) return [];
  const effectLst = findByLocalName(spPr, "effectLst");
  if (!effectLst) return [];
  // ECMA-376 §20.1.8.26 effectLst — 也接受 effectDag 内的 cont/effectLst 嵌套（递归扁平化）。
  return readEffectChildren(effectLst, ctx);
}

function readEffectChildren(parent: XmlNode, ctx: FillCtx): ShapeEffect[] {
  const out: ShapeEffect[] = [];
  for (const c of orderedChildren(parent)) {
    const local = stripNs(c.tag);
    const n = c.node;
    if (local === "outerShdw") {
      const s = readShadow(n, "outer", ctx);
      if (s) out.push(s);
    } else if (local === "innerShdw") {
      const s = readShadow(n, "inner", ctx);
      if (s) out.push(s);
    } else if (local === "prstShdw") {
      const s = readPresetShadow(n, ctx);
      if (s) out.push(s);
    } else if (local === "glow") {
      const g = readGlow(n, ctx);
      if (g) out.push(g);
    } else if (local === "softEdge") {
      const r = Number(attr(n, "rad") ?? "0") / 12700;
      if (Number.isFinite(r) && r > 0) {
        const se: SoftEdgeEffect = { kind: "softEdge", radius: r };
        out.push(se);
      }
    } else if (local === "reflection") {
      const r = readReflection(n);
      if (r) out.push(r);
    } else if (local === "blur") {
      const rad = Number(attr(n, "rad") ?? "0") / 12700;
      if (rad > 0) out.push({ kind: "blur", radius: rad, grow: attr(n, "grow") !== "0" });
    } else if (local === "biLevel") {
      const t = Number(attr(n, "thresh") ?? "0") / 100000;
      out.push({ kind: "biLevel", threshold: t });
    } else if (local === "duotone") {
      const cols: string[] = [];
      for (const cc of orderedChildren(n)) {
        const c2 = resolveColor(wrapColor(cc.tag, cc.node), ctx.theme);
        if (c2) cols.push(c2);
      }
      if (cols.length >= 2) out.push({ kind: "duotone", from: cols[0]!, to: cols[1]! });
    } else if (local === "grayscl") {
      out.push({ kind: "grayscl" });
    } else if (local === "clrChange") {
      const fromEl = findByLocalName(n, "clrFrom");
      const toEl = findByLocalName(n, "clrTo");
      const fromC = fromEl ? resolveColor(fromEl, ctx.theme) : undefined;
      const toC = toEl ? resolveColor(toEl, ctx.theme) : undefined;
      const useA = boolish(attr(n, "useA"));
      if (fromC && toC) out.push({ kind: "clrChange", from: fromC, to: toC, useA });
    } else if (local === "clrRepl") {
      const c2 = resolveColor(n, ctx.theme);
      if (c2) out.push({ kind: "clrRepl", color: c2 });
    } else if (local === "lum") {
      const bright = attr(n, "bright");
      const contrast = attr(n, "contrast");
      const e: import("@ppt/core").LumEffect = { kind: "lum" };
      if (bright !== undefined) e.bright = Number(bright) / 100000;
      if (contrast !== undefined) e.contrast = Number(contrast) / 100000;
      out.push(e);
    } else if (local === "hsl") {
      const e: import("@ppt/core").HslEffect = { kind: "hsl" };
      const hue = attr(n, "hue");
      const sat = attr(n, "sat");
      const lum = attr(n, "lum");
      if (hue !== undefined) e.hue = Number(hue) / 60000;
      if (sat !== undefined) e.sat = Number(sat) / 100000;
      if (lum !== undefined) e.lum = Number(lum) / 100000;
      out.push(e);
    } else if (local === "tint") {
      const e: import("@ppt/core").TintColorEffect = { kind: "tint" };
      const hue = attr(n, "hue");
      const amt = attr(n, "amt");
      if (hue !== undefined) e.hue = Number(hue) / 60000;
      if (amt !== undefined) e.amount = Number(amt) / 100000;
      out.push(e);
    } else if (local === "fillOverlay") {
      const blend = attr(n, "blend");
      const validBlend =
        blend === "over" || blend === "mult" || blend === "screen" || blend === "darken" || blend === "lighten"
          ? blend
          : undefined;
      const c2 = resolveColor(n, ctx.theme);
      out.push({ kind: "fillOverlay", color: c2, blend: validBlend });
    } else if (local === "xfrm") {
      const e: import("@ppt/core").XfrmEffect = { kind: "xfrm" };
      const sx = attr(n, "sx");
      const sy = attr(n, "sy");
      const kx = attr(n, "kx");
      const ky = attr(n, "ky");
      const tx = attr(n, "tx");
      const ty = attr(n, "ty");
      if (sx !== undefined) e.sx = Number(sx) / 100000;
      if (sy !== undefined) e.sy = Number(sy) / 100000;
      if (kx !== undefined) e.kx = Number(kx) / 60000;
      if (ky !== undefined) e.ky = Number(ky) / 60000;
      if (tx !== undefined) e.tx = Number(tx) / 9525;
      if (ty !== undefined) e.ty = Number(ty) / 9525;
      out.push(e);
    } else if (local === "alphaCeiling") {
      out.push({ kind: "alphaCeiling" });
    } else if (local === "alphaFloor") {
      out.push({ kind: "alphaFloor" });
    } else if (local === "alphaInv") {
      const c2 = resolveColor(n, ctx.theme);
      out.push({ kind: "alphaInv", color: c2 });
    } else if (local === "alphaMod") {
      out.push({ kind: "alphaMod" });
    } else if (local === "alphaModFix") {
      const amt = Number(attr(n, "amt") ?? "100000") / 100000;
      out.push({ kind: "alphaModFix", amount: amt });
    } else if (local === "alphaReplace") {
      const a = Number(attr(n, "a") ?? "100000") / 100000;
      out.push({ kind: "alphaReplace", alpha: a });
    } else if (local === "alphaOutset") {
      const rad = Number(attr(n, "rad") ?? "0") / 12700;
      out.push({ kind: "alphaOutset", radius: rad });
    } else if (local === "alphaBiLevel") {
      const t = Number(attr(n, "thresh") ?? "0") / 100000;
      out.push({ kind: "alphaBiLevel", threshold: t });
    } else if (local === "blend") {
      // ECMA-376 §20.1.8.20 blend — 在 effectDag 内组合多路效果。
      const b = attr(n, "blend") ?? "over";
      out.push({ kind: "blend", blend: b });
      // 递归读取嵌套的 cont 子效果
      const cont = findByLocalName(n, "cont");
      if (cont) out.push(...readEffectChildren(cont, ctx));
    } else if (local === "relOff") {
      const e: import("@ppt/core").RelOffsetEffect = { kind: "relOff" };
      const tx = attr(n, "tx");
      const ty = attr(n, "ty");
      if (tx !== undefined) e.tx = Number(tx) / 100000;
      if (ty !== undefined) e.ty = Number(ty) / 100000;
      out.push(e);
    } else if (local === "cont" || local === "effectDag" || local === "effectLst") {
      // 容器：直接展开内部子效果。
      out.push(...readEffectChildren(n, ctx));
    }
  }
  return out;
}

// ECMA-376 §20.1.8.25 effectDag — 与 effectLst 同级（互斥）。当出现时同样
// 视为 ShapeEffect 列表，递归读取容器子效果。
export function parseEffectDag(spPr: XmlNode | undefined, ctx: FillCtx): ShapeEffect[] {
  if (!spPr) return [];
  const dag = findByLocalName(spPr, "effectDag");
  if (!dag) return [];
  return readEffectChildren(dag, ctx);
}

function readGlow(node: XmlNode, ctx: FillCtx): GlowEffect | undefined {
  const radius = Number(attr(node, "rad") ?? "0") / 12700;
  if (!Number.isFinite(radius) || radius <= 0) return undefined;
  const c = resolveColorEx(node, ctx.theme);
  return { kind: "glow", radius, color: c?.color ?? "#000000", alpha: c?.alpha ?? 1 };
}

function readReflection(node: XmlNode): ReflectionEffect | undefined {
  const blur = Number(attr(node, "blurRad") ?? "0") / 12700;
  const startAlpha = Number(attr(node, "stA") ?? "100000") / 100000;
  const endAlpha = Number(attr(node, "endA") ?? "0") / 100000;
  const startPos = Number(attr(node, "stPos") ?? "0") / 100000;
  const endPos = Number(attr(node, "endPos") ?? "100000") / 100000;
  const dir = angle60kToDeg(attr(node, "dir"));
  const dist = Number(attr(node, "dist") ?? "0") / 12700;
  const fadeDirAttr = attr(node, "fadeDir");
  const sxAttr = attr(node, "sx");
  const syAttr = attr(node, "sy");
  const algn = attr(node, "algn");
  const rotWithShape = boolish(attr(node, "rotWithShape"));
  const out: ReflectionEffect = { kind: "reflection", blur, startAlpha, endAlpha, startPos, endPos, dir, dist };
  if (fadeDirAttr !== undefined) out.fadeDir = angle60kToDeg(fadeDirAttr);
  if (sxAttr !== undefined) out.sx = Number(sxAttr) / 100000;
  if (syAttr !== undefined) out.sy = Number(syAttr) / 100000;
  if (algn) out.algn = algn as ReflectionEffect["algn"];
  if (rotWithShape !== undefined) out.rotWithShape = rotWithShape;
  return out;
}

function readShadow(
  node: XmlNode,
  kind: "outer" | "inner",
  ctx: FillCtx,
): ShadowEffect | undefined {
  const blur = Number(attr(node, "blurRad") ?? "0") / 12700;
  const dist = Number(attr(node, "dist") ?? "0") / 12700;
  const dirDeg = angle60kToDeg(attr(node, "dir"));
  const rad = (dirDeg * Math.PI) / 180;
  const dx = Math.cos(rad) * dist;
  const dy = Math.sin(rad) * dist;
  const c = resolveColorEx(node, ctx.theme);
  const out: ShadowEffect = {
    kind,
    blur,
    dx,
    dy,
    color: c?.color ?? "#000000",
    alpha: c?.alpha ?? 1,
    dir: dirDeg,
    dist,
  };
  if (kind === "outer") {
    const sxAttr = attr(node, "sx");
    const syAttr = attr(node, "sy");
    const kxAttr = attr(node, "kx");
    const kyAttr = attr(node, "ky");
    const algn = attr(node, "algn");
    const rotWithShape = boolish(attr(node, "rotWithShape"));
    if (sxAttr !== undefined) out.sx = Number(sxAttr) / 100000;
    if (syAttr !== undefined) out.sy = Number(syAttr) / 100000;
    if (kxAttr !== undefined) out.skewX = angle60kToDeg(kxAttr);
    if (kyAttr !== undefined) out.skewY = angle60kToDeg(kyAttr);
    if (algn) out.algn = algn as ShadowEffect["algn"];
    if (rotWithShape !== undefined) out.rotWithShape = rotWithShape;
  }
  return out;
}

// ECMA-376 §20.1.8.49 (`<a:prstShdw>`). 透视阴影：
// `prst` 取 ST_PresetShadowVal（shdw1..shdw20，对应 PowerPoint 内置样式）。
// 几何上等价于带固定方向/距离的 outer shadow，因此规范化为 ShadowEffect。
function readPresetShadow(node: XmlNode, ctx: FillCtx): ShadowEffect | undefined {
  const prst = attr(node, "prst");
  const dist = Number(attr(node, "dist") ?? "0") / 12700;
  const dirDeg = angle60kToDeg(attr(node, "dir"));
  const rad = (dirDeg * Math.PI) / 180;
  const dx = Math.cos(rad) * dist;
  const dy = Math.sin(rad) * dist;
  const c = resolveColorEx(node, ctx.theme);
  const out: ShadowEffect = {
    kind: "outer",
    blur: 0,
    dx,
    dy,
    color: c?.color ?? "#000000",
    alpha: c?.alpha ?? 1,
    dir: dirDeg,
    dist,
  };
  if (prst) out.prst = prst;
  return out;
}

// OOXML path-level fill modifiers (norm/lighten/lightenLess/darken/darkenLess).
// Tint factor mixes the color with white; shade factor multiplies toward black.
// Values match PowerPoint's documented behavior for path-fill modifiers.
const TINT_LIGHTEN = 0.5;
const TINT_LIGHTEN_LESS = 0.2;
const SHADE_DARKEN = 0.5;
const SHADE_DARKEN_LESS = 0.8;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function tintHex(hex: string, t: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  const f = clamp01(t);
  const r = Math.round(c.r + (255 - c.r) * f);
  const g = Math.round(c.g + (255 - c.g) * f);
  const b = Math.round(c.b + (255 - c.b) * f);
  return rgbToHex(r, g, b);
}

function shadeHex(hex: string, s: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  const f = clamp01(s);
  return rgbToHex(Math.round(c.r * f), Math.round(c.g * f), Math.round(c.b * f));
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1]!, 16);
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}

export function modulateColor(
  hex: string,
  mod: "lighten" | "lightenLess" | "darken" | "darkenLess",
): string {
  switch (mod) {
    case "lighten":
      return tintHex(hex, TINT_LIGHTEN);
    case "lightenLess":
      return tintHex(hex, TINT_LIGHTEN_LESS);
    case "darken":
      return shadeHex(hex, SHADE_DARKEN);
    case "darkenLess":
      return shadeHex(hex, SHADE_DARKEN_LESS);
  }
}

export function modulatePaint(
  paint: Paint | undefined,
  mod: "norm" | "lighten" | "lightenLess" | "darken" | "darkenLess" | "none",
): Paint | undefined {
  if (!paint) return paint;
  if (mod === "norm") return paint;
  if (mod === "none") return { kind: "none" };
  if (paint.kind === "solid") return { ...paint, color: modulateColor(paint.color, mod) };
  if (paint.kind === "linear" || paint.kind === "radial") {
    return {
      ...paint,
      stops: paint.stops.map((s) => ({ ...s, color: modulateColor(s.color, mod) })),
    };
  }
  return paint;
}

function parseArrowEnd(node: XmlNode | undefined): import("@ppt/core").ArrowEnd | undefined {
  if (!node) return undefined;
  const t = attr(node, "type");
  if (!t || t === "none") return undefined;
  const w = attr(node, "w");
  const len = attr(node, "len");
  return {
    kind: t as import("@ppt/core").ArrowKind,
    w: (w as "sm" | "med" | "lg" | undefined) ?? undefined,
    len: (len as "sm" | "med" | "lg" | undefined) ?? undefined,
  };
}
