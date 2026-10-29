"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTheme = parseTheme;
exports.applyClrMapToTheme = applyClrMapToTheme;
exports.resolveColor = resolveColor;
exports.resolveColorEx = resolveColorEx;
const xml_1 = require("./xml");
const SCHEME_ORDER = [
    "dk1",
    "lt1",
    "dk2",
    "lt2",
    "accent1",
    "accent2",
    "accent3",
    "accent4",
    "accent5",
    "accent6",
    "hlink",
    "folHlink",
];
function parseTheme(xml) {
    const colors = new Map();
    let fontMajor;
    let fontMinor;
    if (!xml)
        return { schemeColors: colors };
    const themeEl = (0, xml_1.findByLocalName)(xml, "theme");
    const themeName = (0, xml_1.attr)(themeEl, "name");
    const elements = (0, xml_1.findByLocalName)(themeEl, "themeElements");
    const clrScheme = (0, xml_1.findByLocalName)(elements, "clrScheme");
    if (clrScheme) {
        for (const name of SCHEME_ORDER) {
            const node = (0, xml_1.findByLocalName)(clrScheme, name);
            if (node) {
                const hex = readColorNode(node);
                if (hex)
                    colors.set(name, hex);
            }
        }
        colors.set("bg1", colors.get("lt1") ?? "FFFFFF");
        colors.set("tx1", colors.get("dk1") ?? "000000");
        colors.set("bg2", colors.get("lt2") ?? "EEEEEE");
        colors.set("tx2", colors.get("dk2") ?? "1F497D");
    }
    const fontScheme = (0, xml_1.findByLocalName)(elements, "fontScheme");
    const major = (0, xml_1.findByLocalName)(fontScheme, "majorFont");
    const minor = (0, xml_1.findByLocalName)(fontScheme, "minorFont");
    const fontMajorSet = readFontSet(major);
    const fontMinorSet = readFontSet(minor);
    fontMajor = fontMajorSet.latin;
    fontMinor = fontMinorSet.latin;
    const fmtScheme = (0, xml_1.findByLocalName)(elements, "fmtScheme");
    const fillStyleLst = readStyleList((0, xml_1.findByLocalName)(fmtScheme, "fillStyleLst"));
    const lnStyleLst = readStyleList((0, xml_1.findByLocalName)(fmtScheme, "lnStyleLst"));
    const effectStyleLst = readStyleList((0, xml_1.findByLocalName)(fmtScheme, "effectStyleLst"));
    const bgFillStyleLst = readStyleList((0, xml_1.findByLocalName)(fmtScheme, "bgFillStyleLst"));
    const objectDefaults = parseObjectDefaults((0, xml_1.findByLocalName)(themeEl, "objectDefaults"));
    return {
        name: themeName,
        schemeColors: colors,
        fontMajor,
        fontMinor,
        fontMajorSet,
        fontMinorSet,
        fillStyleLst,
        lnStyleLst,
        effectStyleLst,
        bgFillStyleLst,
        objectDefaults,
    };
}
function parseObjectDefaults(node) {
    if (!node)
        return undefined;
    const out = {};
    const sp = (0, xml_1.findByLocalName)(node, "spDef");
    const ln = (0, xml_1.findByLocalName)(node, "lnDef");
    const tx = (0, xml_1.findByLocalName)(node, "txDef");
    if (sp)
        out.spDef = sp;
    if (ln)
        out.lnDef = ln;
    if (tx)
        out.txDef = tx;
    return Object.keys(out).length ? out : undefined;
}
function readStyleList(node) {
    if (!node)
        return undefined;
    const out = [];
    for (const c of (0, xml_1.orderedChildren)(node)) {
        out.push({ tag: (0, xml_1.stripNs)(c.tag), raw: c.node });
    }
    return out;
}
function readFontSet(node) {
    const set = {};
    if (!node)
        return set;
    const latin = (0, xml_1.attr)((0, xml_1.findByLocalName)(node, "latin"), "typeface");
    const ea = (0, xml_1.attr)((0, xml_1.findByLocalName)(node, "ea"), "typeface");
    const cs = (0, xml_1.attr)((0, xml_1.findByLocalName)(node, "cs"), "typeface");
    const sym = (0, xml_1.attr)((0, xml_1.findByLocalName)(node, "sym"), "typeface");
    if (latin)
        set.latin = latin;
    if (ea)
        set.ea = ea;
    if (cs)
        set.cs = cs;
    if (sym)
        set.sym = sym;
    return set;
}
function readColorNode(node) {
    const srgb = (0, xml_1.findByLocalName)(node, "srgbClr");
    if (srgb)
        return ((0, xml_1.attr)(srgb, "val") ?? "").toUpperCase();
    const sys = (0, xml_1.findByLocalName)(node, "sysClr");
    if (sys) {
        const last = (0, xml_1.attr)(sys, "lastClr");
        if (last)
            return last.toUpperCase();
        return ((0, xml_1.attr)(sys, "val") ?? "000000").toUpperCase();
    }
    const scheme = (0, xml_1.findByLocalName)(node, "schemeClr");
    if (scheme)
        return ((0, xml_1.attr)(scheme, "val") ?? "").toUpperCase();
    return undefined;
}
// ECMA-376 §19.3.1.7 clrMap 的 12 个槽位。schemeClr@val 中出现的 bg1/tx1/bg2/tx2/
// accent1..6/hlink/folHlink 都是「映射槽位」，需先经 master 的 clrMap（或 slide/layout
// 的 clrMapOvr overrideClrMapping）转到 clrScheme 实际颜色名（dk1/lt1/dk2/lt2/...）。
const CLR_MAP_SLOTS = [
    "bg1", "tx1", "bg2", "tx2",
    "accent1", "accent2", "accent3", "accent4", "accent5", "accent6",
    "hlink", "folHlink",
];
/**
 * 把 clrMap 应用到 theme，得到「按该 part 的槽位映射解析 schemeClr」的有效 theme。
 *
 * 注意：映射的**读取端**永远是原始 clrScheme 值（dk1/lt1/... 与 accent/hlink 原值），
 * 写入端只覆盖槽位别名 —— 先整体取原值快照再写，避免 accent1→accent2 / accent2→accent1
 * 这类交换映射出现「读到已被覆盖的值」的错误串联。
 *
 * 常见 Office 默认映射（bg1=lt1 tx1=dk1 bg2=lt2 tx2=dk2、其余恒等）与 parseTheme 里
 * 预置的别名一致，此时原样返回同一个 theme 对象（零行为变化）。
 */
