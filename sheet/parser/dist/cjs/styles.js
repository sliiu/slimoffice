"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readCellStyles = readCellStyles;
exports.hasLook = hasLook;
const xml_1 = require("./xml");
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
function readCellStyles(stylesXml, themeColors = []) {
    if (!stylesXml)
        return { looks: [], names: [] };
    const root = (0, xml_1.child)((0, xml_1.parseXml)(stylesXml), "styleSheet");
    const formats = new Map(Object.entries(BUILTIN_FMT).map(([id, code]) => [Number(id), code]));
    for (const fmt of (0, xml_1.children)((0, xml_1.child)(root, "numFmts"), "numFmt")) {
        const id = Number((0, xml_1.attr)(fmt, "numFmtId"));
        const code = (0, xml_1.attr)(fmt, "formatCode");
        if (Number.isInteger(id) && code && code.toLowerCase() !== "general")
            formats.set(id, code);
    }
    const fonts = (0, xml_1.children)((0, xml_1.child)(root, "fonts"), "font").map((font) => readFont(font, themeColors));
    const fills = (0, xml_1.children)((0, xml_1.child)(root, "fills"), "fill").map((fill) => readFill(fill, themeColors));
    const borders = (0, xml_1.children)((0, xml_1.child)(root, "borders"), "border").map((border) => readBorder(border, themeColors));
    const styleNames = new Map();
    for (const item of (0, xml_1.children)((0, xml_1.child)(root, "cellStyles"), "cellStyle")) {
        const name = (0, xml_1.attr)(item, "name");
        const xfId = Number((0, xml_1.attr)(item, "xfId"));
        if (name && Number.isInteger(xfId))
            styleNames.set(xfId, name);
    }
    const xfs = (0, xml_1.children)((0, xml_1.child)(root, "cellXfs"), "xf");
    const looks = xfs.map((xf) => {
        const look = {};
        const fontId = Number((0, xml_1.attr)(xf, "fontId"));
        const fillId = Number((0, xml_1.attr)(xf, "fillId"));
        const borderId = Number((0, xml_1.attr)(xf, "borderId"));
        const numFmtId = Number((0, xml_1.attr)(xf, "numFmtId"));
        Object.assign(look, taken(xf, "applyFont", fonts[fontId]));
        Object.assign(look, taken(xf, "applyFill", fills[fillId]));
        Object.assign(look, taken(xf, "applyBorder", borders[borderId]));
        const format = formats.get(numFmtId);
        if (format)
            Object.assign(look, taken(xf, "applyNumberFormat", { numFmt: format }));
        Object.assign(look, taken(xf, "applyAlignment", readAlignment((0, xml_1.child)(xf, "alignment"))));
        return look;
    });
    const names = xfs.map((xf) => {
        const xfId = Number((0, xml_1.attr)(xf, "xfId"));
        return Number.isInteger(xfId) ? styleNames.get(xfId) : undefined;
    });
    return { looks, names };
}
function hasLook(look) {
    return !!look && Object.keys(look).length > 0;
}
function taken(xf, flag, look) {
    if (!hasLook(look))
        return undefined;
    const raw = (0, xml_1.attr)(xf, flag);
    if (raw === "0" || raw === "false")
        return undefined;
    return look;
}
function readFont(font, themeColors) {
    const look = {};
    if (on((0, xml_1.child)(font, "b")))
        look.bold = true;
    if (on((0, xml_1.child)(font, "i")))
        look.italic = true;
    if (on((0, xml_1.child)(font, "u")))
        look.underline = true;
    if (on((0, xml_1.child)(font, "strike")))
        look.strike = true;
    const size = Number((0, xml_1.attr)((0, xml_1.child)(font, "sz"), "val"));
    if (size > 0)
        look.fontSize = size;
    const color = colorOf((0, xml_1.child)(font, "color"), themeColors);
    if (color)
        look.color = color;
    const name = (0, xml_1.attr)((0, xml_1.child)(font, "name"), "val");
    if (name)
        look.font = name;
    return look;
}
function readFill(fill, themeColors) {
    const pattern = (0, xml_1.child)(fill, "patternFill");
    if ((0, xml_1.attr)(pattern, "patternType") !== "solid")
        return {};
    const color = colorOf((0, xml_1.child)(pattern, "fgColor"), themeColors) ?? colorOf((0, xml_1.child)(pattern, "bgColor"), themeColors);
    return color ? { fill: color } : {};
}
function readBorder(border, themeColors) {
    const edges = {};
    for (const side of ["left", "right", "top", "bottom"]) {
        const edge = readEdge((0, xml_1.child)(border, side), themeColors);
        if (edge)
            edges[side] = edge;
    }
    return Object.keys(edges).length ? { border: edges } : {};
}
function readEdge(node, themeColors) {
    const style = (0, xml_1.attr)(node, "style");
    if (!node || !style || style === "none")
        return undefined;
    const known = style === "thin" || style === "medium" || style === "thick" || style === "dashed" || style === "dotted" ? style : "thin";
    const color = colorOf((0, xml_1.child)(node, "color"), themeColors);
    return color ? { style: known, color } : { style: known };
}
function readAlignment(node) {
    if (!node)
        return {};
    const look = {};
    const horizontal = ALIGN[(0, xml_1.attr)(node, "horizontal") ?? ""];
    const vertical = VALIGN[(0, xml_1.attr)(node, "vertical") ?? ""];
    if (horizontal)
        look.align = horizontal;
    if (vertical)
        look.valign = vertical;
    if ((0, xml_1.attr)(node, "wrapText") === "1")
        look.wrap = true;
    const indent = Number((0, xml_1.attr)(node, "indent"));
    if (indent > 0)
        look.indent = indent;
    return look;
}
function on(node) {
    if (!node)
        return false;
    const raw = (0, xml_1.attr)(node, "val");
    return raw !== "0" && raw !== "false" && raw !== "none";
}
function colorOf(node, themeColors) {
    const direct = rgbOf((0, xml_1.attr)(node, "rgb"));
    if (direct)
        return direct;
    const theme = Number((0, xml_1.attr)(node, "theme"));
    const base = themeColors[theme];
    if (!base)
        return undefined;
    const tint = Number((0, xml_1.attr)(node, "tint"));
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
