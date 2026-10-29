import { attr, findByLocalName } from "./xml.js";
import { boolish } from "./units.js";
import { loadRels, loadXmlPart } from "./parts.js";
import { parseFill, resolveBgRef } from "./fill.js";
import { resolveColor } from "./theme.js";
import { parseShapeTree } from "./shapes.js";
import { applyClrMapToTheme } from "./theme.js";
import { parseChart } from "./chart.js";
import { parseChartEx } from "./chart-ex.js";
import { parseSmartArtDetailed } from "./smartart.js";
export function parseSlideLikePart(archive, path, baseTheme, media, rootElementName, embeddedFontFamilies, tableStyleMap, inheritedClrMap, resolveSlideNumber) {
    const xml = loadXmlPart(archive, path);
    if (!xml)
        return undefined;
    const rels = loadRels(archive, path);
    // ECMA-376 §19.3.1.7/§19.3.1.8：schemeClr 槽位（bg1/tx1/...）必须先经 clrMap 映射到
    // clrScheme 颜色名再取色。master 用自身 <p:clrMap>；layout/slide 用 <p:clrMapOvr> 的
    // overrideClrMapping，没有则继承 master（inheritedClrMap）。之前完全忽略 clrMap，
    // 凡 bg1≠lt1（如深色母版 bg1="dk1"）的 deck 全部系统性取错色。
    const preRootEl = findByLocalName(xml, rootElementName);
    const ownClrMap = parseClrMap(findByLocalName(preRootEl, "clrMap"));
    const clrMapOvr = parseClrMapOvr(findByLocalName(preRootEl, "clrMapOvr"));
    const effClrMap = ownClrMap ?? clrMapOvr ?? inheritedClrMap;
    const theme = applyClrMapToTheme(baseTheme, effClrMap);
    const ctx = {
        theme,
        rels,
        resolveImage: (p) => media.resolve(p),
        resolveMedia: (p) => media.resolve(p),
        resolveRawBytes: (key, bytes, mime) => media.resolveRaw(key, bytes, mime),
        defaultFontFamily: theme?.fontMinor,
        embeddedFontFamilies,
        archive,
        tableStyleMap,
        resolveSlideNumber,
        parseChartByRel: (relId) => {
            const chartPath = rels.resolve(relId);
            if (!chartPath)
                return null;
            // 现代 chartEx 部件文件名通常匹配 .../charts/chartN.xml 与传统图表相同，
            // 只能通过根元素命名空间判断。先尝试传统图表，若返回 null 再 fallback chartEx。
            const def = parseChart(archive, chartPath, { theme });
            if (def)
                return def;
            return parseChartEx(archive, chartPath, { theme });
        },
        parseSmartArtByRel: (relId, hostBBox, layoutRelId) => {
            const dataPath = rels.resolve(relId);
            if (!dataPath)
                return { shapes: [] };
            const layoutPath = layoutRelId ? rels.resolve(layoutRelId) : undefined;
            return parseSmartArtDetailed(archive, dataPath, ctx, hostBBox, layoutPath);
        },
    };
    const rootEl = preRootEl;
    const cSld = findByLocalName(rootEl, "cSld");
    const spTree = findByLocalName(cSld, "spTree");
    const shapes = parseShapeTree(spTree, ctx);
    if (!spTree && rootEl) {
        console.warn(`[parser] no spTree in ${path}. rootEl keys:`, Object.keys(rootEl), "cSld keys:", cSld ? Object.keys(cSld) : null);
    }
    const { paint: background, bgRef } = parseBackground(cSld, ctx);
    const rootAttrs = parseRootAttrs(rootEl);
    const hf = parseHF(findByLocalName(rootEl, "hf"));
    return { path, rels, shapes, background, bgRef, xml, rootEl, cSld, rootAttrs, hf, clrMap: effClrMap, clrMapOvr };
}
// `<p:clrMapOvr>` 内容二选一（§19.3.1.8）：
//   <a:masterClrMapping/>      → 沿用 master 的 clrMap（返回 undefined，走继承）
//   <a:overrideClrMapping …/>  → 12 槽位重映射（attrs 与 p:clrMap 同构）
function parseClrMapOvr(el) {
    if (!el)
        return undefined;
    return parseClrMap(findByLocalName(el, "overrideClrMapping"));
}
function parseRootAttrs(rootEl) {
    if (!rootEl)
        return undefined;
    const out = {};
    const t = attr(rootEl, "type");
    if (t)
        out.type = t;
    const pres = boolish(attr(rootEl, "preserve"));
    if (pres !== undefined)
        out.preserve = pres;
    const mn = attr(rootEl, "matchingName");
    if (mn)
        out.matchingName = mn;
    const show = boolish(attr(rootEl, "show"));
    if (show !== undefined)
        out.show = show;
    const sms = boolish(attr(rootEl, "showMasterSp"));
    if (sms !== undefined)
        out.showMasterSp = sms;
    const smp = boolish(attr(rootEl, "showMasterPhAnim"));
    if (smp !== undefined)
        out.showMasterPhAnim = smp;
    return Object.keys(out).length ? out : undefined;
}
function parseHF(el) {
    if (!el)
        return undefined;
    const out = {};
    const sldNum = boolish(attr(el, "sldNum"));
    if (sldNum !== undefined)
        out.sldNum = sldNum;
    const hdr = boolish(attr(el, "hdr"));
    if (hdr !== undefined)
        out.hdr = hdr;
    const ftr = boolish(attr(el, "ftr"));
    if (ftr !== undefined)
        out.ftr = ftr;
    const dt = boolish(attr(el, "dt"));
    if (dt !== undefined)
        out.dt = dt;
    return Object.keys(out).length ? out : undefined;
}
const CLR_MAP_KEYS = [
    "bg1", "tx1", "bg2", "tx2",
    "accent1", "accent2", "accent3", "accent4", "accent5", "accent6",
    "hlink", "folHlink",
];
function parseClrMap(el) {
    if (!el)
        return undefined;
    const out = {};
    for (const k of CLR_MAP_KEYS) {
        const v = attr(el, k);
        if (v)
            out[k] = v;
    }
    return Object.keys(out).length ? out : undefined;
}
function parseBgRefNode(bgRef, ctx) {
    const idx = Number(attr(bgRef, "idx") ?? "0");
    const schemeEl = findByLocalName(bgRef, "schemeClr");
    const scheme = schemeEl ? attr(schemeEl, "val") : undefined;
    const hexRaw = resolveColor(bgRef, ctx.theme);
    const hex = hexRaw ? (hexRaw.startsWith("#") ? hexRaw : `#${hexRaw}`) : undefined;
    const color = scheme || hex ? { ...(scheme ? { scheme } : {}), ...(hex ? { hex } : {}) } : undefined;
    return { idx: Number.isFinite(idx) ? idx : 0, color };
}
function parseBackground(cSld, ctx) {
    const bg = findByLocalName(cSld, "bg");
    if (!bg)
        return {};
    const bgPr = findByLocalName(bg, "bgPr");
    const direct = parseFill(bgPr, ctx);
    const bgRefEl = findByLocalName(bg, "bgRef");
    const bgRef = bgRefEl ? parseBgRefNode(bgRefEl, ctx) : undefined;
    if (direct)
        return { paint: direct, bgRef };
    if (bgRefEl) {
        const fill = resolveBgRef(bgRefEl, ctx);
        if (fill)
            return { paint: fill, bgRef };
    }
    return { bgRef };
}
export function followFirstRelByType(rels, typeSuffix) {
    for (const r of rels.list) {
        if (r.type.endsWith(typeSuffix) || r.type.includes(typeSuffix)) {
            return rels.resolve(r.id);
        }
    }
    return undefined;
}