function applyClrMapToTheme(theme, clrMap) {
    if (!theme || !clrMap)
        return theme;
    const base = theme.schemeColors;
    const next = new Map(base);
    let changed = false;
    for (const slot of CLR_MAP_SLOTS) {
        const target = clrMap[slot];
        if (!target)
            continue;
        const hex = base.get(target);
        if (hex !== undefined && next.get(slot) !== hex) {
            next.set(slot, hex);
            changed = true;
        }
    }
    if (!changed)
        return theme;
    return { ...theme, schemeColors: next };
}
function resolveColor(node, theme) {
    return resolveColorEx(node, theme)?.color;
}
function resolveColorEx(node, theme) {
    if (!node)
        return undefined;
    const srgb = (0, xml_1.findByLocalName)(node, "srgbClr");
    if (srgb)
        return applyColorMods("#" + ((0, xml_1.attr)(srgb, "val") ?? "000000"), srgb);
    const sys = (0, xml_1.findByLocalName)(node, "sysClr");
    if (sys) {
        const v = (0, xml_1.attr)(sys, "lastClr") ?? (0, xml_1.attr)(sys, "val") ?? "000000";
        return applyColorMods("#" + v, sys);
    }
    const scheme = (0, xml_1.findByLocalName)(node, "schemeClr");
    if (scheme) {
        const key = (0, xml_1.attr)(scheme, "val") ?? "";
        const hex = theme?.schemeColors.get(key);
        if (hex)
            return applyColorMods("#" + hex, scheme);
    }
    const prst = (0, xml_1.findByLocalName)(node, "prstClr");
    if (prst) {
        const v = (0, xml_1.attr)(prst, "val") ?? "";
        const mapped = PRESET_COLORS[v.toLowerCase()];
        if (mapped)
            return applyColorMods("#" + mapped, prst);
    }
    const hsl = (0, xml_1.findByLocalName)(node, "hslClr");
    if (hsl) {
        const hue = pctOrInt((0, xml_1.attr)(hsl, "hue"), 0);
        const sat = pctOrInt((0, xml_1.attr)(hsl, "sat"), 0);
        const lum = pctOrInt((0, xml_1.attr)(hsl, "lum"), 0);
        const rgb = hslToRgb(hue / 360, sat, lum);
        return applyColorMods(rgbHex(rgb), hsl);
    }
    const scrgb = (0, xml_1.findByLocalName)(node, "scrgbClr");
    if (scrgb) {
        const r = pctOrInt((0, xml_1.attr)(scrgb, "r"), 0);
        const g = pctOrInt((0, xml_1.attr)(scrgb, "g"), 0);
        const b = pctOrInt((0, xml_1.attr)(scrgb, "b"), 0);
        return applyColorMods(rgbHex({ r: r * 255, g: g * 255, b: b * 255 }), scrgb);
    }
    return undefined;
}
function pctOrInt(v, fallback) {
    if (!v)
        return fallback;
    if (v.endsWith("%"))
        return parseFloat(v) / 100;
    const n = parseFloat(v);
    if (Number.isNaN(n))
        return fallback;
    return n / 100000;
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function hexToRgb(hex) {
    const m = /#?([0-9a-fA-F]{6})/.exec(hex);
    if (!m)
        return { r: 0, g: 0, b: 0 };
    const v = parseInt(m[1], 16);
    return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}
function rgbHex(c) {
    const ch = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return ("#" + ch(c.r) + ch(c.g) + ch(c.b)).toUpperCase();
}
function rgbToHsl(c) {
    const r = c.r / 255, g = c.g / 255, b = c.b / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
        const d = mx - mn;
        s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        switch (mx) {
            case r:
                h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                break;
            case g:
                h = ((b - r) / d + 2) / 6;
                break;
            case b:
                h = ((r - g) / d + 4) / 6;
                break;
        }
    }
    return { h, s, l };
}
function hslToRgb(h, s, l) {
    if (s === 0)
        return { r: l * 255, g: l * 255, b: l * 255 };
    const hue2rgb = (p, q, t) => {
        if (t < 0)
            t += 1;
        if (t > 1)
            t -= 1;
        if (t < 1 / 6)
            return p + (q - p) * 6 * t;
        if (t < 1 / 2)
            return q;
        if (t < 2 / 3)
            return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return {
        r: hue2rgb(p, q, h + 1 / 3) * 255,
        g: hue2rgb(p, q, h) * 255,
        b: hue2rgb(p, q, h - 1 / 3) * 255,
    };
}
// ECMA-376 Part 1 §20.1.2.3.x — applies child color transforms in document
// order. Values are in 1000ths of a percent (e.g. "50000" = 50%).
function applyColorMods(hex, parent) {
    let rgb = hexToRgb(hex);
    let alpha = 1;
    for (const ch of (0, xml_1.orderedChildren)(parent)) {
        const tag = (0, xml_1.stripNs)(ch.tag);
        const node = ch.node;
        const val = (n) => pctOrInt(n, 0);
        switch (tag) {
            case "alpha":
                alpha = clamp01(val((0, xml_1.attr)(node, "val")));
                break;
            case "alphaMod":
                alpha = clamp01(alpha * val((0, xml_1.attr)(node, "val")));
                break;
            case "alphaOff":
                alpha = clamp01(alpha + val((0, xml_1.attr)(node, "val")));
                break;
            case "red":
                rgb.r = clamp01(val((0, xml_1.attr)(node, "val"))) * 255;
                break;
            case "redMod":
                rgb.r = clamp01((rgb.r / 255) * val((0, xml_1.attr)(node, "val"))) * 255;
                break;
            case "redOff":
                rgb.r = clamp01((rgb.r / 255) + val((0, xml_1.attr)(node, "val"))) * 255;
                break;
            case "green":
                rgb.g = clamp01(val((0, xml_1.attr)(node, "val"))) * 255;
                break;
            case "greenMod":
                rgb.g = clamp01((rgb.g / 255) * val((0, xml_1.attr)(node, "val"))) * 255;
                break;
            case "greenOff":
                rgb.g = clamp01((rgb.g / 255) + val((0, xml_1.attr)(node, "val"))) * 255;
                break;
            case "blue":
                rgb.b = clamp01(val((0, xml_1.attr)(node, "val"))) * 255;
                break;
            case "blueMod":
                rgb.b = clamp01((rgb.b / 255) * val((0, xml_1.attr)(node, "val"))) * 255;
                break;
            case "blueOff":
                rgb.b = clamp01((rgb.b / 255) + val((0, xml_1.attr)(node, "val"))) * 255;
                break;
            case "hue":
            case "hueMod":
            case "hueOff":
            case "sat":
            case "satMod":
            case "satOff":
            case "lum":
            case "lumMod":
            case "lumOff": {
                const v = val((0, xml_1.attr)(node, "val"));
                const hsl = rgbToHsl(rgb);
                if (tag === "hue")
                    hsl.h = (v / 360 + 1) % 1;
                else if (tag === "hueMod")
                    hsl.h = (hsl.h * v + 1) % 1;
                else if (tag === "hueOff")
                    hsl.h = (hsl.h + v / 360 + 1) % 1;
                else if (tag === "sat")
                    hsl.s = clamp01(v);
                else if (tag === "satMod")
                    hsl.s = clamp01(hsl.s * v);
                else if (tag === "satOff")
                    hsl.s = clamp01(hsl.s + v);
                else if (tag === "lum")
                    hsl.l = clamp01(v);
                else if (tag === "lumMod")
                    hsl.l = clamp01(hsl.l * v);
                else if (tag === "lumOff")
                    hsl.l = clamp01(hsl.l + v);
                rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
                break;
            }
            case "shade": {
                const v = clamp01(val((0, xml_1.attr)(node, "val")));
                rgb = { r: rgb.r * v, g: rgb.g * v, b: rgb.b * v };
                break;
            }
            case "tint": {
                const v = clamp01(val((0, xml_1.attr)(node, "val")));
                rgb = {
                    r: rgb.r * v + 255 * (1 - v),
                    g: rgb.g * v + 255 * (1 - v),
                    b: rgb.b * v + 255 * (1 - v),
                };
                break;
            }
            case "gray":
                rgb.r = rgb.g = rgb.b = (0.3 * rgb.r + 0.59 * rgb.g + 0.11 * rgb.b);
                break;
            case "comp":
                rgb = { r: 255 - rgb.r, g: 255 - rgb.g, b: 255 - rgb.b };
                break;
            case "inv":
                rgb = { r: 255 - rgb.r, g: 255 - rgb.g, b: 255 - rgb.b };
                break;
            case "gamma":
                rgb = { r: Math.pow(rgb.r / 255, 1 / 2.2) * 255, g: Math.pow(rgb.g / 255, 1 / 2.2) * 255, b: Math.pow(rgb.b / 255, 1 / 2.2) * 255 };
                break;
            case "invGamma":
                rgb = { r: Math.pow(rgb.r / 255, 2.2) * 255, g: Math.pow(rgb.g / 255, 2.2) * 255, b: Math.pow(rgb.b / 255, 2.2) * 255 };
                break;
        }
    }
    return { color: rgbHex(rgb), alpha };
}
// ECMA-376 §20.1.10.47 ST_PresetColorVal — standard named colors.
const PRESET_COLORS = {
    aliceblue: "F0F8FF", antiquewhite: "FAEBD7", aqua: "00FFFF", aquamarine: "7FFFD4",
    azure: "F0FFFF", beige: "F5F5DC", bisque: "FFE4C4", black: "000000", blanchedalmond: "FFEBCD",
    blue: "0000FF", blueviolet: "8A2BE2", brown: "A52A2A", burlywood: "DEB887", cadetblue: "5F9EA0",
    chartreuse: "7FFF00", chocolate: "D2691E", coral: "FF7F50", cornflowerblue: "6495ED",
    cornsilk: "FFF8DC", crimson: "DC143C", cyan: "00FFFF", darkblue: "00008B", darkcyan: "008B8B",
    darkgoldenrod: "B8860B", darkgray: "A9A9A9", darkgrey: "A9A9A9", darkgreen: "006400",
    darkkhaki: "BDB76B", darkmagenta: "8B008B", darkolivegreen: "556B2F", darkorange: "FF8C00",
    darkorchid: "9932CC", darkred: "8B0000", darksalmon: "E9967A", darkseagreen: "8FBC8F",
    darkslateblue: "483D8B", darkslategray: "2F4F4F", darkslategrey: "2F4F4F", darkturquoise: "00CED1",
    darkviolet: "9400D3", deeppink: "FF1493", deepskyblue: "00BFFF", dimgray: "696969", dimgrey: "696969",
    dodgerblue: "1E90FF", firebrick: "B22222", floralwhite: "FFFAF0", forestgreen: "228B22",
    fuchsia: "FF00FF", gainsboro: "DCDCDC", ghostwhite: "F8F8FF", gold: "FFD700", goldenrod: "DAA520",
    gray: "808080", grey: "808080", green: "008000", greenyellow: "ADFF2F", honeydew: "F0FFF0",
    hotpink: "FF69B4", indianred: "CD5C5C", indigo: "4B0082", ivory: "FFFFF0", khaki: "F0E68C",
    lavender: "E6E6FA", lavenderblush: "FFF0F5", lawngreen: "7CFC00", lemonchiffon: "FFFACD",
    lightblue: "ADD8E6", lightcoral: "F08080", lightcyan: "E0FFFF", lightgoldenrodyellow: "FAFAD2",
    lightgray: "D3D3D3", lightgrey: "D3D3D3", lightgreen: "90EE90", lightpink: "FFB6C1",
    lightsalmon: "FFA07A", lightseagreen: "20B2AA", lightskyblue: "87CEFA", lightslategray: "778899",
    lightslategrey: "778899", lightsteelblue: "B0C4DE", lightyellow: "FFFFE0", lime: "00FF00",
    limegreen: "32CD32", linen: "FAF0E6", magenta: "FF00FF", maroon: "800000", mediumaquamarine: "66CDAA",
    mediumblue: "0000CD", mediumorchid: "BA55D3", mediumpurple: "9370DB", mediumseagreen: "3CB371",
    mediumslateblue: "7B68EE", mediumspringgreen: "00FA9A", mediumturquoise: "48D1CC",
    mediumvioletred: "C71585", midnightblue: "191970", mintcream: "F5FFFA", mistyrose: "FFE4E1",
    moccasin: "FFE4B4", navajowhite: "FFDEAD", navy: "000080", oldlace: "FDF5E6", olive: "808000",
    olivedrab: "6B8E23", orange: "FFA500", orangered: "FF4500", orchid: "DA70D6", palegoldenrod: "EEE8AA",
    palegreen: "98FB98", paleturquoise: "AFEEEE", palevioletred: "DB7093", papayawhip: "FFEFD5",
    peachpuff: "FFDAB9", peru: "CD853F", pink: "FFC0CB", plum: "DDA0DD", powderblue: "B0E0E6",
    purple: "800080", red: "FF0000", rosybrown: "BC8F8F", royalblue: "4169E1", saddlebrown: "8B4513",
    salmon: "FA8072", sandybrown: "F4A460", seagreen: "2E8B57", seashell: "FFF5EE", sienna: "A0522D",
    silver: "C0C0C0", skyblue: "87CEEB", slateblue: "6A5ACD", slategray: "708090", slategrey: "708090",
    snow: "FFFAFA", springgreen: "00FF7F", steelblue: "4682B4", tan: "D2B48C", teal: "008080",
    thistle: "D8BFD8", tomato: "FF6347", turquoise: "40E0D0", violet: "EE82EE", wheat: "F5DEB3",
    white: "FFFFFF", whitesmoke: "F5F5F5", yellow: "FFFF00", yellowgreen: "9ACD32",
};
