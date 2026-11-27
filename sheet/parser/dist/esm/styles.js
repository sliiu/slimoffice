import { attr, child, children, parseXml } from "./xml.js";
const BUILTIN_FMT = {
    1: "0",
    2: "0.00",
    3: "#,##0",
    4: "#,##0.00",
    9: "0%",
    10: "0.00%",
    11: "0.00E+00",
    14: "m/d/yyyy",
    15: "d-mmm-yy",
    16: "d-mmm",
    17: "mmm-yy",
    18: "h:mm AM/PM",
    19: "h:mm:ss AM/PM",
    20: "h:mm",
    21: "h:mm:ss",
    22: "m/d/yyyy h:mm",
    37: "#,##0_);(#,##0)",
    38: "#,##0_);[Red](#,##0)",
    39: "#,##0.00_);(#,##0.00)",
    40: "#,##0.00_);[Red](#,##0.00)",
    45: "mm:ss",
    46: "[h]:mm:ss",
    47: "mmss.0",
    48: "##0.0E+0",
    49: "@",
};
const ALIGN = { left: "left", center: "center", right: "right", justify: "justify" };
const VALIGN = { top: "top", center: "middle", bottom: "bottom" };
/** One look per `cellXfs` entry. Index 0 is the sheet default and is usually empty. Theme colors resolve against the workbook palette. */
export function readCellStyles(stylesXml, themeColors = []) {
    if (!stylesXml)
        return { looks: [], names: [], dxfs: [] };
    const root = child(parseXml(stylesXml), "styleSheet");
    const formats = new Map(Object.entries(BUILTIN_FMT).map(([id, code]) => [Number(id), code]));
    for (const fmt of children(child(root, "numFmts"), "numFmt")) {
        const id = Number(attr(fmt, "numFmtId"));
        const code = attr(fmt, "formatCode");
        if (Number.isInteger(id) && code && code.toLowerCase() !== "general")
            formats.set(id, code);
    }
    const fonts = children(child(root, "fonts"), "font").map((font) => readFont(font, themeColors));
    const fills = children(child(root, "fills"), "fill").map((fill) => readFill(fill, themeColors));
    const borders = children(child(root, "borders"), "border").map((border) => readBorder(border, themeColors));
    const styleNames = new Map();
    for (const item of children(child(root, "cellStyles"), "cellStyle")) {
        const name = attr(item, "name");
        const xfId = Number(attr(item, "xfId"));
        if (name && Number.isInteger(xfId))
            styleNames.set(xfId, name);
    }
    const xfs = children(child(root, "cellXfs"), "xf");
    const looks = xfs.map((xf) => {
        const look = {};
        const fontId = Number(attr(xf, "fontId"));
        const fillId = Number(attr(xf, "fillId"));
        const borderId = Number(attr(xf, "borderId"));
        const numFmtId = Number(attr(xf, "numFmtId"));
        Object.assign(look, taken(xf, "applyFont", fonts[fontId]));
        Object.assign(look, taken(xf, "applyFill", fills[fillId]));
        Object.assign(look, taken(xf, "applyBorder", borders[borderId]));
        const format = formats.get(numFmtId);
        if (format)
            Object.assign(look, taken(xf, "applyNumberFormat", { numFmt: format }));
        Object.assign(look, taken(xf, "applyAlignment", readAlignment(child(xf, "alignment"))));
        return look;
    });
    const names = xfs.map((xf) => {
        const xfId = Number(attr(xf, "xfId"));
        return Number.isInteger(xfId) ? styleNames.get(xfId) : undefined;
    });
    const dxfs = children(child(root, "dxfs"), "dxf").map((dxf) => readDxf(dxf, themeColors, formats));
    return { looks, names, dxfs };
}
/** A differential style only carries what it changes: the solid fill, the font color, and the number format. */
function readDxf(dxf, themeColors, formats) {
    const look = {};
    const fill = readFill(child(dxf, "fill") ?? { name: "fill", attrs: {}, children: [], text: "" }, themeColors).fill;
    const color = readFont(child(dxf, "font") ?? { name: "font", attrs: {}, children: [], text: "" }, themeColors).color;
    const format = formats.get(Number(attr(child(dxf, "numFmt"), "numFmtId")));
    if (fill)
        look.fill = fill;
    if (color)
        look.color = color;
    if (format)
        look.numFmt = format;
    return look;
}
export function hasLook(look) {
    return !!look && Object.keys(look).length > 0;
}
function taken(xf, flag, look) {
    if (!hasLook(look))
        return undefined;
    const raw = attr(xf, flag);
    if (raw === "0" || raw === "false")
        return undefined;
    return look;
}
function readFont(font, themeColors) {
    const look = {};
    if (on(child(font, "b")))
        look.bold = true;
    if (on(child(font, "i")))
        look.italic = true;
    if (on(child(font, "u")))
        look.underline = true;
    if (on(child(font, "strike")))
        look.strike = true;
    const size = Number(attr(child(font, "sz"), "val"));
    if (size > 0)
        look.fontSize = size;
    const color = colorOf(child(font, "color"), themeColors);
    if (color)
        look.color = color;
    const name = attr(child(font, "name"), "val");
    if (name)
        look.font = name;
    return look;
}
function readFill(fill, themeColors) {
    const pattern = child(fill, "patternFill");
    if (attr(pattern, "patternType") !== "solid")
        return {};
    const color = colorOf(child(pattern, "fgColor"), themeColors) ?? colorOf(child(pattern, "bgColor"), themeColors);
    return color ? { fill: color } : {};
}
function readBorder(border, themeColors) {
    const edges = {};
    for (const side of ["left", "right", "top", "bottom"]) {
        const edge = readEdge(child(border, side), themeColors);
        if (edge)
            edges[side] = edge;
    }
    return Object.keys(edges).length ? { border: edges } : {};
}
function readEdge(node, themeColors) {
    const style = attr(node, "style");
    if (!node || !style || style === "none")
        return undefined;
    const known = style === "thin" || style === "medium" || style === "thick" || style === "dashed" || style === "dotted" ? style : "thin";
    const color = colorOf(child(node, "color"), themeColors);
    return color ? { style: known, color } : { style: known };
}
function readAlignment(node) {
    if (!node)
        return {};
    const look = {};
    const horizontal = ALIGN[attr(node, "horizontal") ?? ""];
    const vertical = VALIGN[attr(node, "vertical") ?? ""];
    if (horizontal)
        look.align = horizontal;
    if (vertical)
        look.valign = vertical;
    if (attr(node, "wrapText") === "1")
        look.wrap = true;
    const indent = Number(attr(node, "indent"));
    if (indent > 0)
        look.indent = indent;
    return look;
}
function on(node) {
    if (!node)
        return false;
    const raw = attr(node, "val");
    return raw !== "0" && raw !== "false" && raw !== "none";
}
function colorOf(node, themeColors) {
    const direct = rgbOf(attr(node, "rgb"));
    if (direct)
        return direct;
    const theme = Number(attr(node, "theme"));
    const base = themeColors[theme];
    if (!base)
        return undefined;
    const tint = Number(attr(node, "tint"));
    return Number.isFinite(tint) && tint !== 0 ? applyTint(base, tint) : base;
}
function rgbOf(raw) {
    const text = raw?.replace(/^#/, "");
    if (!text || !/^[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(text))
        return undefined;
    return `#${(text.length === 8 ? text.slice(2) : text).toLowerCase()}`;
}
/** Excel tint: positive lightens toward white, negative darkens toward black. */
function applyTint(hex, tint) {
    const clamped = Math.max(-1, Math.min(1, tint));
    const channels = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
    const mixed = channels.map((channel) => {
        const next = clamped < 0 ? channel * (1 + clamped) : channel + (255 - channel) * clamped;
        return Math.round(Math.max(0, Math.min(255, next))).toString(16).padStart(2, "0");
    });
    return `#${mixed.join("")}`;
}
