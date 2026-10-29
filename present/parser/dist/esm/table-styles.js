import { attr, findAllByLocalName, findByLocalName } from "./xml.js";
import { parseFill, parseStroke } from "./fill.js";
import { loadXmlPart } from "./parts.js";
import { resolveColorEx } from "./theme.js";
export function loadTableStyles(archive, partPath, ctx) {
    if (!partPath)
        return undefined;
    const xml = loadXmlPart(archive, partPath);
    if (!xml)
        return undefined;
    return parseTableStyleList(xml, ctx);
}
/** 解析 `<a:tblStyleLst>`（文档根或 lst 节点本身均可）。 */
export function parseTableStyleList(xml, ctx) {
    const root = findByLocalName(xml, "tblStyleLst") ?? xml;
    const styles = findAllByLocalName(root, "tblStyle");
    if (!styles.length && attr(root, "def") === undefined)
        return undefined;
    const def = attr(root, "def");
    const byId = new Map();
    for (const ts of styles) {
        const id = attr(ts, "styleId");
        if (!id)
            continue;
        const entry = { id, name: attr(ts, "styleName"), parts: {} };
        const REGIONS = [
            "wholeTbl", "band1H", "band2H", "band1V", "band2V",
            "firstRow", "lastRow", "firstCol", "lastCol",
            "nwCell", "neCell", "swCell", "seCell",
        ];
        for (const r of REGIONS) {
            const node = findByLocalName(ts, r);
            if (!node)
                continue;
            const part = {};
            const tcStyle = findByLocalName(node, "tcStyle");
            if (tcStyle) {
                const fillRef = findByLocalName(tcStyle, "fill");
                if (fillRef) {
                    const f = parseFill(fillRef, ctx);
                    if (f)
                        part.fill = f;
                }
                const tcBdr = findByLocalName(tcStyle, "tcBdr");
                if (tcBdr) {
                    const b = {};
                    const sides = [
                        ["left", "left"], ["right", "right"], ["top", "top"], ["bottom", "bottom"],
                        ["insideH", "insideH"], ["insideV", "insideV"],
                    ];
                    for (const [tag, key] of sides) {
                        const sideEl = findByLocalName(tcBdr, tag);
                        if (!sideEl)
                            continue;
                        const ln = findByLocalName(sideEl, "ln");
                        if (!ln)
                            continue;
                        const host = { ln };
                        Object.defineProperty(host, "$children", {
                            value: [{ tag: "ln", node: ln }],
                            enumerable: false,
                            configurable: true,
                        });
                        b[key] = parseStroke(host, ctx);
                    }
                    if (Object.keys(b).length)
                        part.border = b;
                }
            }
            const tcTxStyle = findByLocalName(node, "tcTxStyle");
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
    const fontFill = findByLocalName(tcTxStyle, "solidFill");
    if (fontFill) {
        const f = parseFill({ solidFill: fontFill }, ctx);
        if (f && f.kind === "solid")
            return f.color;
    }
    const fontRef = findByLocalName(tcTxStyle, "fontRef");
    const fromRef = resolveColorEx(fontRef, ctx.theme);
    if (fromRef)
        return fromRef.color;
    return resolveColorEx(tcTxStyle, ctx.theme)?.color;
}
