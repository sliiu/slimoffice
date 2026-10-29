"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadTableStyles = loadTableStyles;
exports.parseTableStyleList = parseTableStyleList;
const xml_1 = require("./xml");
const fill_1 = require("./fill");
const parts_1 = require("./parts");
const theme_1 = require("./theme");
function loadTableStyles(archive, partPath, ctx) {
    if (!partPath)
        return undefined;
    const xml = (0, parts_1.loadXmlPart)(archive, partPath);
    if (!xml)
        return undefined;
    return parseTableStyleList(xml, ctx);
}
/** 解析 `<a:tblStyleLst>`（文档根或 lst 节点本身均可）。 */
function parseTableStyleList(xml, ctx) {
    const root = (0, xml_1.findByLocalName)(xml, "tblStyleLst") ?? xml;
    const styles = (0, xml_1.findAllByLocalName)(root, "tblStyle");
    if (!styles.length && (0, xml_1.attr)(root, "def") === undefined)
        return undefined;
    const def = (0, xml_1.attr)(root, "def");
    const byId = new Map();
    for (const ts of styles) {
        const id = (0, xml_1.attr)(ts, "styleId");
        if (!id)
            continue;
        const entry = { id, name: (0, xml_1.attr)(ts, "styleName"), parts: {} };
        const REGIONS = [
            "wholeTbl", "band1H", "band2H", "band1V", "band2V",
            "firstRow", "lastRow", "firstCol", "lastCol",
            "nwCell", "neCell", "swCell", "seCell",
        ];
        for (const r of REGIONS) {
            const node = (0, xml_1.findByLocalName)(ts, r);
            if (!node)
                continue;
            const part = {};
            const tcStyle = (0, xml_1.findByLocalName)(node, "tcStyle");
            if (tcStyle) {
                const fillRef = (0, xml_1.findByLocalName)(tcStyle, "fill");
                if (fillRef) {
                    const f = (0, fill_1.parseFill)(fillRef, ctx);
                    if (f)
                        part.fill = f;
                }
                const tcBdr = (0, xml_1.findByLocalName)(tcStyle, "tcBdr");
                if (tcBdr) {
                    const b = {};
                    const sides = [
                        ["left", "left"], ["right", "right"], ["top", "top"], ["bottom", "bottom"],
                        ["insideH", "insideH"], ["insideV", "insideV"],
                    ];
                    for (const [tag, key] of sides) {
                        const sideEl = (0, xml_1.findByLocalName)(tcBdr, tag);
                        if (!sideEl)
                            continue;
                        const ln = (0, xml_1.findByLocalName)(sideEl, "ln");
                        if (!ln)
                            continue;
                        const host = { ln };
                        Object.defineProperty(host, "$children", {
                            value: [{ tag: "ln", node: ln }],
                            enumerable: false,
                            configurable: true,
                        });
                        b[key] = (0, fill_1.parseStroke)(host, ctx);
                    }
                    if (Object.keys(b).length)
                        part.border = b;
                }
            }
            const tcTxStyle = (0, xml_1.findByLocalName)(node, "tcTxStyle");
            if (tcTxStyle) {
                const color = readTxStyleColor(tcTxStyle, ctx);
                if (color)
                    part.textColor = color;
            }
            if (Object.keys(part).length)
                entry.parts[r] = part;
        }
        byId.set(id, entry);
    }
    return { default: def, byId };
}
function readTxStyleColor(tcTxStyle, ctx) {
    const fontFill = (0, xml_1.findByLocalName)(tcTxStyle, "solidFill");
    if (fontFill) {
        const f = (0, fill_1.parseFill)({ solidFill: fontFill }, ctx);
        if (f && f.kind === "solid")
            return f.color;
    }
    const fontRef = (0, xml_1.findByLocalName)(tcTxStyle, "fontRef");
    const fromRef = (0, theme_1.resolveColorEx)(fontRef, ctx.theme);
    if (fromRef)
        return fromRef.color;
    return (0, theme_1.resolveColorEx)(tcTxStyle, ctx.theme)?.color;
}
