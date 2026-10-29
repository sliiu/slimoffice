"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFill = parseFill;
exports.resolveBgRef = resolveBgRef;
exports.resolveFillRef = resolveFillRef;
exports.resolveLnRef = resolveLnRef;
exports.resolveEffectRef = resolveEffectRef;
exports.parseColorAdjust = parseColorAdjust;
exports.resolveShapeStroke = resolveShapeStroke;
exports.parseStroke = parseStroke;
exports.parseEffectLst = parseEffectLst;
exports.parseEffectListWithPresence = parseEffectListWithPresence;
exports.parseEffectListFull = parseEffectListFull;
exports.parseEffectDag = parseEffectDag;
exports.modulateColor = modulateColor;
exports.modulatePaint = modulatePaint;
const units_1 = require("./units");
const xml_1 = require("./xml");
const theme_1 = require("./theme");
function parseFill(spPr, ctx) {
    if (!spPr)
        return undefined;
    if ((0, xml_1.findByLocalName)(spPr, "noFill"))
        return { kind: "none" };
    const solid = (0, xml_1.findByLocalName)(spPr, "solidFill");
    if (solid) {
        const c = (0, theme_1.resolveColorEx)(solid, ctx.theme);
        if (c) {
            const out = { kind: "solid", color: c.color };
            if (c.alpha < 1)
                out.alpha = c.alpha;
            return out;
        }
    }
    const grad = (0, xml_1.findByLocalName)(spPr, "gradFill");
    if (grad)
        return parseGradient(grad, ctx);
    const blip = (0, xml_1.findByLocalName)(spPr, "blipFill");
    if (blip)
        return parseImage(blip, ctx);
    const patt = (0, xml_1.findByLocalName)(spPr, "pattFill");
    if (patt)
        return parsePattern(patt, ctx);
    if ((0, xml_1.findByLocalName)(spPr, "grpFill"))
        return { kind: "groupFill" };
    return undefined;
}
// ECMA-376 §20.1.8.47 (`<a:pattFill>`). 图案填充：
//   • prst — 预设图案名称（pct5/pct10/.../weave/cross/...）
//   • fgClr — 前景色
//   • bgClr — 背景色
function parsePattern(node, ctx) {
    const prst = (0, xml_1.attr)(node, "prst") ?? "pct50";
    const fgEl = (0, xml_1.findByLocalName)(node, "fgClr");
    const bgEl = (0, xml_1.findByLocalName)(node, "bgClr");
    const fg = fgEl ? (0, theme_1.resolveColorEx)(fgEl, ctx.theme) : undefined;
    const bg = bgEl ? (0, theme_1.resolveColorEx)(bgEl, ctx.theme) : undefined;
    const out = {
        kind: "pattern",
        prst,
        fg: fg?.color ?? "#000000",
        bg: bg?.color ?? "#FFFFFF",
    };
    if (fg && fg.alpha < 1)
        out.fgAlpha = fg.alpha;
    if (bg && bg.alpha < 1)
        out.bgAlpha = bg.alpha;
    return out;
}
// ECMA-376 §20.1.4.2.3 (`<p:bgRef>`). 引用主题 bgFillStyleLst[idx-1] 的填充。
// idx==0 表示 noFill。phClr（schemeClr 子节点）作为占位色注入解析上下文。
function resolveBgRef(node, ctx) {
    const idxAttr = (0, xml_1.attr)(node, "idx");
    const idx = idxAttr ? Number(idxAttr) : 0;
    // ECMA-376 §20.1.4.2.3 bgRef@idx：0 或 1000 = 无背景；1..999 → fillStyleLst[idx-1]；
    // 1001.. → bgFillStyleLst[idx-1001]。之前统一按 list[idx-1] 取 bgFillStyleLst，
    // 而真实文件里 bgRef 几乎都是 1001..1003 → 越界 undefined → 母版背景整体丢失。
    if (!Number.isFinite(idx) || idx <= 0 || idx === 1000)
        return { kind: "none" };
    const entry = idx >= 1001 ? ctx.theme?.bgFillStyleLst?.[idx - 1001] : ctx.theme?.fillStyleLst?.[idx - 1];
    if (!entry)
        return undefined;
    const phClr = (0, theme_1.resolveColor)(node, ctx.theme);
    const phHex = phClr ? phClr.replace(/^#/, "") : undefined;
    const fakeSpPr = { [entry.tag]: entry.raw };
    Object.defineProperty(fakeSpPr, "$children", {
        value: [{ tag: entry.tag, node: entry.raw }],
        enumerable: false,
        configurable: true,
    });
    return parseFill(fakeSpPr, withThemeRels(withPhClr(ctx, phHex)));
}
function resolveFillRef(idx, ctx, phClrHex) {
    const list = ctx.theme?.fillStyleLst;
    if (!list || idx <= 0)
        return undefined;
    const entry = list[idx - 1];
    if (!entry)
        return undefined;
    const fakeSpPr = { [entry.tag]: entry.raw };
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
function withThemeRels(ctx) {
    const themeRels = ctx.theme?.rels;
    if (!themeRels)
        return ctx;
    return { ...ctx, rels: themeRels };
}
function resolveLnRef(idx, ctx, phClrHex) {
    const list = ctx.theme?.lnStyleLst;
    if (!list || idx <= 0)
        return undefined;
    const entry = list[idx - 1];
    if (!entry)
        return undefined;
    const fakeSpPr = { ln: entry.raw };
    Object.defineProperty(fakeSpPr, "$children", {
        value: [{ tag: "ln", node: entry.raw }],
        enumerable: false,
        configurable: true,
    });
    return resolveShapeStroke(fakeSpPr, withPhClr(ctx, phClrHex), undefined);
}
// ECMA-376 §20.1.4.1.7 — references theme `effectStyleLst[idx-1]/effectLst`.
function resolveEffectRef(idx, ctx, phClrHex) {
    const list = ctx.theme?.effectStyleLst;
    if (!list || idx <= 0)
        return [];
    const entry = list[idx - 1];
    if (!entry)
        return [];
    const inner = (0, xml_1.findByLocalName)(entry.raw, "effectLst");
    if (!inner)
        return [];
    const fakeSpPr = { effectLst: inner };
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
function withPhClr(ctx, phClrHex) {
    if (!phClrHex || !ctx.theme)
        return ctx;
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
function parseGradient(grad, ctx) {
    const flipAttr = (0, xml_1.attr)(grad, "flip");
    const flip = flipAttr === "x" || flipAttr === "y" || flipAttr === "xy" || flipAttr === "none"
        ? flipAttr
        : undefined;
    const rotWithShape = (0, units_1.boolish)((0, xml_1.attr)(grad, "rotWithShape"));
    const stopList = (0, xml_1.findByLocalName)(grad, "gsLst");
    const stopNodes = (0, xml_1.findAllByLocalName)(stopList, "gs");
    const stops = [];
    for (const g of stopNodes) {
        const posAttr = (0, xml_1.attr)(g, "pos");
        if (posAttr === undefined)
            continue;
        const c = (0, theme_1.resolveColorEx)(g, ctx.theme);
        const stop = {
            offset: clamp01((0, units_1.percentToFloat)(posAttr)),
            color: c?.color ?? "#000000",
        };
        if (c && c.alpha < 1)
            stop.alpha = c.alpha;
        stops.push(stop);
    }
    stops.sort((a, b) => a.offset - b.offset);
    if (stops.length === 0) {
        stops.push({ offset: 0, color: "#000000" });
        stops.push({ offset: 1, color: "#FFFFFF" });
    }
    const tileRect = parseGradientRect((0, xml_1.findByLocalName)(grad, "tileRect"));
    const lin = (0, xml_1.findByLocalName)(grad, "lin");
    if (lin) {
        const out = {
            kind: "linear",
            stops,
            angle: (0, units_1.angle60kToDeg)((0, xml_1.attr)(lin, "ang")),
        };
        const scaled = (0, units_1.boolish)((0, xml_1.attr)(lin, "scaled"));
        if (scaled !== undefined)
            out.scaled = scaled;
        if (flip !== undefined)
            out.flip = flip;
        if (rotWithShape !== undefined)
            out.rotWithShape = rotWithShape;
        if (tileRect)
            out.tileRect = tileRect;
        return out;
    }
    const pathEl = (0, xml_1.findByLocalName)(grad, "path");
    if (pathEl) {
        const p = (0, xml_1.attr)(pathEl, "path") ?? "circle";
        const pathType = p === "rect" || p === "shape" ? p : "circle";
        const fillToRect = parseGradientRect((0, xml_1.findByLocalName)(pathEl, "fillToRect")) ?? { l: 0, t: 0, r: 0, b: 0 };
        const out = {
            kind: "radial",
            stops,
            path: pathType,
            fillToRect,
        };
        if (flip !== undefined)
            out.flip = flip;
        if (rotWithShape !== undefined)
            out.rotWithShape = rotWithShape;
        if (tileRect)
            out.tileRect = tileRect;
        return out;
    }
    return { kind: "linear", stops, angle: 0 };
}
function parseGradientRect(el) {
    if (!el)
        return undefined;
    return {
        l: (0, units_1.percentToFloat)((0, xml_1.attr)(el, "l")),
        t: (0, units_1.percentToFloat)((0, xml_1.attr)(el, "t")),
        r: (0, units_1.percentToFloat)((0, xml_1.attr)(el, "r")),
        b: (0, units_1.percentToFloat)((0, xml_1.attr)(el, "b")),
    };
}
function parseImage(blip, ctx) {
    const blipEl = (0, xml_1.findByLocalName)(blip, "blip");
    if (!blipEl)
        return undefined;
    const embed = (0, xml_1.attr)(blipEl, "r:embed") ?? (0, xml_1.attr)(blipEl, "embed");
    const link = (0, xml_1.attr)(blipEl, "r:link") ?? (0, xml_1.attr)(blipEl, "link");
    const rid = embed ?? link;
    if (!rid)
        return undefined;
    const path = ctx.rels?.resolve(rid);
    if (!path)
        return undefined;
    const src = /^https?:\/\//i.test(path) || /^file:/i.test(path) ? path : ctx.resolveImage?.(path);
    if (!src)
        return undefined;
    const stretch = (0, xml_1.findByLocalName)(blip, "stretch");
    const tile = (0, xml_1.findByLocalName)(blip, "tile");
    const srcRectEl = (0, xml_1.findByLocalName)(blip, "srcRect");
    const srcRect = srcRectEl
        ? {
            l: (0, units_1.percentToFloat)((0, xml_1.attr)(srcRectEl, "l")) || 0,
            t: (0, units_1.percentToFloat)((0, xml_1.attr)(srcRectEl, "t")) || 0,
            r: (0, units_1.percentToFloat)((0, xml_1.attr)(srcRectEl, "r")) || 0,
            b: (0, units_1.percentToFloat)((0, xml_1.attr)(srcRectEl, "b")) || 0,
        }
        : undefined;
    let tileAlign;
    let tileSx;
    let tileSy;
    let tileTx;
    let tileTy;
    let tileFlip;
    if (tile) {
        tileAlign = (0, xml_1.attr)(tile, "algn") ?? undefined;
        const sx = (0, xml_1.attr)(tile, "sx");
        const sy = (0, xml_1.attr)(tile, "sy");
        const tx = (0, xml_1.attr)(tile, "tx");
        const ty = (0, xml_1.attr)(tile, "ty");
        if (sx)
            tileSx = Number(sx) / 100000;
        if (sy)
            tileSy = Number(sy) / 100000;
        if (tx)
            tileTx = Number(tx) / 9525;
        if (ty)
            tileTy = Number(ty) / 9525;
        const fl = (0, xml_1.attr)(tile, "flip");
        if (fl === "x" || fl === "y" || fl === "xy" || fl === "none")
            tileFlip = fl;
    }
    const dpiAttr = (0, xml_1.attr)(blip, "dpi");
    const dpi = dpiAttr !== undefined ? Number(dpiAttr) : undefined;
    const rotWithShape = (0, units_1.boolish)((0, xml_1.attr)(blip, "rotWithShape"));
    const adjust = parseColorAdjust(blipEl);
    const out = {
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
        const onlyAlpha = Object.keys(rest).length === 0 &&
            (alphaMod === undefined || alphaMod === alphaModFixed);
        if (onlyAlpha) {
            out.alpha = alphaModFixed;
            delete out.adjust;
        }
    }
    return out;
}
function parseColorAdjust(blipEl) {
    const adjust = {};
    for (const child of (0, xml_1.orderedChildren)(blipEl)) {
        const local = (0, xml_1.stripNs)(child.tag);
        const n = child.node;
        if (local === "duotone") {
            const cols = [];
            for (const cc of (0, xml_1.orderedChildren)(n)) {
                const c = (0, theme_1.resolveColor)(wrapColor(cc.tag, cc.node), undefined);
                if (c)
                    cols.push(c);
            }
            if (cols.length >= 2)
                adjust.duotone = [cols[0], cols[1]];
        }
        else if (local === "lum") {
            const bright = (0, xml_1.attr)(n, "bright");
            const contrast = (0, xml_1.attr)(n, "contrast");
            const out = {};
            if (bright !== undefined)
                out.bright = Number(bright) / 100000;
            if (contrast !== undefined)
                out.contrast = Number(contrast) / 100000;
            if (Object.keys(out).length)
                adjust.lum = out;
        }
        else if (local === "hsl") {
            const hue = (0, xml_1.attr)(n, "hue");
            const sat = (0, xml_1.attr)(n, "sat");
            const lum = (0, xml_1.attr)(n, "lum");
            const out = {};
            if (hue !== undefined)
                out.hue = Number(hue) / 60000;
            if (sat !== undefined)
                out.sat = Number(sat) / 100000;
            if (lum !== undefined)
                out.lum = Number(lum) / 100000;
            if (Object.keys(out).length)
                adjust.hsl = out;
        }
        else if (local === "grayscl") {
            adjust.grayscale = true;
        }
        else if (local === "alphaModFix") {
            const amt = (0, xml_1.attr)(n, "amt");
            if (amt !== undefined)
                adjust.alphaModFixed = Number(amt) / 100000;
            // 兼容旧字段：第一个 alphaModFix 同时写入 alphaMod
            if (adjust.alphaMod === undefined && amt !== undefined)
                adjust.alphaMod = Number(amt) / 100000;
        }
        else if (local === "alphaCeiling") {
            adjust.alphaCeiling = true;
        }
        else if (local === "alphaFloor") {
            adjust.alphaFloor = true;
        }
        else if (local === "alphaInv") {
            const col = (0, theme_1.resolveColor)(n, undefined);
            adjust.alphaInv = col ? { color: col } : {};
        }
        else if (local === "alphaReplace" || local === "alphaRepl") {
            const a = (0, xml_1.attr)(n, "a");
            if (a !== undefined)
                adjust.alphaReplace = Number(a) / 100000;
        }
        else if (local === "alphaBiLevel") {
            const t = (0, xml_1.attr)(n, "thresh");
            if (t !== undefined)
                adjust.alphaBiLevel = Number(t) / 100000;
        }
        else if (local === "alphaOutset") {
            const rad = (0, xml_1.attr)(n, "rad");
            if (rad !== undefined)
                adjust.alphaOutset = Number(rad) / 12700;
        }
        else if (local === "biLevel") {
            const t = (0, xml_1.attr)(n, "thresh");
            if (t !== undefined)
                adjust.biLevel = Number(t) / 100000;
        }
        else if (local === "blur") {
            const rad = Number((0, xml_1.attr)(n, "rad") ?? "0") / 12700;
            const grow = (0, xml_1.attr)(n, "grow");
            adjust.blur = { radius: rad, grow: grow !== "0" };
        }
        else if (local === "clrChange") {
            const fromEl = (0, xml_1.findByLocalName)(n, "clrFrom");
            const toEl = (0, xml_1.findByLocalName)(n, "clrTo");
            const useA = (0, units_1.boolish)((0, xml_1.attr)(n, "useA"));
            const fromC = fromEl ? (0, theme_1.resolveColor)(fromEl, undefined) : undefined;
            const toC = toEl ? (0, theme_1.resolveColor)(toEl, undefined) : undefined;
            if (fromC && toC)
                adjust.clrChange = { from: fromC, to: toC, useA };
        }
        else if (local === "clrRepl") {
            const c = (0, theme_1.resolveColor)(n, undefined);
            if (c)
                adjust.clrRepl = c;
        }
        else if (local === "fillOverlay") {
            const blend = (0, xml_1.attr)(n, "blend");
            const c = (0, theme_1.resolveColor)(n, undefined);
            const validBlend = blend === "over" || blend === "mult" || blend === "screen" || blend === "darken" || blend === "lighten"
                ? blend
                : undefined;
            adjust.fillOverlay = { color: c ?? "#000000", blend: validBlend };
        }
        else if (local === "tint") {
            const hue = (0, xml_1.attr)(n, "hue");
            const amt = (0, xml_1.attr)(n, "amt");
            const out = {};
            if (hue !== undefined)
                out.hue = Number(hue) / 60000;
            if (amt !== undefined)
                out.amount = Number(amt) / 100000;
            if (Object.keys(out).length)
                adjust.tint = out;
        }
    }
    return Object.keys(adjust).length ? adjust : undefined;
}
function wrapColor(tag, node) {
    const wrap = { [tag]: node };
    Object.defineProperty(wrap, "$children", {
        value: [{ tag, node }],
        enumerable: false,
        configurable: true,
    });
    return wrap;
}
// ECMA-376 §20.1.10.49 (ST_PresetLineDashVal) standard dash patterns.
function dashFromPrst(style, width) {
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
function isStrokeCompound(v) {
    return v === "sng" || v === "dbl" || v === "thickThin" || v === "thinThick" || v === "tri";
}
function isStrokeAlign(v) {
    return v === "ctr" || v === "in";
}
// ECMA-376 §20.1.10.31 ST_LineCap: rnd | sq | flat → CSS butt/round/square。
function mapCap(v) {
    if (v === "rnd" || v === "round")
        return "round";
    if (v === "sq" || v === "square")
        return "square";
    if (v === "flat" || v === "butt")
        return "butt";
    return undefined;
}
function isDashPreset(v) {
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
function resolveShapeStroke(spPr, ctx, baseStroke) {
    if (!spPr)
        return baseStroke;
    const ln = (0, xml_1.findByLocalName)(spPr, "ln");
    if (!ln)
        return baseStroke;
    if ((0, xml_1.findByLocalName)(ln, "noFill"))
        return undefined;
    const hasFillSpec = !!(0, xml_1.findByLocalName)(ln, "solidFill") ||
        !!(0, xml_1.findByLocalName)(ln, "gradFill") ||
        !!(0, xml_1.findByLocalName)(ln, "pattFill") ||
        !!(0, xml_1.findByLocalName)(ln, "blipFill");
    const paintOverride = hasFillSpec ? parseFill(ln, ctx) : undefined;
    const widthAttr = (0, xml_1.attr)(ln, "w");
    // §20.1.2.2.24 — 解析 w：
    //   • 缺省（`<a:ln>` 不带 w）→ widthOverride=undefined，回落到 baseStroke.width。
    //   • w="0" → 显式 0，下文统一钳位到 hairline（前提是最终有可见 paint）。
    //   • w>0  → 按 EMU/9525 转 px。
    const widthOverride = widthAttr !== undefined && widthAttr !== ""
        ? Number(widthAttr) / 9525
        : undefined;
    const capAttr = mapCap((0, xml_1.attr)(ln, "cap"));
    const cmpdAttr = (0, xml_1.attr)(ln, "cmpd");
    const cmpdOverride = isStrokeCompound(cmpdAttr) ? cmpdAttr : undefined;
    const algnAttr = (0, xml_1.attr)(ln, "algn");
    const algnOverride = isStrokeAlign(algnAttr) ? algnAttr : undefined;
    let joinOverride;
    let miterLimitOverride;
    const miterEl = (0, xml_1.findByLocalName)(ln, "miter");
    if (miterEl) {
        joinOverride = "miter";
        const lim = (0, xml_1.attr)(miterEl, "lim");
        if (lim !== undefined) {
            const n = Number(lim) / 100000;
            if (Number.isFinite(n))
                miterLimitOverride = n;
        }
    }
    else if ((0, xml_1.findByLocalName)(ln, "round"))
        joinOverride = "round";
    else if ((0, xml_1.findByLocalName)(ln, "bevel"))
        joinOverride = "bevel";
    const dashEl = (0, xml_1.findByLocalName)(ln, "prstDash");
    const dashStyle = (0, xml_1.attr)(dashEl, "val");
    const custDashEl = (0, xml_1.findByLocalName)(ln, "custDash");
    // dash 段长度以 stroke-width 为单位换算。w=0 时 PowerPoint 用 hairline 宽度
    // 来折算 dash，所以这里同步钳位，避免出现「0×N=0」的隐形虚线。
    const widthForDashRaw = widthOverride ?? baseStroke?.width ?? 0;
    const widthForDash = widthForDashRaw > 0 ? widthForDashRaw : HAIRLINE_PX;
    let dashOverride;
    let dashPresetOverride;
    let custDashOverride;
    let hasDashOverride = false;
    if (custDashEl) {
        const stops = [];
        for (const ds of (0, xml_1.findAllByLocalName)(custDashEl, "ds")) {
            const d = Number((0, xml_1.attr)(ds, "d") ?? "0") / 100000;
            const sp = Number((0, xml_1.attr)(ds, "sp") ?? "0") / 100000;
            if (Number.isFinite(d) && Number.isFinite(sp))
                stops.push({ d, sp });
        }
        if (stops.length) {
            custDashOverride = stops;
            // 把 ds 段（以 stroke-width 倍数表示）转换成 px 数组用于直接渲染。
            dashOverride = stops.flatMap((s) => [s.d * widthForDash, s.sp * widthForDash]);
            hasDashOverride = true;
        }
    }
    else if (dashStyle) {
        dashOverride = dashFromPrst(dashStyle, widthForDash);
        if (isDashPreset(dashStyle))
            dashPresetOverride = dashStyle;
        hasDashOverride = true;
    }
    const headEndOverride = parseArrowEnd((0, xml_1.findByLocalName)(ln, "headEnd"));
    const tailEndOverride = parseArrowEnd((0, xml_1.findByLocalName)(ln, "tailEnd"));
    const paint = paintOverride ?? baseStroke?.paint;
    if (!paint || paint.kind === "none")
        return undefined;
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
function parseStroke(spPr, ctx) {
    return resolveShapeStroke(spPr, ctx, undefined);
}
function parseEffectLst(spPr, ctx) {
    const list = parseEffectListFull(spPr, ctx);
    for (const e of list) {
        if (e.kind === "outer" || e.kind === "inner")
            return e;
    }
    return undefined;
}
// ECMA-376 §20.1.8.26 (`<a:effectLst>`). Returns:
//   `undefined` — element absent, caller should inherit from `<a:effectRef>`.
//   `[]`        — element present but empty, explicitly clears inherited effects.
//   `[...]`     — resolved list of effects.
function parseEffectListWithPresence(spPr, ctx) {
    if (!spPr)
        return undefined;
    const effectLst = (0, xml_1.findByLocalName)(spPr, "effectLst");
    const effectDag = (0, xml_1.findByLocalName)(spPr, "effectDag");
    if (!effectLst && !effectDag)
        return undefined;
    const out = [];
    if (effectLst)
        out.push(...parseEffectListFull(spPr, ctx));
    if (effectDag)
        out.push(...parseEffectDag(spPr, ctx));
    return out;
}
function parseEffectListFull(spPr, ctx) {
    if (!spPr)
        return [];
    const effectLst = (0, xml_1.findByLocalName)(spPr, "effectLst");
    if (!effectLst)
        return [];
    // ECMA-376 §20.1.8.26 effectLst — 也接受 effectDag 内的 cont/effectLst 嵌套（递归扁平化）。
    return readEffectChildren(effectLst, ctx);
}
function readEffectChildren(parent, ctx) {
    const out = [];
    for (const c of (0, xml_1.orderedChildren)(parent)) {
        const local = (0, xml_1.stripNs)(c.tag);
        const n = c.node;
        if (local === "outerShdw") {
            const s = readShadow(n, "outer", ctx);
            if (s)
                out.push(s);
        }
        else if (local === "innerShdw") {
            const s = readShadow(n, "inner", ctx);
            if (s)
                out.push(s);
        }
        else if (local === "prstShdw") {
            const s = readPresetShadow(n, ctx);
            if (s)
                out.push(s);
        }
        else if (local === "glow") {
            const g = readGlow(n, ctx);
            if (g)
                out.push(g);
        }
        else if (local === "softEdge") {
            const r = Number((0, xml_1.attr)(n, "rad") ?? "0") / 12700;
            if (Number.isFinite(r) && r > 0) {
                const se = { kind: "softEdge", radius: r };
                out.push(se);
            }
        }
        else if (local === "reflection") {
            const r = readReflection(n);
            if (r)
                out.push(r);
        }
        else if (local === "blur") {
            const rad = Number((0, xml_1.attr)(n, "rad") ?? "0") / 12700;
            if (rad > 0)
                out.push({ kind: "blur", radius: rad, grow: (0, xml_1.attr)(n, "grow") !== "0" });
        }
        else if (local === "biLevel") {
            const t = Number((0, xml_1.attr)(n, "thresh") ?? "0") / 100000;
            out.push({ kind: "biLevel", threshold: t });
        }
        else if (local === "duotone") {
            const cols = [];
            for (const cc of (0, xml_1.orderedChildren)(n)) {
                const c2 = (0, theme_1.resolveColor)(wrapColor(cc.tag, cc.node), ctx.theme);
                if (c2)
                    cols.push(c2);
            }
            if (cols.length >= 2)
                out.push({ kind: "duotone", from: cols[0], to: cols[1] });
        }
        else if (local === "grayscl") {
            out.push({ kind: "grayscl" });
        }
        else if (local === "clrChange") {
            const fromEl = (0, xml_1.findByLocalName)(n, "clrFrom");
            const toEl = (0, xml_1.findByLocalName)(n, "clrTo");
            const fromC = fromEl ? (0, theme_1.resolveColor)(fromEl, ctx.theme) : undefined;
            const toC = toEl ? (0, theme_1.resolveColor)(toEl, ctx.theme) : undefined;
            const useA = (0, units_1.boolish)((0, xml_1.attr)(n, "useA"));
            if (fromC && toC)
                out.push({ kind: "clrChange", from: fromC, to: toC, useA });
        }
        else if (local === "clrRepl") {
            const c2 = (0, theme_1.resolveColor)(n, ctx.theme);
            if (c2)
                out.push({ kind: "clrRepl", color: c2 });
        }
        else if (local === "lum") {
            const bright = (0, xml_1.attr)(n, "bright");
            const contrast = (0, xml_1.attr)(n, "contrast");
            const e = { kind: "lum" };
            if (bright !== undefined)
                e.bright = Number(bright) / 100000;
            if (contrast !== undefined)
                e.contrast = Number(contrast) / 100000;
            out.push(e);
        }
        else if (local === "hsl") {
            const e = { kind: "hsl" };
            const hue = (0, xml_1.attr)(n, "hue");
            const sat = (0, xml_1.attr)(n, "sat");
            const lum = (0, xml_1.attr)(n, "lum");
            if (hue !== undefined)
                e.hue = Number(hue) / 60000;
            if (sat !== undefined)
                e.sat = Number(sat) / 100000;
            if (lum !== undefined)
                e.lum = Number(lum) / 100000;
            out.push(e);
        }
        else if (local === "tint") {
            const e = { kind: "tint" };
            const hue = (0, xml_1.attr)(n, "hue");
            const amt = (0, xml_1.attr)(n, "amt");
            if (hue !== undefined)
                e.hue = Number(hue) / 60000;
            if (amt !== undefined)
                e.amount = Number(amt) / 100000;
            out.push(e);
        }
        else if (local === "fillOverlay") {
            const blend = (0, xml_1.attr)(n, "blend");
            const validBlend = blend === "over" || blend === "mult" || blend === "screen" || blend === "darken" || blend === "lighten"
                ? blend
                : undefined;
            const c2 = (0, theme_1.resolveColor)(n, ctx.theme);
            out.push({ kind: "fillOverlay", color: c2, blend: validBlend });
        }
        else if (local === "xfrm") {
            const e = { kind: "xfrm" };
            const sx = (0, xml_1.attr)(n, "sx");
            const sy = (0, xml_1.attr)(n, "sy");
            const kx = (0, xml_1.attr)(n, "kx");
            const ky = (0, xml_1.attr)(n, "ky");
            const tx = (0, xml_1.attr)(n, "tx");
            const ty = (0, xml_1.attr)(n, "ty");
            if (sx !== undefined)
                e.sx = Number(sx) / 100000;
            if (sy !== undefined)
                e.sy = Number(sy) / 100000;
            if (kx !== undefined)
                e.kx = Number(kx) / 60000;
            if (ky !== undefined)
                e.ky = Number(ky) / 60000;
            if (tx !== undefined)
                e.tx = Number(tx) / 9525;
            if (ty !== undefined)
                e.ty = Number(ty) / 9525;
            out.push(e);
        }
        else if (local === "alphaCeiling") {
            out.push({ kind: "alphaCeiling" });
        }
        else if (local === "alphaFloor") {
            out.push({ kind: "alphaFloor" });
        }
        else if (local === "alphaInv") {
            const c2 = (0, theme_1.resolveColor)(n, ctx.theme);
            out.push({ kind: "alphaInv", color: c2 });
        }
        else if (local === "alphaMod") {
            out.push({ kind: "alphaMod" });
        }
        else if (local === "alphaModFix") {
            const amt = Number((0, xml_1.attr)(n, "amt") ?? "100000") / 100000;
            out.push({ kind: "alphaModFix", amount: amt });
        }
        else if (local === "alphaReplace") {
            const a = Number((0, xml_1.attr)(n, "a") ?? "100000") / 100000;
            out.push({ kind: "alphaReplace", alpha: a });
        }
        else if (local === "alphaOutset") {
            const rad = Number((0, xml_1.attr)(n, "rad") ?? "0") / 12700;
            out.push({ kind: "alphaOutset", radius: rad });
        }
        else if (local === "alphaBiLevel") {
            const t = Number((0, xml_1.attr)(n, "thresh") ?? "0") / 100000;
            out.push({ kind: "alphaBiLevel", threshold: t });
        }
        else if (local === "blend") {
            // ECMA-376 §20.1.8.20 blend — 在 effectDag 内组合多路效果。
            const b = (0, xml_1.attr)(n, "blend") ?? "over";
            out.push({ kind: "blend", blend: b });
            // 递归读取嵌套的 cont 子效果
            const cont = (0, xml_1.findByLocalName)(n, "cont");
            if (cont)
                out.push(...readEffectChildren(cont, ctx));
        }
        else if (local === "relOff") {
            const e = { kind: "relOff" };
            const tx = (0, xml_1.attr)(n, "tx");
            const ty = (0, xml_1.attr)(n, "ty");
            if (tx !== undefined)
                e.tx = Number(tx) / 100000;
            if (ty !== undefined)
                e.ty = Number(ty) / 100000;
            out.push(e);
        }
        else if (local === "cont" || local === "effectDag" || local === "effectLst") {
            // 容器：直接展开内部子效果。
            out.push(...readEffectChildren(n, ctx));
        }
    }
    return out;
}
// ECMA-376 §20.1.8.25 effectDag — 与 effectLst 同级（互斥）。当出现时同样
// 视为 ShapeEffect 列表，递归读取容器子效果。
function parseEffectDag(spPr, ctx) {
    if (!spPr)
        return [];
    const dag = (0, xml_1.findByLocalName)(spPr, "effectDag");
    if (!dag)
        return [];
    return readEffectChildren(dag, ctx);
}
function readGlow(node, ctx) {
    const radius = Number((0, xml_1.attr)(node, "rad") ?? "0") / 12700;
    if (!Number.isFinite(radius) || radius <= 0)
        return undefined;
    const c = (0, theme_1.resolveColorEx)(node, ctx.theme);
    return { kind: "glow", radius, color: c?.color ?? "#000000", alpha: c?.alpha ?? 1 };
}
function readReflection(node) {
    const blur = Number((0, xml_1.attr)(node, "blurRad") ?? "0") / 12700;
    const startAlpha = Number((0, xml_1.attr)(node, "stA") ?? "100000") / 100000;
    const endAlpha = Number((0, xml_1.attr)(node, "endA") ?? "0") / 100000;
    const startPos = Number((0, xml_1.attr)(node, "stPos") ?? "0") / 100000;
    const endPos = Number((0, xml_1.attr)(node, "endPos") ?? "100000") / 100000;
    const dir = (0, units_1.angle60kToDeg)((0, xml_1.attr)(node, "dir"));
    const dist = Number((0, xml_1.attr)(node, "dist") ?? "0") / 12700;
    const fadeDirAttr = (0, xml_1.attr)(node, "fadeDir");
    const sxAttr = (0, xml_1.attr)(node, "sx");
    const syAttr = (0, xml_1.attr)(node, "sy");
    const algn = (0, xml_1.attr)(node, "algn");
    const rotWithShape = (0, units_1.boolish)((0, xml_1.attr)(node, "rotWithShape"));
    const out = { kind: "reflection", blur, startAlpha, endAlpha, startPos, endPos, dir, dist };
    if (fadeDirAttr !== undefined)
        out.fadeDir = (0, units_1.angle60kToDeg)(fadeDirAttr);
    if (sxAttr !== undefined)
        out.sx = Number(sxAttr) / 100000;
    if (syAttr !== undefined)
        out.sy = Number(syAttr) / 100000;
    if (algn)
        out.algn = algn;
    if (rotWithShape !== undefined)
        out.rotWithShape = rotWithShape;
    return out;
}
function readShadow(node, kind, ctx) {
    const blur = Number((0, xml_1.attr)(node, "blurRad") ?? "0") / 12700;
    const dist = Number((0, xml_1.attr)(node, "dist") ?? "0") / 12700;
    const dirDeg = (0, units_1.angle60kToDeg)((0, xml_1.attr)(node, "dir"));
    const rad = (dirDeg * Math.PI) / 180;
    const dx = Math.cos(rad) * dist;
    const dy = Math.sin(rad) * dist;
    const c = (0, theme_1.resolveColorEx)(node, ctx.theme);
    const out = {
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
        const sxAttr = (0, xml_1.attr)(node, "sx");
        const syAttr = (0, xml_1.attr)(node, "sy");
        const kxAttr = (0, xml_1.attr)(node, "kx");
        const kyAttr = (0, xml_1.attr)(node, "ky");
        const algn = (0, xml_1.attr)(node, "algn");
        const rotWithShape = (0, units_1.boolish)((0, xml_1.attr)(node, "rotWithShape"));
        if (sxAttr !== undefined)
            out.sx = Number(sxAttr) / 100000;
        if (syAttr !== undefined)
            out.sy = Number(syAttr) / 100000;
        if (kxAttr !== undefined)
            out.skewX = (0, units_1.angle60kToDeg)(kxAttr);
        if (kyAttr !== undefined)
            out.skewY = (0, units_1.angle60kToDeg)(kyAttr);
        if (algn)
            out.algn = algn;
        if (rotWithShape !== undefined)
            out.rotWithShape = rotWithShape;
    }
    return out;
}
// ECMA-376 §20.1.8.49 (`<a:prstShdw>`). 透视阴影：
// `prst` 取 ST_PresetShadowVal（shdw1..shdw20，对应 PowerPoint 内置样式）。
// 几何上等价于带固定方向/距离的 outer shadow，因此规范化为 ShadowEffect。
function readPresetShadow(node, ctx) {
    const prst = (0, xml_1.attr)(node, "prst");
    const dist = Number((0, xml_1.attr)(node, "dist") ?? "0") / 12700;
    const dirDeg = (0, units_1.angle60kToDeg)((0, xml_1.attr)(node, "dir"));
    const rad = (dirDeg * Math.PI) / 180;
    const dx = Math.cos(rad) * dist;
    const dy = Math.sin(rad) * dist;
    const c = (0, theme_1.resolveColorEx)(node, ctx.theme);
    const out = {
        kind: "outer",
        blur: 0,
        dx,
        dy,
        color: c?.color ?? "#000000",
        alpha: c?.alpha ?? 1,
        dir: dirDeg,
        dist,
    };
    if (prst)
        out.prst = prst;
    return out;
}
// OOXML path-level fill modifiers (norm/lighten/lightenLess/darken/darkenLess).
// Tint factor mixes the color with white; shade factor multiplies toward black.
// Values match PowerPoint's documented behavior for path-fill modifiers.
const TINT_LIGHTEN = 0.5;
const TINT_LIGHTEN_LESS = 0.2;
const SHADE_DARKEN = 0.5;
const SHADE_DARKEN_LESS = 0.8;
function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}
function tintHex(hex, t) {
    const c = parseHex(hex);
    if (!c)
        return hex;
    const f = clamp01(t);
    const r = Math.round(c.r + (255 - c.r) * f);
    const g = Math.round(c.g + (255 - c.g) * f);
    const b = Math.round(c.b + (255 - c.b) * f);
    return rgbToHex(r, g, b);
}
function shadeHex(hex, s) {
    const c = parseHex(hex);
    if (!c)
        return hex;
    const f = clamp01(s);
    return rgbToHex(Math.round(c.r * f), Math.round(c.g * f), Math.round(c.b * f));
}
function parseHex(hex) {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
    if (!m)
        return null;
    const v = parseInt(m[1], 16);
    return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}
function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}
function modulateColor(hex, mod) {
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
function modulatePaint(paint, mod) {
    if (!paint)
        return paint;
    if (mod === "norm")
        return paint;
    if (mod === "none")
        return { kind: "none" };
    if (paint.kind === "solid")
        return { ...paint, color: modulateColor(paint.color, mod) };
    if (paint.kind === "linear" || paint.kind === "radial") {
        return {
            ...paint,
            stops: paint.stops.map((s) => ({ ...s, color: modulateColor(s.color, mod) })),
        };
    }
    return paint;
}
function parseArrowEnd(node) {
    if (!node)
        return undefined;
    const t = (0, xml_1.attr)(node, "type");
    if (!t || t === "none")
        return undefined;
    const w = (0, xml_1.attr)(node, "w");
    const len = (0, xml_1.attr)(node, "len");
    return {
        kind: t,
        w: w ?? undefined,
        len: len ?? undefined,
    };
}
