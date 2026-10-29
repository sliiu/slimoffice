import { decodeWebEmbedDescr, identityTransform, setOrigin } from "@sliiu/present-core";
import { angle60kToDeg, emuToPx, boolish } from "./units.js";
import { attr, findAllByLocalName, findByLocalName, orderedChildren, stripNs, } from "./xml.js";
import { modulatePaint, parseEffectListWithPresence, parseFill, parseColorAdjust, resolveEffectRef, resolveFillRef, resolveLnRef, resolveShapeStroke, } from "./fill.js";
import { resolveColor } from "./theme.js";
import { parse3DInfo } from "./shape-3d.js";
import { parseBodyPrFull, parseHlinkNode, parseLstStyle, parseTxBody, preserveRPrSnapshot } from "./text.js";
import { presetToShape, pathHasSubPaths } from "./preset-geom.js";
import { parseCustGeom, parseCustGeomFull, evalPresetTextRect } from "./cust-geom.js";
import { OFFICIAL_PRESETS } from "./preset-shapes.gen.js";
import { parseTable as parseTableNew } from "./table.js";
import { parseOleGraphicFrame } from "./ole.js";
import { parseInkMlToPath, looksLikeInkMl } from "./ink.js";
import { loadXmlPart } from "./parts.js";
import { parseModel3DGraphicFrame, MODEL3D_GRAPHIC_URI } from "./model3d.js";
import { extractOmmlFrom, inspectMathMarkup } from "./omml.js";
let _sid = 0;
const nextId = () => `s${++_sid}`;
export function parseShapeTree(spTree, ctx, group) {
    if (!spTree)
        return [];
    const out = [];
    let z = 0;
    // 子节点按 z-order 顺序处理；`<mc:AlternateContent>` 透明展开（见 expand）。
    const processChildren = (refs) => {
        const before = out.length;
        for (const ref of refs) {
            const local = stripNs(ref.tag);
            if (local === "AlternateContent") {
                expand(ref.node);
                continue;
            }
            const shape = parseAnyShape(local, ref.node, ctx, ++z, group);
            if (shape)
                out.push(shape);
        }
        return out.length - before;
    };
    // ECMA-376 Part 3 §13 Markup Compatibility — `<mc:AlternateContent>` 是一个**容器**：
    // PowerPoint / WPS 给 a14 公式写一份 `<mc:Choice Requires="a14">`（`<a14:m>` OMML）
    // 和一份 `<mc:Fallback>`（公式栅格图）。普通形状优先 Choice；**纯 OMML 文本框**
    // （没有可渲染的 `a:r` 文字）走 Fallback 图片，否则公式会变成空白。
    // 混排（通项公式黄盒子那种 Choice 里已有普通 run）仍走 Choice，OMML 由 parseTxBody 吃掉。
    const expand = (altNode) => {
        const choice = findByLocalName(altNode, "Choice");
        const fallback = findByLocalName(altNode, "Fallback");
        const choiceKids = orderedChildren(choice);
        const fallbackKids = orderedChildren(fallback);
        if (choiceKids.length > 0) {
            const choiceFlags = inspectMathMarkup(choice);
            const fallbackFlags = inspectMathMarkup(fallback);
            if (choiceFlags.hasOmml && !choiceFlags.hasPlainText && fallbackFlags.hasPicture) {
                const before = out.length;
                processChildren(fallbackKids);
                const produced = out.slice(before);
                if (produced.some(shapeHasPictureFill)) {
                    attachOmmlToShapes(produced, extractOmmlFrom(choice));
                    return;
                }
                out.length = before;
            }
            const produced = processChildren(choiceKids);
            if (produced > 0)
                return;
        }
        if (fallback)
            processChildren(fallbackKids);
    };
    processChildren(orderedChildren(spTree));
    return out;
}
function parseAnyShape(local, node, ctx, zIndex, group) {
    switch (local) {
        case "sp":
            return parseSp(node, ctx, zIndex, group);
        case "pic":
            return parsePic(node, ctx, zIndex, group);
        case "grpSp":
            return parseGrpSp(node, ctx, zIndex, group);
        case "cxnSp":
            return parseSp(node, ctx, zIndex, group);
        case "graphicFrame":
            return parseGraphicFrame(node, ctx, zIndex, group);
        case "contentPart":
            return parseContentPart(node, ctx, zIndex, group);
        default:
            return null;
    }
}
function parseGraphicFrame(node, ctx, zIndex, group) {
    const nvGraphicFramePr = findByLocalName(node, "nvGraphicFramePr");
    const xfrm = findByLocalName(node, "xfrm");
    const meta = readMetaFromNv(nvGraphicFramePr, `Frame ${zIndex}`, zIndex, ctx);
    const { bbox, transform } = readXfrm(xfrm, group);
    const graphic = findByLocalName(node, "graphic");
    const graphicData = findByLocalName(graphic, "graphicData");
    if (!graphicData)
        return placeholderRect(meta, bbox, transform);
    const chartEl = findByLocalName(graphicData, "chart");
    if (chartEl) {
        const rid = attr(chartEl, "r:id") ?? attr(chartEl, "id");
        if (rid && ctx.parseChartByRel) {
            const chart = ctx.parseChartByRel(rid);
            if (chart) {
                return {
                    ...meta,
                    kind: "chart",
                    bbox,
                    transform,
                    chart,
                };
            }
        }
        return placeholderRect(meta, bbox, transform, "Chart");
    }
    const relIds = findByLocalName(graphicData, "relIds");
    if (relIds) {
        const dmId = attr(relIds, "r:dm") ?? attr(relIds, "dm");
        const loId = attr(relIds, "r:lo") ?? attr(relIds, "lo");
        if (dmId && ctx.parseSmartArtByRel) {
            const parsed = ctx.parseSmartArtByRel(dmId, bbox, loId);
            // drawing.xml 的 dsp:cNvPr@id 是独立于 slide 的 id 空间（从 1/2 起编），直接
            // 用 `sp_${id}` 会和 slide 上的 shape 撞 id：渲染 / 动画 / 命中都按 id 建索引，
            // 撞上后 slide 级 shape 会被 SmartArt 节点顶掉。把子树 id 挂到宿主 frame 下。
            const shapes = namespaceShapeIds(parsed.shapes, `${meta.id}_`);
            if (shapes.length > 0) {
                return {
                    ...meta,
                    kind: "group",
                    bbox,
                    transform,
                    children: shapes,
                    smartArtMeta: { layout: parsed.layout ?? "list" },
                };
            }
        }
        return placeholderRect(meta, bbox, transform, "SmartArt");
    }
    const tbl = findByLocalName(graphicData, "tbl");
    if (tbl) {
        const parsed = parseTableNew(tbl, bbox, ctx);
        return {
            ...meta,
            kind: "group",
            bbox,
            transform,
            children: parsed.children,
            tableMeta: parsed.meta,
        };
    }
    const uri = attr(graphicData, "uri");
    if (uri === "http://schemas.openxmlformats.org/presentationml/2006/ole" || findByLocalName(graphicData, "oleObj")) {
        const ole = parseOleGraphicFrame(graphicData, meta, bbox, transform, {
            rels: ctx.rels,
            archive: ctx.archive,
            resolveRawBytes: ctx.resolveRawBytes,
        });
        if (ole)
            return ole;
    }
    if (uri === MODEL3D_GRAPHIC_URI || findByLocalName(graphicData, "model3d")) {
        const m3d = parseModel3DGraphicFrame(graphicData, meta, bbox, transform, {
            rels: ctx.rels,
            archive: ctx.archive,
            resolveImage: ctx.resolveImage,
            resolveMedia: ctx.resolveMedia,
        });
        if (m3d)
            return m3d;
    }
    const preview = parseGraphicPreview(graphicData, meta, bbox, transform, ctx);
    if (preview)
        return preview;
    return placeholderRect(meta, bbox, transform);
}
function parseContentPart(node, ctx, zIndex, group) {
    const nv = findByLocalName(node, "nvContentPartPr");
    const meta = readMetaFromNv(nv, `Content ${zIndex}`, zIndex, ctx);
    const { bbox, transform } = readXfrm(findByLocalName(node, "xfrm"), group);
    const rid = attr(node, "r:id") ?? attr(node, "id");
    if (!rid || !ctx.rels || !ctx.archive)
        return placeholderRect(meta, bbox, transform, "Object");
    const path = ctx.rels.resolve(rid);
    if (!path)
        return placeholderRect(meta, bbox, transform, "Object");
    const ext = path.split(".").pop()?.toLowerCase().split(/[?#]/)[0] ?? "";
    if (/^(png|jpe?g|gif|webp|bmp|svg|tif|tiff)$/.test(ext)) {
        const src = /^https?:\/\//i.test(path) || /^file:/i.test(path) ? path : ctx.resolveImage?.(path);
        if (src) {
            return {
                ...meta,
                kind: "image",
                bbox,
                transform,
                src,
            };
        }
    }
    const xml = loadXmlPart(ctx.archive, path);
    if (looksLikeInkMl(xml)) {
        const ink = parseInkMlToPath(xml, meta, bbox, transform);
        return ink ?? placeholderRect(meta, bbox, transform, "Ink");
    }
    const preview = parseGraphicPreview(node, meta, bbox, transform, ctx);
    if (preview)
        return preview;
    const label = ext && ext.length <= 6 ? ext.toUpperCase() : "Object";
    return placeholderRect(meta, bbox, transform, label);
}
function placeholderRect(meta, bbox, transform, label) {
    return {
        ...meta,
        kind: "rect",
        bbox,
        transform,
        fill: { kind: "solid", color: "#f3f4f6", alpha: 1 },
        stroke: { paint: { kind: "solid", color: "#d1d5db" }, width: 1, dash: [4, 3] },
        name: label ? `${meta.name} (${label})` : meta.name,
    };
}
/** ActiveX / 未知 graphicFrame 经常带嵌入预览图；有图就当 image 画，避免灰块。 */
function parseGraphicPreview(graphicData, meta, bbox, transform, ctx) {
    const blipFill = findDeepByLocalName(graphicData, "blipFill");
    const src = parseBlipSrc(blipFill, ctx);
    if (!src) {
        const blip = findDeepByLocalName(graphicData, "blip");
        const fromBlip = parseBlipEl(blip, ctx);
        if (!fromBlip)
            return null;
        return {
            ...meta,
            kind: "image",
            bbox,
            transform,
            src: fromBlip,
        };
    }
    return {
        ...meta,
        kind: "image",
        bbox,
        transform,
        src,
    };
}
function findDeepByLocalName(node, localName) {
    const hit = findByLocalName(node, localName);
    if (hit)
        return hit;
    if (!node || typeof node !== "object")
        return undefined;
    for (const k of Object.keys(node)) {
        if (k.startsWith("@_") || k === "#text" || k === "$children")
            continue;
        const v = node[k];
        const kids = Array.isArray(v) ? v : [v];
        for (const kid of kids) {
            if (kid && typeof kid === "object") {
                const nested = findDeepByLocalName(kid, localName);
                if (nested)
                    return nested;
            }
        }
    }
    return undefined;
}
function readMetaFromNv(nv, fallbackName, zIndex, ctx) {
    const cNvPr = findByLocalName(nv, "cNvPr");
    const id = attr(cNvPr, "id");
    const name = attr(cNvPr, "name") ?? fallbackName;
    const hidden = boolish(attr(cNvPr, "hidden"));
    const title = attr(cNvPr, "title");
    const descr = attr(cNvPr, "descr");
    const nvPr = findByLocalName(nv, "nvPr");
    const phEl = findByLocalName(nvPr, "ph");
    let placeholder;
    if (phEl) {
        placeholder = {
            type: attr(phEl, "type"),
            idx: attr(phEl, "idx"),
            sz: attr(phEl, "sz"),
            orient: attr(phEl, "orient"),
        };
    }
    const hyperlink = parseHlink(findByLocalName(cNvPr, "hlinkClick"), ctx);
    const hoverLink = parseHlink(findByLocalName(cNvPr, "hlinkHover"), ctx);
    const cNvSpPr = findByLocalName(nv, "cNvSpPr") ??
        findByLocalName(nv, "cNvPicPr") ??
        findByLocalName(nv, "cNvCxnSpPr") ??
        findByLocalName(nv, "cNvGrpSpPr") ??
        findByLocalName(nv, "cNvGraphicFramePr");
    const locks = readLocks(cNvSpPr);
    // ECMA-376 §19.3.1.43 cNvSpPr@txBox — 标记当前 sp 是 PowerPoint 的"文本框"形状（Insert→Text Box）。
    // 仅在 cNvSpPr 上有意义（其它 cNvPicPr / cNvCxnSpPr / cNvGrpSpPr 不存在该属性，attr 取值为 undefined 即可）。
    const txBox = boolish(attr(cNvSpPr, "txBox"));
    const userDrawn = boolish(attr(nvPr, "userDrawn"));
    const nvMedia = readNvMedia(nvPr, ctx);
    const meta = {
        id: id ? `sp_${id}` : nextId(),
        name,
        zIndex,
        visible: hidden !== true,
        locked: false,
        opacity: 1,
        placeholder,
        hyperlink,
        hoverLink,
    };
    if (title)
        meta.title = title;
    if (descr)
        meta.descr = descr;
    if (locks) {
        meta.locks = locks;
        if (locks.noChangeAspect)
            meta.lockAspect = true;
    }
    if (userDrawn)
        meta.userDrawn = true;
    if (nvMedia)
        meta.nvMedia = nvMedia;
    if (txBox)
        meta.txBox = true;
    return meta;
}
// ECMA-376 + PPT 2010 (p14) 媒体扩展 — 解析 trim st/end、fade in/out、loop、volume。
// p14 命名空间下：<p14:media><p14:trim st="ms" end="ms"/><p14:fade in="ms" out="ms"/></p14:media>。
function readMediaExt(node) {
    const out = {};
    // 在 sp / pic / nvPicPr / nvSpPr 的 extLst 中找 p14:media。
    const extLsts = [];
    const collect = (n) => {
        if (!n)
            return;
        const ext = findByLocalName(n, "extLst");
        if (ext)
            extLsts.push(ext);
    };
    collect(node);
    collect(findByLocalName(node, "nvSpPr"));
    collect(findByLocalName(node, "nvPicPr"));
    collect(findByLocalName(findByLocalName(node, "nvSpPr"), "nvPr"));
    collect(findByLocalName(findByLocalName(node, "nvPicPr"), "nvPr"));
    for (const extLst of extLsts) {
        for (const ext of orderedChildren(extLst)) {
            const media = findByLocalName(ext.node, "media");
            if (!media)
                continue;
            const trim = findByLocalName(media, "trim");
            if (trim) {
                const st = attr(trim, "st");
                const end = attr(trim, "end");
                const t = {};
                if (st !== undefined) {
                    const n = Number(st);
                    if (Number.isFinite(n))
                        t.start = n / 1000;
                }
                if (end !== undefined) {
                    const n = Number(end);
                    if (Number.isFinite(n))
                        t.end = n / 1000;
                }
                if (Object.keys(t).length)
                    out.trim = t;
            }
            const fade = findByLocalName(media, "fade");
            if (fade) {
                const fin = attr(fade, "in");
                const fout = attr(fade, "out");
                if (fin !== undefined) {
                    const n = Number(fin);
                    if (Number.isFinite(n))
                        out.fadeIn = n / 1000;
                }
                if (fout !== undefined) {
                    const n = Number(fout);
                    if (Number.isFinite(n))
                        out.fadeOut = n / 1000;
                }
            }
            const playLst = findByLocalName(media, "playLst");
            if (playLst) {
                // 这里仅采集第一段播放序列，复杂场景（多段、停止）保持原样。
                const cMediaNode = findByLocalName(playLst, "cMediaNode");
                const cTn = findByLocalName(cMediaNode, "cTn");
                if (cTn) {
                    const rcRaw = attr(cTn, "repeatCount");
                    if (rcRaw === "indefinite" || (rcRaw && Number(rcRaw) >= 1000000))
                        out.loop = true;
                }
            }
        }
    }
    return out;
}
function p14MediaEmbedRid(node) {
    const extLsts = [];
    const collect = (n) => {
        if (!n)
            return;
        const ext = findByLocalName(n, "extLst");
        if (ext)
            extLsts.push(ext);
    };
    collect(node);
    collect(findByLocalName(node, "nvPicPr"));
    collect(findByLocalName(findByLocalName(node, "nvPicPr"), "nvPr"));
    collect(findByLocalName(node, "nvSpPr"));
    collect(findByLocalName(findByLocalName(node, "nvSpPr"), "nvPr"));
    for (const extLst of extLsts) {
        for (const ext of orderedChildren(extLst)) {
            const media = findByLocalName(ext.node, "media");
            if (!media)
                continue;
            const rid = attr(media, "r:embed") ?? attr(media, "embed");
            if (rid)
                return rid;
        }
    }
    return undefined;
}
function resolvePlayableMedia(rid, ctx) {
    if (!rid || !ctx.rels)
        return undefined;
    const rel = ctx.rels.byId.get(rid);
    if (!rel)
        return undefined;
    if (rel.targetMode === "External") {
        const t = rel.target;
        if (!t || t === "NULL")
            return undefined;
        if (/^https?:/i.test(t) || t.startsWith("data:"))
            return t;
        return undefined;
    }
    if (!rel.target || rel.target === "NULL")
        return undefined;
    const path = ctx.rels.resolve(rid);
    if (!path)
        return undefined;
    return ctx.resolveImage?.(path);
}
// ECMA-376 §19.3.1 nvPr 子元素 audioCd / wavAudioFile（音频 CD 起止 + WAV 文件名）。
function readNvMedia(nvPr, ctx) {
    if (!nvPr)
        return undefined;
    const audioCd = findByLocalName(nvPr, "audioCd");
    const wav = findByLocalName(nvPr, "wavAudioFile");
    if (!audioCd && !wav)
        return undefined;
    const out = {};
    if (audioCd) {
        const st = findByLocalName(audioCd, "st");
        const end = findByLocalName(audioCd, "end");
        const num = (n) => {
            if (n === undefined)
                return undefined;
            const v = Number(n);
            return Number.isFinite(v) ? v : undefined;
        };
        if (st)
            out.audioCdStart = { track: num(attr(st, "track")), time: num(attr(st, "time")) };
        if (end)
            out.audioCdEnd = { track: num(attr(end, "track")), time: num(attr(end, "time")) };
    }
    if (wav) {
        const n = attr(wav, "name");
        if (n)
            out.wavAudioFileName = n;
        const rid = attr(wav, "r:embed") ?? attr(wav, "embed");
        if (rid && ctx?.rels) {
            const path = ctx.rels.resolve(rid);
            const src = path
                ? (/^https?:\/\//i.test(path) || /^file:/i.test(path) ? path : ctx.resolveMedia?.(path) ?? ctx.resolveImage?.(path))
                : undefined;
            if (src)
                out.wavAudioSrc = src;
        }
    }
    return Object.keys(out).length ? out : undefined;
}
// ECMA-376 §20.1.2.2.34 spLocks / §20.1.2.2.27 picLocks / §20.1.2.2.21 cxnSpLocks /
// §20.1.2.2.20 grpSpLocks / §20.1.2.2.18 graphicFrameLocks。所有锁定标志的并集，
// 不同形状类型仅暴露其中一部分；统一映射到 ShapeLocks 即可。
function readLocks(cNv) {
    const node = findByLocalName(cNv, "spLocks") ??
        findByLocalName(cNv, "picLocks") ??
        findByLocalName(cNv, "cxnSpLocks") ??
        findByLocalName(cNv, "grpSpLocks") ??
        findByLocalName(cNv, "graphicFrameLocks");
    if (!node)
        return undefined;
    const out = {};
    const flags = [
        "noGrp",
        "noSelect",
        "noRot",
        "noChangeAspect",
        "noMove",
        "noResize",
        "noEditPoints",
        "noAdjustHandles",
        "noChangeArrowheads",
        "noChangeShapeType",
        "noTextEdit",
        "noCrop",
        "noDrilldown",
        "noUngrp",
    ];
    for (const f of flags) {
        const v = boolish(attr(node, f));
        if (v)
            out[f] = true;
    }
    return Object.keys(out).length ? out : undefined;
}
const BW_MODES = new Set([
    "clr", "auto", "gray", "ltGray", "invGray", "grayWhite",
    "blackGray", "blackWhite", "black", "white", "hidden",
]);
function readBwMode(spPr) {
    const v = attr(spPr, "bwMode");
    if (!v)
        return undefined;
    return BW_MODES.has(v) ? v : undefined;
}
function parseHlink(node, ctx) {
    return parseHlinkNode(node, ctx ?? {});
}
function readStyleRefColor(style, refName, ctx) {
    if (!style)
        return undefined;
    const ref = findByLocalName(style, refName);
    if (!ref)
        return undefined;
    const hex = resolveColor(ref, ctx.theme);
    return hex ? hex.replace(/^#/, "") : undefined;
}
function readStyleRefColorToken(ref, theme) {
    if (!ref)
        return undefined;
    const schemeEl = findByLocalName(ref, "schemeClr");
    const scheme = schemeEl ? attr(schemeEl, "val") : undefined;
    const hexRaw = resolveColor(ref, theme);
    const hex = hexRaw ? (hexRaw.startsWith("#") ? hexRaw : `#${hexRaw}`) : undefined;
    if (!scheme && !hex)
        return undefined;
    const out = {};
    if (scheme)
        out.scheme = scheme;
    if (hex)
        out.hex = hex;
    return out;
}
function readStyleRefs(style, ctx) {
    if (!style)
        return undefined;
    const out = {};
    const lnRef = findByLocalName(style, "lnRef");
    const fillRef = findByLocalName(style, "fillRef");
    const effectRef = findByLocalName(style, "effectRef");
    const fontRef = findByLocalName(style, "fontRef");
    if (lnRef)
        out.lnRef = Number(attr(lnRef, "idx") ?? "0");
    if (fillRef)
        out.fillRef = Number(attr(fillRef, "idx") ?? "0");
    if (effectRef)
        out.effectRef = Number(attr(effectRef, "idx") ?? "0");
    if (fontRef) {
        const idx = attr(fontRef, "idx");
        if (idx === "major" || idx === "minor")
            out.fontRef = idx;
    }
    const lnColor = readStyleRefColorToken(lnRef, ctx?.theme);
    const fillColor = readStyleRefColorToken(fillRef, ctx?.theme);
    const effectColor = readStyleRefColorToken(effectRef, ctx?.theme);
    const fontColor = readStyleRefColorToken(fontRef, ctx?.theme);
    if (lnColor)
        out.lnColor = lnColor;
    if (fillColor)
        out.fillColor = fillColor;
    if (effectColor)
        out.effectColor = effectColor;
    if (fontColor)
        out.fontColor = fontColor;
    return Object.keys(out).length ? out : undefined;
}
// ECMA-376 §20.1.4.1.17 fontRef — 形状级"文字颜色 / 字体族"快捷绑定。
// fontRef 的 idx 取 major/minor，对应 theme 的 fontScheme/majorFont|minorFont（latin/ea/cs）。
// 子节点（schemeClr/srgbClr/...）则**直接覆盖**该形状文字的前景色。
// 优先级：rPr 显式 < lstStyle/master defRPr < shape 的 fontRef < 用户自己的 r:rPr/solidFill
// 我们这里把"未指定 color/fontFamily 的 run"批量套上 fontRef 提供的默认值，
// 这样后续 applyInheritance 的 master defRPr 用 ?? 不会再覆盖（fontRef 优先级更高）。
function applyFontRefToParagraphs(paragraphs, styleEl, ctx) {
    if (!styleEl)
        return paragraphs;
    const fontRef = findByLocalName(styleEl, "fontRef");
    if (!fontRef)
        return paragraphs;
    const idx = attr(fontRef, "idx");
    const refColor = resolveColor(fontRef, ctx.theme);
    // fontRef 子色含义：作为该形状所有未显式着色 run 的前景色。
    const color = refColor;
    // major → 标题字体（+mj-lt 等价于 fontScheme/majorFont）；minor → 正文字体。
    // 这里只取 latin（最常用）；如果未来要按字符脚本切换，可再扩展。
    const fontFamily = idx === "major"
        ? ctx.theme?.fontMajorSet?.latin ?? ctx.theme?.fontMajor
        : idx === "minor"
            ? ctx.theme?.fontMinorSet?.latin ?? ctx.theme?.fontMinor
            : undefined;
    if (!color && !fontFamily)
        return paragraphs;
    return paragraphs.map((p) => ({
        ...p,
        runs: p.runs.map((r) => preserveRPrSnapshot({
            ...r,
            color: r.color ?? color,
            fontFamily: r.fontFamily ?? fontFamily,
        }, r)),
    }));
}
function readXfrm(xfrm, group) {
    const transform = identityTransform();
    if (!xfrm)
        return { bbox: { x: 0, y: 0, w: 0, h: 0 }, transform };
    const off = findByLocalName(xfrm, "off");
    const ext = findByLocalName(xfrm, "ext");
    let x = emuToPx(attr(off, "x"));
    let y = emuToPx(attr(off, "y"));
    let w = emuToPx(attr(ext, "cx"));
    let h = emuToPx(attr(ext, "cy"));
    if (group) {
        w = w * group.scaleX;
        h = h * group.scaleY;
        x = group.offX + x * group.scaleX;
        y = group.offY + y * group.scaleY;
    }
    const rot = angle60kToDeg(attr(xfrm, "rot"));
    if (rot)
        transform.rotation = rot;
    const flipH = boolish(attr(xfrm, "flipH"));
    const flipV = boolish(attr(xfrm, "flipV"));
    if (flipH)
        transform.scaleX = -1;
    if (flipV)
        transform.scaleY = -1;
    return { bbox: { x, y, w, h }, transform };
}
function readGroupFrame(xfrm, parent) {
    if (!xfrm)
        return parent ?? { offX: 0, offY: 0, scaleX: 1, scaleY: 1 };
    const off = findByLocalName(xfrm, "off");
    const ext = findByLocalName(xfrm, "ext");
    const chOff = findByLocalName(xfrm, "chOff");
    const chExt = findByLocalName(xfrm, "chExt");
    let ox = emuToPx(attr(off, "x"));
    let oy = emuToPx(attr(off, "y"));
    let ew = emuToPx(attr(ext, "cx"));
    let eh = emuToPx(attr(ext, "cy"));
    const cox = emuToPx(attr(chOff, "x"));
    const coy = emuToPx(attr(chOff, "y"));
    const cew = emuToPx(attr(chExt, "cx"));
    const ceh = emuToPx(attr(chExt, "cy"));
    if (parent) {
        ew = ew * parent.scaleX;
        eh = eh * parent.scaleY;
        ox = parent.offX + ox * parent.scaleX;
        oy = parent.offY + oy * parent.scaleY;
    }
    const sx = cew > 0 ? ew / cew : 1;
    const sy = ceh > 0 ? eh / ceh : 1;
    return {
        offX: ox - cox * sx,
        offY: oy - coy * sy,
        scaleX: sx,
        scaleY: sy,
    };
}
function parseSp(node, ctx, zIndex, group) {
    const nvSpPr = findByLocalName(node, "nvSpPr") ?? findByLocalName(node, "nvCxnSpPr");
    const spPr = findByLocalName(node, "spPr");
    const styleEl = findByLocalName(node, "style");
    const txBody = findByLocalName(node, "txBody");
    const meta = readMetaFromNv(nvSpPr, `Shape ${zIndex}`, zIndex, ctx);
    const cNvCxn = findByLocalName(nvSpPr, "cNvCxnSpPr");
    const stCxn = readCxnEnd(findByLocalName(cNvCxn, "stCxn"));
    const endCxn = readCxnEnd(findByLocalName(cNvCxn, "endCxn"));
    if (stCxn)
        meta.startCxn = stCxn;
    if (endCxn)
        meta.endCxn = endCxn;
    const styleRefs = readStyleRefs(styleEl, ctx);
    if (styleRefs)
        meta.styleRefs = styleRefs;
    const info3d = parse3DInfo(spPr, ctx.theme);
    if (info3d)
        meta.meta3D = info3d;
    const bw = readBwMode(spPr);
    if (bw)
        meta.bwMode = bw;
    const useBgFill = boolish(attr(node, "useBgFill"));
    if (useBgFill)
        meta.useBgFill = true;
    const { bbox, transform } = readXfrm(findByLocalName(spPr, "xfrm"), group);
    // ECMA-376 fill inheritance: shape-level `<a:solidFill>`/`<a:gradFill>`/`<a:noFill>`
    // is authoritative when present; otherwise inherit from `<a:fillRef>`.
    let fill = parseFill(spPr, ctx);
    if (!fill && styleRefs?.fillRef !== undefined) {
        const phClr = readStyleRefColor(styleEl, "fillRef", ctx);
        fill = resolveFillRef(styleRefs.fillRef, ctx, phClr);
    }
    // ECMA-376 §20.1.2.2.24 stroke inheritance: resolve theme line style first,
    // then merge shape-level `<a:ln>` overrides on top (property by property).
    let baseStroke;
    if (styleRefs?.lnRef !== undefined) {
        const phClr = readStyleRefColor(styleEl, "lnRef", ctx);
        baseStroke = resolveLnRef(styleRefs.lnRef, ctx, phClr);
    }
    const stroke = resolveShapeStroke(spPr, ctx, baseStroke);
    // ECMA-376 effect inheritance:
    //   present (even empty) → use those effects
    //   absent               → fall back to <a:effectRef>
    const effectsR = parseEffectListWithPresence(spPr, ctx);
    let effects = effectsR ?? [];
    if (effectsR === undefined && styleRefs?.effectRef !== undefined) {
        const phClr = readStyleRefColor(styleEl, "effectRef", ctx);
        effects = resolveEffectRef(styleRefs.effectRef, ctx, phClr);
    }
    if (effects.length)
        meta.effects = effects;
    const shadow = effects.find((e) => e.kind === "outer" || e.kind === "inner");
    if (shadow)
        meta.shadow = shadow;
    const prst = findByLocalName(spPr, "prstGeom");
    const cust = findByLocalName(spPr, "custGeom");
    let base = null;
    // §20.1.9.31 prstGeom + §20.1.9.20 rect — 多数预设形状提供 textRect，描述
    // 实际可放文字的内嵌矩形（如 pie 用内接正方形而非外接 bbox），用于让文本
    // 落在可视形体内而不是溢到空白角落。后面构造 textShape 时若拿到 textRect，
    // 就用它替换 bbox 作为文字布局区域；拿不到则回退到形状 bbox。
    let textRectBox;
    if (cust) {
        const full = parseCustGeomFull(cust, bbox);
        if (full.cxnPoints?.length) {
            meta.cxnPoints = full.cxnPoints;
        }
        void parseCustGeom;
        base = {
            ...meta,
            kind: "path",
            bbox,
            transform,
            fill,
            stroke,
            d: full.d,
            fillRule: pathHasSubPaths(full.d) ? "evenodd" : undefined,
        };
    }
    else if (prst) {
        const name = attr(prst, "prst") ?? "rect";
        const adj = readPrstAdj(prst);
        const r = presetToShape(name, bbox, adj);
        const officialDef = OFFICIAL_PRESETS[name];
        if (officialDef?.rect) {
            textRectBox = evalPresetTextRect(officialDef, bbox, adj);
        }
        const prstMeta = {
            presetType: name,
            ...(Object.keys(adj).length ? { presetAdj: adj } : {}),
        };
        if (r.kind === "rect") {
            base = { ...meta, ...prstMeta, kind: "rect", bbox, transform, fill, stroke, rx: r.rx, ry: r.ry };
        }
        else if (r.kind === "ellipse") {
            base = { ...meta, ...prstMeta, kind: "ellipse", bbox, transform, fill, stroke };
        }
        else if (r.kind === "polygon" && r.points) {
            base = { ...meta, ...prstMeta, kind: "polygon", bbox, transform, fill, stroke, points: r.points };
        }
        else if (r.kind === "line") {
            base = { ...meta, ...prstMeta, kind: "line", bbox, transform, fill, stroke, x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2 };
        }
        else if (r.kind === "path" && r.d) {
            base = {
                ...meta,
                ...prstMeta,
                kind: "path",
                bbox,
                transform,
                fill,
                stroke,
                d: r.d,
                fillRule: pathHasSubPaths(r.d) ? "evenodd" : undefined,
            };
        }
        else if (r.kind === "multiPath" && r.paths && r.paths.length > 0) {
            // ECMA-376 §20.1.9.15 — DrawingML 子路径的渲染分两遍：先把所有 path 的
            // 填充按 pathLst 顺序绘制，再把所有 path 的描边按 pathLst 顺序覆盖在
            // 填充之上。chartX (X 在矩形上) / smileyFace (轮廓在脸上) / can (筒身亮
            // 顶 + 外轮廓) 等都依赖这个顺序。这里把每个子路径拆成 fill-only + stroke-only
            // 两个 Shape：fills 用前半段 zIndex，strokes 用后半段，确保 stroke 永远在
            // 同一形状内的所有 fill 之上。
            const fillChildren = [];
            const strokeChildren = [];
            r.paths.forEach((sp, i) => {
                const subFillRule = pathHasSubPaths(sp.d) ? "evenodd" : undefined;
                if (sp.fillMod !== "none") {
                    fillChildren.push({
                        ...meta,
                        id: meta.id + `_p${i}f`,
                        placeholder: undefined,
                        zIndex: zIndex + i / 200,
                        kind: "path",
                        bbox,
                        transform: identityTransform(),
                        fill: modulatePaint(fill, sp.fillMod),
                        stroke: undefined,
                        d: sp.d,
                        fillRule: subFillRule,
                    });
                }
                if (sp.stroke && stroke) {
                    strokeChildren.push({
                        ...meta,
                        id: meta.id + `_p${i}s`,
                        placeholder: undefined,
                        zIndex: zIndex + 0.5 + i / 200,
                        kind: "path",
                        bbox,
                        transform: identityTransform(),
                        fill: undefined,
                        stroke,
                        d: sp.d,
                        fillRule: subFillRule,
                    });
                }
            });
            const children = [...fillChildren, ...strokeChildren];
            // 渲染拆成 fill/stroke 子 path，但 ST_ShapeType token 必须留在 group 上，
            // 否则 round-trip 对账和后续写出都会把 callout / actionButton 当成 custGeom。
            base = { ...meta, ...prstMeta, kind: "group", bbox, transform, children };
        }
    }
    if (!base) {
        base = { ...meta, kind: "rect", bbox, transform, fill, stroke };
    }
    if (txBody) {
        const rawParagraphs = parseTxBody(txBody, ctx);
        const paragraphs = applyFontRefToParagraphs(rawParagraphs, styleEl, ctx);
        if (paragraphs.length > 0 && hasAnyText(paragraphs)) {
            const bodyPrEl = findByLocalName(txBody, "bodyPr");
            const bodyInfo = parseBodyPrFull(bodyPrEl, ctx.theme);
            const lstStyle = parseLstStyle(txBody, ctx);
            // §21.1.2.1.1 / §20.1.10.59：bodyPr@anchor 默认 "t"（顶端）；段落 pPr@algn
            // 默认 "l"（左对齐）。OOXML 不区分"placeholder / TextBox / auto-shape"——
            // 所有形状统一使用同一套默认值。若作者希望居中（如 quicktour slide6 的
            // Circle / Star），必须在 XML 里显式写 anchor="ctr"+algn="ctr"。这里不
            // 替任何形状补"自动居中"，保持与 PowerPoint / WPS 的实际渲染一致。
            const baseChild = {
                ...base,
                id: meta.id + "_base",
                placeholder: undefined,
                transform: identityTransform(),
            };
            const textShape = {
                ...meta,
                placeholder: undefined,
                // ECMA-376 §20.1.8.45 effectLst — spPr/effectLst 的 shadow/glow/reflection
                // 作用于形状的图形体（fill+stroke 几何），不向 txBody 传播。这里 textShape
                // 必须显式清掉从 ...meta 继承来的 shadow / effects，否则 svg-backend 的
                // applyShadowFilter(b.el, s.shadow) 会在文字 group 上再来一份 drop-shadow，
                // 形成"PowerPoint 中没有的额外文字阴影"（quicktour slide9 的 Down Ribbon /
                // Vertical Scroll 即是该 bug 的典型表现）。
                shadow: undefined,
                effects: undefined,
                id: meta.id + "_text",
                name: meta.name + " text",
                zIndex: zIndex + 0.5,
                kind: "text",
                // 如果 preset 给出可用的 textRect（如 pie/roundRect/...），用它做文字
                // 布局区域；否则回退到形状 bbox。bbox.w/h <= 0 时（退化情况）也回退。
                bbox: textRectBox && textRectBox.w > 0 && textRectBox.h > 0 ? textRectBox : bbox,
                transform: identityTransform(),
                paragraphs,
                vAlign: bodyInfo.vAlign,
                wrap: bodyInfo.wrap,
                insets: bodyInfo.insets,
                autoFit: bodyInfo.autoFit,
                bodyRot: bodyInfo.bodyRot,
                vert: bodyInfo.vert,
                numCol: bodyInfo.numCol,
                spcCol: bodyInfo.spcCol,
                anchorCtr: bodyInfo.anchorCtr,
                spcFirstLastPara: bodyInfo.spcFirstLastPara,
                vertOverflow: bodyInfo.vertOverflow,
                horzOverflow: bodyInfo.horzOverflow,
                rtlCol: bodyInfo.rtlCol,
                fromWordArt: bodyInfo.fromWordArt,
                forceAA: bodyInfo.forceAA,
                upright: bodyInfo.upright,
                compatLnSpc: bodyInfo.compatLnSpc,
                prstTxWarp: bodyInfo.prstTxWarp,
                body3D: bodyInfo.body3D,
                lstStyle,
            };
            // ECMA-376 §20.1.8.45 effectLst 的语义：`outerShdw` / `glow` / `reflection`
            // 等作用于形状的"图形体（fill+stroke 的几何）"，不传播到 txBody。文字若需
            // 阴影/发光，须各自在 rPr.effectLst 中显式声明（§21.1.2.3.9）。
            // 这里把形状拆成 [baseChild=几何, textShape=文字] 后，外层包裹的 group 只是
            // 结构容器，必须清掉 meta 里继承的 shape effects/shadow，否则渲染器的
            // CSS drop-shadow 会作用到外层 <g> 的所有后代（包括文字），导致"超链接/普通
            // 文字都带阴影"这种与 PowerPoint 不一致的视觉。baseChild 已经独立保留了 shadow
            // 和 effects，几何阴影不会丢失。
            return promoteWebEmbed({
                ...meta,
                shadow: undefined,
                effects: undefined,
                kind: "group",
                bbox,
                transform,
                children: [baseChild, textShape],
                ...(base.presetType ? { presetType: base.presetType, presetAdj: base.presetAdj } : {}),
            });
        }
    }
    return promoteWebEmbed(base);
}
function promoteWebEmbed(s) {
    if (!s)
        return s;
    const decoded = decodeWebEmbedDescr(s.descr);
    if (!decoded)
        return s;
    return {
        ...s,
        kind: "webEmbed",
        embedUrl: decoded.embedUrl,
        provider: decoded.provider,
        originalUrl: decoded.originalUrl,
        allowFullscreen: true,
        hyperlink: s.hyperlink ?? { kind: "url", target: decoded.originalUrl || decoded.embedUrl },
    };
}
function hasAnyText(paragraphs) {
    for (const p of paragraphs) {
        for (const r of p.runs) {
            if (r.text && r.text.trim() !== "")
                return true;
            if (r.math?.latex)
                return true;
        }
    }
    return false;
}
function shapeHasPictureFill(s) {
    if (s.kind === "image")
        return true;
    if (s.fill?.kind === "image" && s.fill.src)
        return true;
    if (s.kind === "group")
        return s.children.some(shapeHasPictureFill);
    return false;
}
function attachOmmlToShapes(shapes, math) {
    if (!math)
        return;
    for (const s of shapes) {
        s.math = math;
        if (!s.descr)
            s.descr = math.plain;
        if (s.kind === "group")
            attachOmmlToShapes(s.children, math);
    }
}
function parsePic(node, ctx, zIndex, group) {
    const nvPicPr = findByLocalName(node, "nvPicPr");
    const spPr = findByLocalName(node, "spPr");
    const blipFill = findByLocalName(node, "blipFill");
    const styleEl = findByLocalName(node, "style");
    const meta = readMetaFromNv(nvPicPr, `Picture ${zIndex}`, zIndex, ctx);
    const styleRefs = readStyleRefs(styleEl, ctx);
    if (styleRefs)
        meta.styleRefs = styleRefs;
    // ECMA-376 §20.1.5.5 scene3d / §20.1.5.12 sp3d 也可挂在 `<p:pic>` 的 `<p:spPr>` 上
    // （把图片当成"贴有图像的扁平形状"做透视 / 挤出）。之前 parsePic 漏掉这条路径，
    // 7.pptx slide 2 的"图片 28"棋盘失去了 perspectiveRelaxedModerately 的俯视效果。
    const info3d = parse3DInfo(spPr, ctx.theme);
    if (info3d)
        meta.meta3D = info3d;
    const bw = readBwMode(spPr);
    if (bw)
        meta.bwMode = bw;
    const useBgFill = boolish(attr(node, "useBgFill"));
    if (useBgFill)
        meta.useBgFill = true;
    const effectsR = parseEffectListWithPresence(spPr, ctx);
    let effects = effectsR ?? [];
    if (effectsR === undefined && styleRefs?.effectRef !== undefined) {
        const phClr = readStyleRefColor(styleEl, "effectRef", ctx);
        effects = resolveEffectRef(styleRefs.effectRef, ctx, phClr);
    }
    if (effects.length)
        meta.effects = effects;
    const shadow = effects.find((e) => e.kind === "outer" || e.kind === "inner");
    if (shadow)
        meta.shadow = shadow;
    const { bbox, transform } = readXfrm(findByLocalName(spPr, "xfrm"), group);
    const nvPr = findByLocalName(nvPicPr, "nvPr");
    const videoFile = findByLocalName(nvPr, "videoFile");
    const audioFile = findByLocalName(nvPr, "audioFile");
    const mediaEl = videoFile ?? audioFile;
    if (mediaEl) {
        const link = attr(mediaEl, "r:link") ?? attr(mediaEl, "link");
        const embed = attr(mediaEl, "r:embed") ?? attr(mediaEl, "embed");
        let mediaSrc = resolvePlayableMedia(link, ctx) ??
            resolvePlayableMedia(embed, ctx) ??
            resolvePlayableMedia(p14MediaEmbedRid(node), ctx);
        const poster = parseBlipSrc(blipFill, ctx);
        // ECMA-376 ext + p14:media — 解析 trim st/end (单位 ms) 与 fade in/out (单位 ms)。
        const mediaExt = readMediaExt(node);
        const mediaCrop = readBlipSrcRect(blipFill);
        return videoFile
            ? {
                ...meta,
                kind: "video",
                bbox,
                transform,
                src: mediaSrc ?? "",
                poster,
                controls: true,
                ...(mediaCrop ? { cropRect: mediaCrop } : {}),
                ...mediaExt,
            }
            : {
                ...meta,
                kind: "audio",
                bbox,
                transform,
                src: mediaSrc ?? "",
                ...mediaExt,
            };
    }
    let src;
    let cropRect;
    let blipAlpha;
    let blipEl;
    if (blipFill) {
        src = parseBlipSrc(blipFill, ctx);
        cropRect = readBlipSrcRect(blipFill);
        // OOXML 表达 pic 透明度的唯一规范通道：<a:blip><a:alphaModFix amt="N"/>。
        // serializer 在保存 image shape 时把 effective opacity（含祖先 group 链）烘焙到
        // 这里；parser 读回时再还原成 shape.opacity，使得 round-trip 保存后能继续编辑
        // 而不会出现"图片透明度保存后再打开变实心"的回归。
        blipEl = findByLocalName(blipFill, "blip");
        if (blipEl) {
            const alphaFix = findByLocalName(blipEl, "alphaModFix");
            if (alphaFix) {
                const amt = attr(alphaFix, "amt");
                if (amt !== undefined) {
                    const v = Number(amt) / 100000;
                    if (Number.isFinite(v) && v >= 0 && v < 1)
                        blipAlpha = v;
                }
            }
        }
    }
    if (!src)
        return null;
    let baseStroke;
    if (styleRefs?.lnRef !== undefined) {
        const phClr = readStyleRefColor(styleEl, "lnRef", ctx);
        baseStroke = resolveLnRef(styleRefs.lnRef, ctx, phClr);
    }
    const stroke = resolveShapeStroke(spPr, ctx, baseStroke);
    // ECMA-376 §20.1.9.8 custGeom on p:pic：轮廓不是外接矩形，blip 要裁进这条路径。
    const cust = findByLocalName(spPr, "custGeom");
    const clipD = cust ? parseCustGeom(cust, bbox) : "";
    const out = {
        ...meta,
        kind: "image",
        bbox,
        transform,
        src,
        cropRect,
        stroke,
        ...(clipD ? { clipD } : {}),
    };
    const svgSrc = parseSvgBlipSrc(findByLocalName(blipFill, "blip"), ctx);
    if (svgSrc)
        out.svgSrc = svgSrc;
    if (blipAlpha !== undefined)
        out.opacity = blipAlpha;
    if (blipEl) {
        const rawAdj = parseColorAdjust(blipEl);
        if (rawAdj) {
            const { alphaMod: _am, alphaModFixed: _af, ...rest } = rawAdj;
            if (Object.keys(rest).length)
                out.adjust = rest;
        }
    }
    // 解析期的"原始 OOXML opacity"快照（默认 1，若有 alphaModFix 则取其 amt/100000）。
    // 用于 serializer 区分"用户真的改了 opacity"（snapshot ≠ 内存值）和"动画系统在
    // runtime 把 opacity 写成 0 当作 entrance hide"（snapshot=1, 内存=0）—— 后者不该
    // 被烘焙回 OOXML 否则文件每次保存都多出一个 <a:alphaModFix amt="0"/>，再被解析又
    // 互相循环，破坏 round-trip 幂等。
    setOrigin(out, { opacity: blipAlpha ?? 1 });
    return out;
}
function parseSvgBlipSrc(blipEl, ctx) {
    if (!blipEl)
        return undefined;
    const extLst = findByLocalName(blipEl, "extLst");
    for (const ext of findAllByLocalName(extLst, "ext")) {
        const hit = findByLocalName(ext, "svgBlip");
        if (!hit)
            continue;
        const rid = attr(hit, "r:embed") ?? attr(hit, "embed") ?? attr(hit, "r:link") ?? attr(hit, "link");
        if (!rid)
            continue;
        const path = ctx.rels?.resolve(rid);
        if (!path)
            continue;
        return ctx.resolveImage?.(path);
    }
    return undefined;
}
/** `a:srcRect` 百分比（可负，表示窗口伸出画面）。全 0 视为没有裁剪。 */
function readBlipSrcRect(blipFill) {
    const sr = findByLocalName(blipFill, "srcRect");
    if (!sr)
        return undefined;
    const f = (n) => {
        if (n === undefined)
            return 0;
        const v = Number(n) / 100000;
        return Number.isFinite(v) ? v : 0;
    };
    const l = f(attr(sr, "l"));
    const t = f(attr(sr, "t"));
    const r = f(attr(sr, "r"));
    const b = f(attr(sr, "b"));
    if (!l && !t && !r && !b)
        return undefined;
    return { l, t, r, b };
}
function parseBlipSrc(blipFill, ctx) {
    if (!blipFill)
        return undefined;
    return parseBlipEl(findByLocalName(blipFill, "blip"), ctx);
}
function parseBlipEl(blipEl, ctx) {
    if (!blipEl)
        return undefined;
    const embed = attr(blipEl, "r:embed") ?? attr(blipEl, "embed");
    const link = attr(blipEl, "r:link") ?? attr(blipEl, "link");
    const rid = embed ?? link;
    if (!rid)
        return undefined;
    const path = ctx.rels?.resolve(rid);
    if (!path)
        return undefined;
    if (/^https?:\/\//i.test(path) || /^file:/i.test(path))
        return path;
    return ctx.resolveImage?.(path);
}
function readCxnEnd(el) {
    if (!el)
        return undefined;
    const id = Number(attr(el, "id"));
    const idx = Number(attr(el, "idx") ?? "0");
    if (!Number.isFinite(id))
        return undefined;
    return { id, idx: Number.isFinite(idx) ? idx : 0, shapeId: `sp_${id}` };
}
function readPrstAdj(prst) {
    const avLst = findByLocalName(prst, "avLst");
    if (!avLst)
        return {};
    const out = {};
    for (const gd of findAllByLocalName(avLst, "gd")) {
        const name = attr(gd, "name");
        const fmla = attr(gd, "fmla");
        if (!name || !fmla)
            continue;
        const m = /^val\s+(-?\d+)$/.exec(fmla);
        if (m)
            out[name] = Number(m[1]);
    }
    return out;
}
function parseGrpSp(node, ctx, zIndex, parent) {
    const nvGrpSpPr = findByLocalName(node, "nvGrpSpPr");
    const grpSpPr = findByLocalName(node, "grpSpPr");
    const meta = readMetaFromNv(nvGrpSpPr, `Group ${zIndex}`, zIndex, ctx);
    const bw = readBwMode(grpSpPr);
    if (bw)
        meta.bwMode = bw;
    const xfrm = findByLocalName(grpSpPr, "xfrm");
    const { bbox, transform } = readXfrm(xfrm, parent);
    const inner = readGroupFrame(xfrm, parent);
    const children = parseShapeTree(node, ctx, inner).filter((c) => c.id !== meta.id);
    // ECMA-376 §20.1.2.2.22 grpSpPr 的填充是子形状 a:grpFill 的来源。
    const fill = parseFill(grpSpPr, ctx);
    return { ...meta, kind: "group", bbox, transform, children, ...(fill ? { fill } : {}) };
}
/**
 * 给一棵 shape 子树的 id 加前缀（SmartArt drawing.xml 等独立 id 空间并入 slide 时用），
 * 连接符 stCxn / endCxn 指向子树内 shape 的 `shapeId` 一并重写。原地修改并返回同一数组。
 */
function namespaceShapeIds(shapes, prefix) {
    const rename = (s) => {
        s.id = `${prefix}${s.id}`;
        if (s.kind === "group")
            for (const c of s.children)
                rename(c);
    };
    const relink = (s) => {
        if (s.startCxn?.shapeId)
            s.startCxn = { ...s.startCxn, shapeId: `${prefix}${s.startCxn.shapeId}` };
        if (s.endCxn?.shapeId)
            s.endCxn = { ...s.endCxn, shapeId: `${prefix}${s.endCxn.shapeId}` };
        if (s.kind === "group")
            for (const c of s.children)
                relink(c);
    };
    for (const s of shapes)
        rename(s);
    for (const s of shapes)
        relink(s);
    return shapes;
}
