"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseBodyPr = parseBodyPr;
exports.parseBodyPrFull = parseBodyPrFull;
exports.splitTextByScript = splitTextByScript;
exports.parseTxBody = parseTxBody;
exports.parseLstStyle = parseLstStyle;
exports.parsePPrDefaults = parsePPrDefaults;
exports.preserveRPrSnapshot = preserveRPrSnapshot;
exports.explicitRPrFromRaw = explicitRPrFromRaw;
exports.readRunProps = readRunProps;
exports.mergeHlinkOverrideIntoSnapshot = mergeHlinkOverrideIntoSnapshot;
exports.mergeHyperlinkIntoSnapshot = mergeHyperlinkIntoSnapshot;
exports.parseHlinkNode = parseHlinkNode;
exports.resolveSlideJumpTarget = resolveSlideJumpTarget;
exports.mapAction = mapAction;
const core_1 = require("@sliiu/present-core");
const shape_3d_1 = require("./shape-3d");
const fill_1 = require("./fill");
const units_1 = require("./units");
const units_2 = require("./units");
const xml_1 = require("./xml");
const omml_1 = require("./omml");
const theme_1 = require("./theme");
const DEFAULT_INSETS_EMU = { l: 91440, t: 45720, r: 91440, b: 45720 };
function parseBodyPr(bodyPr) {
    if (!bodyPr)
        return {};
    const out = {};
    const anchor = (0, xml_1.attr)(bodyPr, "anchor");
    if (anchor === "ctr")
        out.vAlign = "middle";
    else if (anchor === "b")
        out.vAlign = "bottom";
    else if (anchor === "t")
        out.vAlign = "top";
    const wrap = (0, xml_1.attr)(bodyPr, "wrap");
    if (wrap === "none")
        out.wrap = false;
    else if (wrap === "square")
        out.wrap = true;
    const lIns = (0, xml_1.attr)(bodyPr, "lIns");
    const tIns = (0, xml_1.attr)(bodyPr, "tIns");
    const rIns = (0, xml_1.attr)(bodyPr, "rIns");
    const bIns = (0, xml_1.attr)(bodyPr, "bIns");
    if (lIns !== undefined || tIns !== undefined || rIns !== undefined || bIns !== undefined) {
        out.insets = {
            l: (0, units_1.emuToPx)(lIns ?? DEFAULT_INSETS_EMU.l),
            t: (0, units_1.emuToPx)(tIns ?? DEFAULT_INSETS_EMU.t),
            r: (0, units_1.emuToPx)(rIns ?? DEFAULT_INSETS_EMU.r),
            b: (0, units_1.emuToPx)(bIns ?? DEFAULT_INSETS_EMU.b),
        };
    }
    const rot = (0, xml_1.attr)(bodyPr, "rot");
    if (rot !== undefined) {
        const n = Number(rot);
        if (Number.isFinite(n))
            out.bodyRot = n / 60000;
    }
    const vert = (0, xml_1.attr)(bodyPr, "vert");
    if (vert)
        out.vert = vert;
    const numCol = (0, xml_1.attr)(bodyPr, "numCol");
    if (numCol) {
        const n = Number(numCol);
        if (Number.isFinite(n))
            out.numCol = n;
    }
    const spcCol = (0, xml_1.attr)(bodyPr, "spcCol");
    if (spcCol)
        out.spcCol = (0, units_1.emuToPx)(spcCol);
    const normAuto = (0, xml_1.findByLocalName)(bodyPr, "normAutofit");
    const spAuto = (0, xml_1.findByLocalName)(bodyPr, "spAutoFit");
    if (normAuto) {
        const fontScale = (0, xml_1.attr)(normAuto, "fontScale");
        const lnSpcReduction = (0, xml_1.attr)(normAuto, "lnSpcReduction");
        const af = { kind: "normAutofit" };
        if (fontScale)
            af.fontScale = Number(fontScale) / 100000;
        if (lnSpcReduction)
            af.lnSpcReduction = Number(lnSpcReduction) / 100000;
        out.autoFit = af;
    }
    else if (spAuto) {
        out.autoFit = { kind: "spAutoFit" };
    }
    else if ((0, xml_1.findByLocalName)(bodyPr, "noAutofit")) {
        out.autoFit = { kind: "none" };
    }
    const anchorCtr = (0, units_2.boolish)((0, xml_1.attr)(bodyPr, "anchorCtr"));
    if (anchorCtr !== undefined)
        out.anchorCtr = anchorCtr;
    const spcFirstLastPara = (0, units_2.boolish)((0, xml_1.attr)(bodyPr, "spcFirstLastPara"));
    if (spcFirstLastPara !== undefined)
        out.spcFirstLastPara = spcFirstLastPara;
    const vOver = (0, xml_1.attr)(bodyPr, "vertOverflow");
    if (vOver === "overflow" || vOver === "ellipsis" || vOver === "clip")
        out.vertOverflow = vOver;
    const hOver = (0, xml_1.attr)(bodyPr, "horzOverflow");
    if (hOver === "overflow" || hOver === "ellipsis" || hOver === "clip")
        out.horzOverflow = hOver;
    const rtlCol = (0, units_2.boolish)((0, xml_1.attr)(bodyPr, "rtlCol"));
    if (rtlCol !== undefined)
        out.rtlCol = rtlCol;
    const fromWordArt = (0, units_2.boolish)((0, xml_1.attr)(bodyPr, "fromWordArt"));
    if (fromWordArt !== undefined)
        out.fromWordArt = fromWordArt;
    const forceAA = (0, units_2.boolish)((0, xml_1.attr)(bodyPr, "forceAA"));
    if (forceAA !== undefined)
        out.forceAA = forceAA;
    const upright = (0, units_2.boolish)((0, xml_1.attr)(bodyPr, "upright"));
    if (upright !== undefined)
        out.upright = upright;
    const compatLnSpc = (0, units_2.boolish)((0, xml_1.attr)(bodyPr, "compatLnSpc"));
    if (compatLnSpc !== undefined)
        out.compatLnSpc = compatLnSpc;
    // ECMA-376 §20.1.9.20 prstTxWarp — 文本预设变形（WordArt 弯曲样式）。
    const prstTxWarp = (0, xml_1.findByLocalName)(bodyPr, "prstTxWarp");
    if (prstTxWarp) {
        const prst = (0, xml_1.attr)(prstTxWarp, "prst") ?? "textNoShape";
        const avLst = (0, xml_1.findByLocalName)(prstTxWarp, "avLst");
        const av = {};
        if (avLst) {
            for (const gd of (0, xml_1.findAllByLocalName)(avLst, "gd")) {
                const name = (0, xml_1.attr)(gd, "name");
                const fmla = (0, xml_1.attr)(gd, "fmla");
                if (!name || !fmla)
                    continue;
                const m = /^val\s+(-?\d+)$/.exec(fmla);
                if (m)
                    av[name] = Number(m[1]);
            }
        }
        out.prstTxWarp = Object.keys(av).length ? { prst, avLst: av } : { prst };
    }
    return out;
}
function parseBodyPrFull(bodyPr, theme) {
    const info = parseBodyPr(bodyPr);
    if (!bodyPr)
        return info;
    const body3D = (0, shape_3d_1.parse3DInfo)(bodyPr, theme);
    if (body3D)
        info.body3D = body3D;
    return info;
}
function themeRef(token, theme) {
    if (!token)
        return undefined;
    if (!token.startsWith("+"))
        return token;
    const match = /^\+(mj|mn)-(lt|ea|cs|sym)$/.exec(token);
    if (!match)
        return token;
    const [, scope, kind] = match;
    const set = scope === "mj" ? theme?.fontMajorSet : theme?.fontMinorSet;
    if (!set)
        return undefined;
    if (kind === "lt")
        return set.latin;
    if (kind === "ea")
        return set.ea;
    if (kind === "cs")
        return set.cs;
    if (kind === "sym")
        return set.sym;
    return undefined;
}
function cssFontFamily(names) {
    const seen = new Set();
    const out = [];
    for (const n of names) {
        if (!n)
            continue;
        const trimmed = n.trim();
        if (!trimmed)
            continue;
        if (seen.has(trimmed))
            continue;
        seen.add(trimmed);
        out.push(/[\s",]/.test(trimmed) ? `"${trimmed.replace(/"/g, '\\"')}"` : trimmed);
    }
    return out.length ? out.join(", ") : undefined;
}
function charScript(cp) {
    if (cp < 0x0020)
        return "neutral";
    if (cp === 0x0020 || cp === 0x00a0)
        return "neutral";
    // ASCII 标点
    if (cp < 0x0080)
        return cp < 0x0030 || (cp >= 0x003a && cp <= 0x0040) || (cp >= 0x005b && cp <= 0x0060) || cp >= 0x007b ? "neutral" : "latin";
    // Latin-1 supplement / Latin Extended / IPA / Greek / Cyrillic / Armenian
    if (cp <= 0x058f)
        return "latin";
    // Hebrew / Arabic / Syriac / Thaana / NKo / Samaritan / Mandaic
    if (cp >= 0x0590 && cp <= 0x08ff)
        return "cs";
    // Devanagari / Bengali / Gurmukhi / Gujarati / Oriya / Tamil / Telugu / Kannada / Malayalam / Sinhala
    if (cp >= 0x0900 && cp <= 0x0dff)
        return "cs";
    // Thai / Lao / Tibetan / Myanmar / Georgian
    if (cp >= 0x0e00 && cp <= 0x10ff)
        return "cs";
    // Hangul Jamo
    if (cp >= 0x1100 && cp <= 0x11ff)
        return "ea";
    // Ethiopic 等 — 当成 latin 簇兜底
    if (cp >= 0x1200 && cp <= 0x2dff)
        return "latin";
    // 一般符号（含 zero-width / Combining）→ neutral
    if (cp >= 0x2000 && cp <= 0x206f)
        return "neutral";
    // 货币/编号/几何 — 与拉丁同行
    if (cp >= 0x20a0 && cp <= 0x2bff)
        return "latin";
    // CJK 范围
    if (cp >= 0x2e80 && cp <= 0x2fff)
        return "ea";
    // CJK 符号与标点 / 平假名 / 片假名 / 注音 / 谚文兼容字母 / 康熙部首扩展
    if (cp >= 0x3000 && cp <= 0x33ff)
        return "ea";
    // CJK 统一表意主区
    if (cp >= 0x3400 && cp <= 0x9fff)
        return "ea";
    // Hangul Syllables
    if (cp >= 0xac00 && cp <= 0xd7af)
        return "ea";
    // CJK Compatibility Ideographs
    if (cp >= 0xf900 && cp <= 0xfaff)
        return "ea";
    // Halfwidth / Fullwidth
    if (cp >= 0xff00 && cp <= 0xffef)
        return "ea";
    // CJK Extension B+（U+20000–2FFFF）
    if (cp >= 0x20000 && cp <= 0x3ffff)
        return "ea";
    return "neutral";
}
// 把 text 按脚本切成连续段。neutral 与相邻可见段并段；若整段都是 neutral 也作为单段返回。
function splitTextByScript(text) {
    if (!text)
        return [{ text: "", script: "neutral" }];
    const out = [];
    let buf = "";
    let curScript = "neutral";
    let pendingNeutral = "";
    for (const ch of text) {
        const cp = ch.codePointAt(0);
        const s = charScript(cp);
        if (s === "neutral") {
            if (buf)
                buf += ch;
            else
                pendingNeutral += ch;
            continue;
        }
        if (curScript === "neutral" || curScript === s) {
            buf += pendingNeutral + ch;
            pendingNeutral = "";
            curScript = s;
            continue;
        }
        out.push({ text: buf, script: curScript });
        buf = pendingNeutral + ch;
        pendingNeutral = "";
        curScript = s;
    }
    if (buf)
        out.push({ text: buf + pendingNeutral, script: curScript });
    else if (pendingNeutral)
        out.push({ text: pendingNeutral, script: "neutral" });
    return out;
}
function resolveTypefacesFromRpr(rPr, ctx) {
    if (!rPr)
        return { hasExplicit: false };
    const latinRaw = (0, xml_1.attr)((0, xml_1.findByLocalName)(rPr, "latin"), "typeface");
    const eaRaw = (0, xml_1.attr)((0, xml_1.findByLocalName)(rPr, "ea"), "typeface");
    const csRaw = (0, xml_1.attr)((0, xml_1.findByLocalName)(rPr, "cs"), "typeface");
    const symRaw = (0, xml_1.attr)((0, xml_1.findByLocalName)(rPr, "sym"), "typeface");
    if (!latinRaw && !eaRaw && !csRaw && !symRaw)
        return { hasExplicit: false };
    const minor = ctx.theme?.fontMinorSet;
    return {
        latin: themeRef(latinRaw, ctx.theme) ?? minor?.latin,
        ea: themeRef(eaRaw, ctx.theme) ?? minor?.ea,
        cs: themeRef(csRaw, ctx.theme) ?? minor?.cs,
        sym: themeRef(symRaw, ctx.theme) ?? minor?.sym,
        hasExplicit: true,
    };
}
// 给定脚本与已解析的 typeface 槽位，构造该脚本下的 CSS font-family 列表。
// 顺序：本脚本主字体 → 其他槽位字体（保留作者意图作为副选）→ defaultFontFamily →
//        嵌入字体基底族名（仅用作脚本兜底）。
function fontFamilyForScript(script, faces, ctx) {
    if (!faces.hasExplicit)
        return undefined;
    const { latin, ea, cs, sym } = faces;
    let primary;
    let secondary;
    switch (script) {
        case "ea":
            primary = ea;
            secondary = [latin, cs, sym];
            break;
        case "cs":
            primary = cs;
            secondary = [latin, ea, sym];
            break;
        case "latin":
        default:
            primary = latin;
            secondary = [ea, cs, sym];
            break;
    }
    return cssFontFamily([
        primary,
        ...secondary,
        ctx.defaultFontFamily,
        ...(ctx.embeddedFontFamilies ?? []),
    ]);
}
function parseTxBody(txBody, ctx) {
    if (!txBody)
        return [];
    const paragraphs = [];
    for (const p of (0, xml_1.findAllByLocalName)(txBody, "p")) {
        for (const para of parseParagraph(p, ctx))
            paragraphs.push(para);
    }
    return paragraphs;
}
// ECMA-376 §21.1.2.1.5 (`<a:lstStyle>`). 容器内 9 级默认段落/run 样式，
// 包含 defPPr + lvl1pPr..lvl9pPr。
function parseLstStyle(txBody, ctx) {
    if (!txBody)
        return undefined;
    const lstStyle = (0, xml_1.findByLocalName)(txBody, "lstStyle");
    if (!lstStyle)
        return undefined;
    const out = [];
    const pushLevel = (lvl, key) => {
        const el = (0, xml_1.findByLocalName)(lstStyle, key);
        if (!el)
            return;
        const pPr = parsePPrDefaults(el, ctx);
        const defRPr = (0, xml_1.findByLocalName)(el, "defRPr");
        const rPr = defRPr ? readRunProps(defRPr, ctx) : undefined;
        const bullet = readBullet(el, ctx);
        const entry = { level: lvl };
        if (Object.keys(pPr).length)
            entry.pPr = pPr;
        if (rPr && Object.keys(rPr).length)
            entry.rPr = rPr;
        if (bullet)
            entry.bullet = bullet;
        out.push(entry);
    };
    pushLevel(0, "defPPr");
    for (let i = 1; i <= 9; i++)
        pushLevel(i, `lvl${i}pPr`);
    return out.length ? out : undefined;
}
function parsePPrDefaults(pPr, ctx) {
    if (!pPr)
        return {};
    const out = {};
    const algn = (0, xml_1.attr)(pPr, "algn");
    if (algn !== undefined)
        out.align = mapAlign(algn);
    const ln = readLineHeight(pPr);
    if (ln.multiplier !== undefined)
        out.lineHeight = ln.multiplier;
    if (ln.absolutePx !== undefined)
        out.lineHeightPx = ln.absolutePx;
    const indentEmu = (0, xml_1.attr)(pPr, "indent");
    if (indentEmu !== undefined)
        out.indent = (0, units_1.emuToPx)(indentEmu);
    const marLEmu = (0, xml_1.attr)(pPr, "marL");
    if (marLEmu !== undefined)
        out.marginLeft = (0, units_1.emuToPx)(marLEmu);
    const marREmu = (0, xml_1.attr)(pPr, "marR");
    if (marREmu !== undefined)
        out.marginRight = (0, units_1.emuToPx)(marREmu);
    const lvlAttr = (0, xml_1.attr)(pPr, "lvl");
    if (lvlAttr !== undefined) {
        const n = Number(lvlAttr);
        if (Number.isFinite(n))
            out.level = n;
    }
    const rtl = (0, units_2.boolish)((0, xml_1.attr)(pPr, "rtl"));
    if (rtl !== undefined)
        out.rtl = rtl;
    const fontAlgn = (0, xml_1.attr)(pPr, "fontAlgn");
    if (fontAlgn)
        out.fontAlign = fontAlgn;
    const defTabSz = (0, xml_1.attr)(pPr, "defTabSz");
    if (defTabSz)
        out.defTabSz = (0, units_1.emuToPx)(defTabSz);
    const tabLst = (0, xml_1.findByLocalName)(pPr, "tabLst");
    if (tabLst) {
        const tabs = [];
        for (const tab of (0, xml_1.findAllByLocalName)(tabLst, "tab")) {
            const pos = (0, xml_1.attr)(tab, "pos");
            if (pos === undefined)
                continue;
            const t = { pos: (0, units_1.emuToPx)(pos) };
            const align = (0, xml_1.attr)(tab, "algn");
            if (align)
                t.align = align;
            tabs.push(t);
        }
        if (tabs.length > 0)
            out.tabStops = tabs;
    }
    const spcBef = readSpaceSpec((0, xml_1.findByLocalName)(pPr, "spcBef"));
    if (spcBef !== undefined)
        out.spaceBeforePx = spcBef;
    const spcAft = readSpaceSpec((0, xml_1.findByLocalName)(pPr, "spcAft"));
    if (spcAft !== undefined)
        out.spaceAfterPx = spcAft;
    const bullet = readBullet(pPr, ctx);
    if (bullet)
        out.bullet = bullet;
    const eaLnBrk = (0, units_2.boolish)((0, xml_1.attr)(pPr, "eaLnBrk"));
    if (eaLnBrk !== undefined)
        out.eaLnBrk = eaLnBrk;
    const latinLnBrk = (0, units_2.boolish)((0, xml_1.attr)(pPr, "latinLnBrk"));
    if (latinLnBrk !== undefined)
        out.latinLnBrk = latinLnBrk;
    const hangingPunct = (0, units_2.boolish)((0, xml_1.attr)(pPr, "hangingPunct"));
    if (hangingPunct !== undefined)
        out.hangingPunct = hangingPunct;
    const defRPr = (0, xml_1.findByLocalName)(pPr, "defRPr");
    if (defRPr) {
        const def = readRunProps(defRPr, ctx);
        if (Object.keys(def).length)
            out.defRunStyle = def;
    }
    return out;
}
function parseParagraph(p, ctx) {
    const pPr = (0, xml_1.findByLocalName)(p, "pPr");
    const defaults = parsePPrDefaults(pPr, ctx);
    const segments = [[]];
    const push = (r) => {
        segments[segments.length - 1].push(r);
    };
    const consume = (ref) => {
        const local = (0, xml_1.stripNs)(ref.tag);
        if (local === "r") {
            for (const sub of parseRun(ref.node, ctx))
                push(sub);
        }
        else if (local === "br") {
            segments.push([]);
        }
        else if (local === "fld") {
            const t = (0, xml_1.findByLocalName)(ref.node, "t");
            const text = typeof t === "string" ? t : (t?.["#text"] ?? "");
            const fldType = (0, xml_1.attr)(ref.node, "type");
            const rPr = (0, xml_1.findByLocalName)(ref.node, "rPr");
            const props = readRunProps(rPr, ctx);
            if (fldType)
                props.field = fldType;
            if (text || fldType) {
                const run = { text: text ?? "", ...props };
                // 即便 fld 没写 rPr 也挂一个空 snapshot `{}`，跟 "有 rPr 但所有字段继承" 同语义。
                // 这样 serializer 的 runHasExplicitStyle 能识别"未编辑的纯继承"路径，避免把
                // `<a:fld>` 误判为编辑过的 run 而 rebuild 成 `<a:r>`。
                // 与 parseRun 的 attachSnap 同口径写到统一的 __origin（serializer 读 getOrigin）。
                (0, core_1.setOrigin)(run, { explicitRPr: mergeHlinkOverrideIntoSnapshot(explicitRPrFromRaw(rPr), props) ?? {} });
                push(run);
            }
        }
        else if (local === "AlternateContent") {
            for (const kid of (0, xml_1.pickAlternateContentChildren)(ref.node))
                consume(kid);
        }
        else if (local === "m" || local === "oMath" || local === "oMathPara") {
            const rPr = (0, omml_1.firstMathRunProps)(ref.node);
            const props = rPr ? readRunProps(rPr, ctx) : {};
            const mathRun = (0, omml_1.ommlToTextRun)(ref.node, props);
            if (mathRun) {
                (0, core_1.setOrigin)(mathRun, { explicitRPr: rPr ? (explicitRPrFromRaw(rPr) ?? {}) : {} });
                push(mathRun);
            }
        }
    };
    for (const ref of (0, xml_1.orderedChildren)(p))
        consume(ref);
    const last = segments[segments.length - 1];
    if (last.length === 0) {
        const endRPr = (0, xml_1.findByLocalName)(p, "endParaRPr");
        const def = endRPr ? readRunProps(endRPr, ctx) : {};
        // 与 parseRun / fld 一致：给这个由 endParaRPr 合成的空 run 也挂上 explicitRPr 快照。
        // 否则 serializer 的 runHasExplicitStyle 因 snap 缺失而把它的继承样式（如 sz/字体）
        // 全部当成"用户显式样式" → memHasExplicitStyle=true → 触发整段 rebuild，把未编辑
        // 段落写坏（7.pptx slide8/12/13/18 的截断 / 串字 / 多空 run 即源于此）。
        const emptyRun = { text: "", ...def };
        (0, core_1.setOrigin)(emptyRun, { explicitRPr: endRPr ? (explicitRPrFromRaw(endRPr) ?? {}) : {} });
        last.push(emptyRun);
    }
    return segments.map((runs) => ({ ...defaults, runs }));
}
function readBullet(pPr, ctx) {
    if (!pPr)
        return undefined;
    if ((0, xml_1.findByLocalName)(pPr, "buNone"))
        return { kind: "none" };
    const buFontEl = (0, xml_1.findByLocalName)(pPr, "buFont");
    const font = themeRef((0, xml_1.attr)(buFontEl, "typeface"), ctx.theme) ?? (0, xml_1.attr)(buFontEl, "typeface");
    const buClrEl = (0, xml_1.findByLocalName)(pPr, "buClr");
    const color = buClrEl ? (0, theme_1.resolveColor)(buClrEl, ctx.theme) : undefined;
    // ECMA-376 §21.1.2.4.4 buSzPct — 相对 run 字号的百分比；
    // §21.1.2.4.5 buSzPts — 绝对点数（按 pt 直接指定 bullet 字号）。两者互斥；
    // 同时存在时 buSzPts 优先（PowerPoint 实际行为）。如果存在 buSzTx 则跟随 run 字号
    // —— 这是 OOXML 默认行为，因此无需保存额外字段（renderer 在 sizePct 缺失时
    // 会回退到 run 字号）。
    const buSzPctEl = (0, xml_1.findByLocalName)(pPr, "buSzPct");
    const buSzPtsEl = (0, xml_1.findByLocalName)(pPr, "buSzPts");
    const sizePct = buSzPctEl ? (0, units_1.percentToFloat)((0, xml_1.attr)(buSzPctEl, "val")) : undefined;
    let sizePts;
    if (buSzPtsEl) {
        const v = (0, xml_1.attr)(buSzPtsEl, "val");
        if (v !== undefined) {
            const n = Number(v);
            if (Number.isFinite(n))
                sizePts = n / 100;
        }
    }
    const buBlip = (0, xml_1.findByLocalName)(pPr, "buBlip");
    if (buBlip) {
        const blip = (0, xml_1.findByLocalName)(buBlip, "blip");
        const embed = (0, xml_1.attr)(blip, "r:embed") ?? (0, xml_1.attr)(blip, "embed");
        let src;
        if (embed && ctx.rels && ctx.resolveImage) {
            const path = ctx.rels.resolve(embed);
            if (path)
                src = ctx.resolveImage(path);
        }
        if (src) {
            const out = { kind: "picture", src };
            if (sizePct !== undefined)
                out.sizePct = sizePct;
            if (sizePts !== undefined)
                out.sizePts = sizePts;
            return out;
        }
    }
    const buAutoNum = (0, xml_1.findByLocalName)(pPr, "buAutoNum");
    if (buAutoNum) {
        const numType = (0, xml_1.attr)(buAutoNum, "type") ?? "arabicPeriod";
        const startAtAttr = (0, xml_1.attr)(buAutoNum, "startAt");
        const out = { kind: "number", numType };
        if (startAtAttr !== undefined) {
            const n = Number(startAtAttr);
            if (Number.isFinite(n))
                out.startAt = n;
        }
        if (font)
            out.font = font;
        if (color)
            out.color = color;
        if (sizePct !== undefined)
            out.sizePct = sizePct;
        if (sizePts !== undefined)
            out.sizePts = sizePts;
        return out;
    }
    const buChar = (0, xml_1.findByLocalName)(pPr, "buChar");
    if (buChar) {
        const ch = (0, xml_1.attr)(buChar, "char") ?? "";
        if (!ch)
            return undefined;
        const out = { kind: "char", char: ch };
        if (font)
            out.font = font;
        if (color)
            out.color = color;
        if (sizePct !== undefined)
            out.sizePct = sizePct;
        if (sizePts !== undefined)
            out.sizePts = sizePts;
        return out;
    }
    return undefined;
}
// 取 CSS font-family 列表的首项（去引号），与 serializer 的 firstCssTypeface 行为一致。
// 用于把脚本解析出的 fontFamily 列表归约成单个 typeface，写进 round-trip 快照。
function firstTypefaceOf(css) {
    if (!css)
        return undefined;
    const s = css.replace(/^\s+/, "");
    if (!s)
        return undefined;
    const q = s[0];
    if (q === '"' || q === "'") {
        let out = "";
        let i = 1;
        while (i < s.length && s[i] !== q) {
            if (s[i] === "\\" && i + 1 < s.length) {
                out += s[i + 1];
                i += 2;
            }
            else {
                out += s[i++];
            }
        }
        return out || undefined;
    }
    const comma = s.indexOf(",");
    const first = (comma < 0 ? s : s.slice(0, comma)).trim();
    return first || undefined;
}
function parseRun(r, ctx) {
    const rPr = (0, xml_1.findByLocalName)(r, "rPr");
    const props = readRunProps(rPr, ctx);
    const t = (0, xml_1.findByLocalName)(r, "t");
    const text = typeof t === "string" ? t : (t?.["#text"] ?? "");
    // 给每个 run 留一份"显式字段快照"——只记录 rPr 上**确实**写了的子项 / 属性，
    // 不含继承推导出的值。round-trip 写回时 serializer 拿当前内存 run vs 这份 snapshot
    // 比较，未变 → 保留 raw rPr 字节，避免把继承得来的字段（如 master 默认的 Calibri）
    // 又显式补写一份 `<a:latin typeface="Calibri"/>` 污染原文件。
    // hlink 视觉覆盖（解析期合成的主题色 + underline）也要并进快照，否则未编辑的
    // 超链接 run 会被误判为编辑过而重写原字节。
    const explicit = mergeHyperlinkIntoSnapshot(mergeHlinkOverrideIntoSnapshot(explicitRPrFromRaw(rPr), props), props);
    const attachSnap = (run) => {
        (0, core_1.setOrigin)(run, { explicitRPr: explicit });
        return run;
    };
    // 按脚本拆分时，run.fontFamily 取的是「该脚本对应槽位」的字体（CJK→ea、拉丁→latin…），
    // 而 explicitRPrFromRaw 只记录 latin 槽位作为 fontFamily。两者对一个纯 CJK run 是
    // 「ea 字体 vs latin 字体」的错位比较，会让 serializer 的 runHasExplicitStyle 误判为
    // "字体被编辑" → 把原 `<a:latin typeface="-apple-system"/>` 覆写成解析出的 ea 字体
    // （7.pptx slide2 即此症状）。这里把快照里的 fontFamily 改成「该 run 实际解析出的
    // 首选字体」，未编辑时即可逐字相等 → 保留原始字节。
    const attachSnapFam = (run, fam) => {
        const first = firstTypefaceOf(fam);
        (0, core_1.setOrigin)(run, {
            explicitRPr: first ? { ...(explicit ?? {}), fontFamily: first } : (explicit ?? {}),
        });
        return run;
    };
    const faces = resolveTypefacesFromRpr(rPr, ctx);
    // 按脚本拆分 run：仅当 rPr 显式提供了脚本相关 typeface 槽位时才执行；否则保留原行为，
    // fontFamily 由上游样式继承（避免给纯纯继承的 run 加上多余的 fontFamily 覆盖）。
    if (!faces.hasExplicit || !text)
        return [attachSnap({ text, ...props })];
    const segments = splitTextByScript(text);
    if (segments.length === 1) {
        const fam = fontFamilyForScript(segments[0].script, faces, ctx);
        return [attachSnapFam({ ...props, ...(fam ? { fontFamily: fam } : {}), text }, fam)];
    }
    const out = [];
    for (const seg of segments) {
        if (!seg.text)
            continue;
        const fam = fontFamilyForScript(seg.script, faces, ctx);
        out.push(attachSnapFam({ ...props, ...(fam ? { fontFamily: fam } : {}), text: seg.text }, fam));
    }
    return out.length ? out : [attachSnap({ text, ...props })];
}
/**
 * 从 raw `<a:rPr>` 上抠出"显式存在"的字段，作为 round-trip 的 snapshot。
 * 与 readRunProps 区别：
 *   - 不读 ctx 继承（master / layout 默认）
 *   - 缺省的字段在 snapshot 里就是 undefined（区别于 readRunProps 把继承值塞进来）
 * 返回 undefined 表示 rPr 缺失或完全没有任何显式字段。
 */
/**
 * 把源 run 上的 origin（含 explicitRPr）拷到目标 run，用于继承 / fontRef 合并等 spread 场景，
 * 这些路径会丢失非可枚举的 __origin 字段。
 */
function preserveRPrSnapshot(target, source) {
    const snap = (0, core_1.getOrigin)(source)?.explicitRPr;
    if (snap !== undefined)
        (0, core_1.setOrigin)(target, { explicitRPr: snap });
    return target;
}
/** OOXML effectLst 子标签 → 内存 ShapeEffect.kind，便于 snapshot 与运行时比较。 */
function effectKindFromOoxml(tag) {
    if (!tag)
        return undefined;
    if (tag === "outerShdw")
        return "outer";
    if (tag === "innerShdw")
        return "inner";
    if (tag === "prstShdw")
        return "preset";
    return tag;
}
function explicitRPrFromRaw(rPr) {
    if (!rPr)
        return undefined;
    // 即使 rPr 上没有任何具体字段也返回 `{}`，与"完全没有 rPr"（undefined）相区分：
    //   - undefined：原始 raw 完全没写 rPr；写回时 serializer 可以按内存 run 自由
    //     发挥（从零构造 rPr）。
    //   - `{}`：原始 raw 有 rPr 但所有字段都来自继承；写回时不该把继承字段（如
    //     master 的 Calibri）显式塞进 rPr。
    const out = {};
    const latinFace = (0, xml_1.attr)((0, xml_1.findByLocalName)(rPr, "latin"), "typeface");
    if (latinFace)
        out.fontFamily = latinFace;
    const sz = (0, xml_1.attr)(rPr, "sz");
    if (sz) {
        const n = Number(sz);
        if (Number.isFinite(n))
            out.fontSize = (n / 100) * (96 / 72);
    }
    const b = (0, units_2.boolish)((0, xml_1.attr)(rPr, "b"));
    if (b !== undefined)
        out.fontWeight = b ? 700 : 400;
    const i = (0, units_2.boolish)((0, xml_1.attr)(rPr, "i"));
    if (i !== undefined)
        out.italic = i;
    // u 属性原值（如 "sng"）与 readRunProps 经 mapUnderline 转出的形态（"single"）
    // 不一致，snap 端要存 mapUnderline 转换后的形态才能与运行 run.underline 直接比较。
    const u = (0, xml_1.attr)(rPr, "u");
    if (u && u !== "none") {
        const mapped = mapUnderline(u);
        // 按 mapUnderline 归一后的**原始形态**存（string 或 boolean true）——
        // 之前 String(mapped) 会把 u="heavy" 这类未知枚举存成 "true"，与运行时
        // 字段 true 严格不等 → 未编辑的 run 被误判为编辑过而整段重写。
        if (mapped)
            out.underline = mapped;
    }
    const strike = (0, xml_1.attr)(rPr, "strike");
    if (strike === "dblStrike")
        out.strikethrough = "double";
    else if (strike === "sngStrike")
        out.strikethrough = "single";
    const cap = (0, xml_1.attr)(rPr, "cap");
    if (cap === "small" || cap === "all" || cap === "none")
        out.caps = cap;
    const spc = (0, xml_1.attr)(rPr, "spc");
    if (spc)
        out.letterSpacing = (0, units_1.stHundredthPtToPx)(spc);
    const highlight = (0, xml_1.findByLocalName)(rPr, "highlight");
    if (highlight) {
        const srgb = (0, xml_1.findByLocalName)(highlight, "srgbClr");
        const hex = (0, xml_1.attr)(srgb, "val");
        if (hex && /^[0-9a-fA-F]{6}$/.test(hex))
            out.highlight = "#" + hex.toLowerCase();
    }
    const ln = (0, xml_1.findByLocalName)(rPr, "ln");
    if (ln) {
        const width = Math.round((0, units_1.emuToPx)((0, xml_1.attr)(ln, "w")) * 1000) / 1000;
        const solid = (0, xml_1.findByLocalName)(ln, "solidFill");
        const srgb = solid ? (0, xml_1.findByLocalName)(solid, "srgbClr") : undefined;
        const hex = (0, xml_1.attr)(srgb, "val");
        const color = hex && /^[0-9a-fA-F]{6}$/.test(hex) ? "#" + hex.toLowerCase() : undefined;
        out.textOutline = { width, color };
    }
    const effectLst = (0, xml_1.findByLocalName)(rPr, "effectLst");
    if (effectLst) {
        const fx = [];
        for (const child of (0, xml_1.orderedChildren)(effectLst)) {
            const kind = effectKindFromOoxml((0, xml_1.stripNs)(child.tag));
            if (!kind)
                continue;
            const srgb = (0, xml_1.findByLocalName)(child.node, "srgbClr");
            const hex = (0, xml_1.attr)(srgb, "val");
            const color = hex && /^[0-9a-fA-F]{6}$/.test(hex) ? "#" + hex.toLowerCase() : undefined;
            fx.push(color ? { kind, color } : { kind });
        }
        if (fx.length)
            out.effects = fx;
    }
    // 颜色：只抓 srgbClr 的直接 hex（不解 schemeClr）。serializer 比较前会把 run.color
    // 也归一成 `#RRGGBB` 大写格式，匹配上即视为未编辑。
    const solidFill = (0, xml_1.findByLocalName)(rPr, "solidFill");
    if (solidFill) {
        const srgb = (0, xml_1.findByLocalName)(solidFill, "srgbClr");
        const hex = (0, xml_1.attr)(srgb, "val");
        if (hex && /^[0-9a-fA-F]{6}$/.test(hex)) {
            const a = (0, xml_1.attr)((0, xml_1.findByLocalName)(srgb, "alpha"), "val");
            const alphaNum = a ? Number(a) / 100000 : 1;
            if (alphaNum >= 1)
                out.color = "#" + hex.toLowerCase();
            else {
                const aHex = Math.round(alphaNum * 255).toString(16).padStart(2, "0");
                out.color = "#" + hex.toLowerCase() + aHex;
            }
        }
    }
    return out;
}
function readRunProps(rPr, ctx) {
    const out = {};
    const inherited = inheritedFontFamily(ctx);
    if (inherited)
        out.fontFamily = inherited;
    if (!rPr)
        return out;
    const sz = (0, xml_1.attr)(rPr, "sz");
    if (sz) {
        const n = Number(sz);
        if (Number.isFinite(n))
            out.fontSize = (n / 100) * (96 / 72);
    }
    const b = (0, units_2.boolish)((0, xml_1.attr)(rPr, "b"));
    if (b !== undefined)
        out.fontWeight = b ? 700 : 400;
    const i = (0, units_2.boolish)((0, xml_1.attr)(rPr, "i"));
    if (i !== undefined)
        out.italic = i;
    const u = (0, xml_1.attr)(rPr, "u");
    if (u && u !== "none") {
        out.underline = mapUnderline(u);
        const uFill = (0, xml_1.findByLocalName)(rPr, "uFill");
        const uFillSolid = uFill ? (0, xml_1.findByLocalName)(uFill, "solidFill") : undefined;
        if (uFillSolid) {
            const c = (0, theme_1.resolveColor)(uFillSolid, ctx.theme);
            if (c)
                out.underlineColor = c;
        }
        if ((0, xml_1.findByLocalName)(rPr, "uFillTx") || (0, xml_1.findByLocalName)(rPr, "uLnTx")) {
            out.underlineFollow = true;
        }
        const uLn = (0, xml_1.findByLocalName)(rPr, "uLn");
        if (uLn) {
            const fakeSpPr = { ln: uLn };
            Object.defineProperty(fakeSpPr, "$children", {
                value: [{ tag: "ln", node: uLn }],
                enumerable: false,
                configurable: true,
            });
            const stroke = (0, fill_1.resolveShapeStroke)(fakeSpPr, ctx, undefined);
            if (stroke)
                out.underlineStroke = stroke;
        }
    }
    const strike = (0, xml_1.attr)(rPr, "strike");
    if (strike && strike !== "noStrike") {
        out.strikethrough = strike === "dblStrike" ? "double" : "single";
    }
    const cap = (0, xml_1.attr)(rPr, "cap");
    if (cap === "small" || cap === "all" || cap === "none")
        out.caps = cap;
    const lang = (0, xml_1.attr)(rPr, "lang");
    if (lang)
        out.lang = lang;
    const altLang = (0, xml_1.attr)(rPr, "altLang");
    if (altLang)
        out.altLang = altLang;
    const kern = (0, xml_1.attr)(rPr, "kern");
    if (kern) {
        const n = Number(kern);
        if (Number.isFinite(n))
            out.kern = n;
    }
    const spc = (0, xml_1.attr)(rPr, "spc");
    if (spc)
        out.letterSpacing = (0, units_1.stHundredthPtToPx)(spc);
    const baseline = (0, xml_1.attr)(rPr, "baseline");
    if (baseline !== undefined) {
        const n = Number(baseline);
        if (Number.isFinite(n) && n !== 0)
            out.baseline = n / 100000;
    }
    const kumimoji = (0, units_2.boolish)((0, xml_1.attr)(rPr, "kumimoji"));
    if (kumimoji !== undefined)
        out.kumimoji = kumimoji;
    const normalizeH = (0, units_2.boolish)((0, xml_1.attr)(rPr, "normalizeH"));
    if (normalizeH !== undefined)
        out.normalizeH = normalizeH;
    const noProof = (0, units_2.boolish)((0, xml_1.attr)(rPr, "noProof"));
    if (noProof !== undefined)
        out.noProof = noProof;
    const dirty = (0, units_2.boolish)((0, xml_1.attr)(rPr, "dirty"));
    if (dirty !== undefined)
        out.dirty = dirty;
    const err = (0, units_2.boolish)((0, xml_1.attr)(rPr, "err"));
    if (err !== undefined)
        out.err = err;
    const smtClean = (0, units_2.boolish)((0, xml_1.attr)(rPr, "smtClean"));
    if (smtClean !== undefined)
        out.smtClean = smtClean;
    const smtId = (0, xml_1.attr)(rPr, "smtId");
    if (smtId !== undefined) {
        const n = Number(smtId);
        if (Number.isFinite(n))
            out.smtId = n;
    }
    const bmk = (0, xml_1.attr)(rPr, "bmk");
    if (bmk)
        out.bmk = bmk;
    // ECMA-376 §21.1.2.3.9 文本运行级 fill：solid/grad/blip/no — 优先记录到 fill；
    // 同时把纯色记到 color 字段，便于现有 CSS 样式直接渲染。
    const fill = (0, fill_1.parseFill)(rPr, { theme: ctx.theme, rels: ctx.rels, resolveImage: ctx.resolveImage });
    if (fill) {
        out.fill = fill;
        if (fill.kind === "solid")
            out.color = fill.color;
    }
    const highlight = (0, xml_1.findByLocalName)(rPr, "highlight");
    if (highlight) {
        const c = (0, theme_1.resolveColor)(highlight, ctx.theme);
        if (c)
            out.highlight = c;
    }
    // ECMA-376 §21.1.2.3.9 rPr/ln — 文字描边。
    const ln = (0, xml_1.findByLocalName)(rPr, "ln");
    if (ln) {
        const fakeSpPr = { ln };
        Object.defineProperty(fakeSpPr, "$children", {
            value: [{ tag: "ln", node: ln }],
            enumerable: false,
            configurable: true,
        });
        const stroke = (0, fill_1.resolveShapeStroke)(fakeSpPr, ctx, undefined);
        if (stroke)
            out.textOutline = stroke;
    }
    // ECMA-376 §21.1.2.3.9 rPr/effectLst — 文字阴影/发光等。
    if ((0, xml_1.findByLocalName)(rPr, "effectLst")) {
        const fakeSpPr = { effectLst: (0, xml_1.findByLocalName)(rPr, "effectLst") };
        Object.defineProperty(fakeSpPr, "$children", {
            value: [{ tag: "effectLst", node: (0, xml_1.findByLocalName)(rPr, "effectLst") }],
            enumerable: false,
            configurable: true,
        });
        const fx = (0, fill_1.parseEffectListFull)(fakeSpPr, ctx);
        if (fx.length)
            out.effects = fx;
    }
    const hlinkClick = (0, xml_1.findByLocalName)(rPr, "hlinkClick");
    if (hlinkClick) {
        const target = (0, xml_1.attr)(hlinkClick, "r:id") ?? (0, xml_1.attr)(hlinkClick, "id");
        const action = (0, xml_1.attr)(hlinkClick, "action");
        const resolved = parseHlinkNode(hlinkClick, ctx);
        if (resolved)
            out.hyperlink = resolved;
        // ECMA-376 §17.3.2.5 / DrawingML §21.1.2.3.5 — 当 rPr 含**真实**的 <a:hlinkClick> 时，
        // PowerPoint/WPS 的默认渲染会用主题 <a:hlink> 槽位色覆盖**任何** rPr 继承或显式色，
        // 并套单下划线。PowerPoint 在 UI 层不允许作者保留"原 solidFill + hyperlink"——
        // 一旦加上超链接，主题色直接接管；这是 ECMA-376 §17.3.2.5 描述的标准行为。
        // **例外 1**：rPr 显式 `<a:u val="none"/>` 时不强加下划线（作者明确关闭下划线）。
        // **例外 2（关键）**：`action="ppaction://noaction"` 且无 r:id 目标的是 PowerPoint 在
        // 形状 / 艺术字里塞的**占位空链接**，并非真正超链接 —— PowerPoint 不会给它换主题色，
        // 作者的显式 `<a:srgbClr>` 应原样保留。早先无差别覆盖会把这种 run 的 000000/FFFFFF
        // 改写成 hlink 蓝（quicktour slide9/10/11），既错误渲染又破坏 round-trip。
        const hasRealTarget = !!(target && target.length > 0);
        const hasRealAction = !!(action && mapAction(action) !== null);
        const isNoOpLink = !hasRealTarget && !hasRealAction;
        if (resolved && !isNoOpLink) {
            const uExplicit = (0, xml_1.attr)(rPr, "u");
            applyHyperlinkVisualOverride(out, ctx, uExplicit === "none");
        }
    }
    const hlinkMouseOver = (0, xml_1.findByLocalName)(rPr, "hlinkMouseOver");
    if (hlinkMouseOver) {
        const hover = parseHlinkNode(hlinkMouseOver, ctx);
        if (hover)
            out.hoverLink = hover;
    }
    // 默认场景的 fontFamily：当 rPr 显式给出脚本字体槽位时按 latin 顺序生成（与历史行为保持
    // 一致：默认样式、字段 / endParaRPr 之类没有具体文本可供脚本拆分的场景使用）。运行文本
    // 真正落地时由 parseRun 按脚本重新覆写为更精确的列表。
    const faces = resolveTypefacesFromRpr(rPr, ctx);
    if (faces.hasExplicit) {
        const families = cssFontFamily([
            faces.latin,
            faces.ea,
            faces.cs,
            faces.sym,
            ctx.defaultFontFamily,
            ...(ctx.embeddedFontFamilies ?? []),
        ]);
        if (families)
            out.fontFamily = families;
    }
    return out;
}
function mapUnderline(u) {
    switch (u) {
        case "sng":
        case "single":
            return "single";
        case "dbl":
        case "double":
            return "double";
        case "dotted":
        case "dottedHeavy":
            return "dotted";
        case "dash":
        case "dashHeavy":
        case "dashLong":
        case "dashLongHeavy":
            return "dashed";
        case "wavy":
        case "wavyHeavy":
        case "wavyDbl":
            return "wavy";
        default:
            return true;
    }
}
/**
 * 当 rPr 含 <a:hlinkClick> 时，应用 PowerPoint/WPS 默认的超链接视觉覆盖：
 * - 文本色：theme 的 hlink 槽位色，覆盖任何 rPr 继承 / 显式色；theme 缺失则用 Office 默认 #0563C1。
 * - 下划线：若 rPr 未显式 `<a:u val="none"/>`，则套用 single underline 并跟随文本色。
 */
function applyHyperlinkVisualOverride(out, ctx, suppressUnderline) {
    const themeHex = ctx.theme?.schemeColors.get("hlink");
    const color = "#" + (themeHex && /^[0-9A-Fa-f]{6}$/.test(themeHex) ? themeHex : "0563C1");
    out.color = color;
    out.fill = { kind: "solid", color };
    if (!suppressUnderline) {
        if (!out.underline)
            out.underline = "single";
        if (!out.underlineColor)
            out.underlineFollow = true;
    }
    // 这层视觉覆盖是**解析期合成**的（raw rPr 里并没有对应字节）。round-trip 的
    // explicitRPr 快照若不同步这份覆盖，serializer 会把「内存 hlink 蓝 + underline」vs
    // 「raw 原 solidFill / 无 u」误判为用户编辑，进而把原字节改写（quicktour slide9/10/11
    // 的 FFFFFF→hlink 蓝 / sng→single diff 即此因）。通过非可枚举临时字段把覆盖值带给
    // parseRun / fld 的快照构造方（spread 拷贝不会带走它）。
    Object.defineProperty(out, HLINK_VISUAL_KEY, {
        // underline 按运行时形态存（string / boolean true），与快照比较是严格等值。
        value: { color, underline: suppressUnderline ? undefined : (out.underline ?? "single") },
        enumerable: false,
        configurable: true,
    });
}
const HLINK_VISUAL_KEY = "__hlinkVisualOverride";
/**
 * 把 hlink 视觉覆盖（若有）合并进 explicitRPr 快照，使「未编辑的超链接 run」满足
 * `内存值 == 快照` → serializer 保留原始字节。color 归一为快照口径（#rrggbb 小写）。
 */
function mergeHlinkOverrideIntoSnapshot(snap, props) {
    const ov = props[HLINK_VISUAL_KEY];
    if (!ov)
        return snap;
    const out = { ...(snap ?? {}) };
    out.color = "#" + ov.color.replace(/^#/, "").toLowerCase();
    if (ov.underline)
        out.underline = ov.underline;
    return out;
}
/**
 * 把解析出的超链接记进快照。与 color / underline 覆盖同理：raw rPr 上确实写了
 * `<a:hlinkClick>` 时，内存 run 的 hyperlink 是"解析所得"而非"用户所加"，
 * serializer 必须能识别出未编辑，从而保留原始 r:id 字节。
 */
function mergeHyperlinkIntoSnapshot(snap, props) {
    if (!props.hyperlink && !props.hoverLink)
        return snap;
    const out = { ...(snap ?? {}) };
    if (props.hyperlink)
        out.hyperlink = hlinkSnapshot(props.hyperlink);
    if (props.hoverLink)
        out.hoverLink = hlinkSnapshot(props.hoverLink);
    return out;
}
function hlinkSnapshot(h) {
    return {
        kind: h.kind,
        target: h.target,
        sound: Boolean(h.sound?.name || h.sound?.src) || undefined,
        highlightClick: h.highlightClick || undefined,
        endSnd: h.endSnd || undefined,
    };
}
/** ECMA-376 CT_Hyperlink：shape / run 的 hlinkClick、hlinkHover、hlinkMouseOver。 */
function parseHlinkNode(node, ctx) {
    if (!node)
        return undefined;
    const rid = (0, xml_1.attr)(node, "r:id") ?? (0, xml_1.attr)(node, "id");
    const action = (0, xml_1.attr)(node, "action");
    const tooltip = (0, xml_1.attr)(node, "tooltip");
    const sound = parseHlinkSnd(node, ctx);
    const extras = parseHlinkExtras(node);
    const emptyRid = !rid;
    const withExtras = (h) => ({ ...h, ...extras });
    if (action) {
        const kind = mapAction(action);
        if (kind === "slide") {
            return withExtras({ kind, target: resolveSlideJumpTarget(rid, ctx), tooltip, action, sound });
        }
        if (kind)
            return withExtras({ kind, tooltip, action, sound });
    }
    if (!emptyRid && ctx.rels) {
        const resolved = ctx.rels.resolve(rid);
        return (0, core_1.sanitizeHyperlinkRef)(withExtras({ kind: "url", target: resolved ?? rid, tooltip, action: action ?? undefined, sound }));
    }
    if (!emptyRid)
        return (0, core_1.sanitizeHyperlinkRef)(withExtras({ kind: "url", target: rid, tooltip, action: action ?? undefined, sound }));
    if (sound)
        return withExtras({ kind: "sound", tooltip, action, sound });
    if (action)
        return withExtras({ kind: "url", tooltip, action, sound });
    return undefined;
}
/** ECMA-376 CT_Hyperlink 除 r:id / action / tooltip / snd 以外的属性。 */
function parseHlinkExtras(node) {
    const out = {};
    const hc = (0, units_2.boolish)((0, xml_1.attr)(node, "highlightClick"));
    if (hc)
        out.highlightClick = true;
    const es = (0, units_2.boolish)((0, xml_1.attr)(node, "endSnd"));
    if (es)
        out.endSnd = true;
    const frame = (0, xml_1.attr)(node, "tgtFrame");
    if (frame)
        out.tgtFrame = frame;
    const hist = (0, units_2.boolish)((0, xml_1.attr)(node, "history"));
    if (hist === false)
        out.history = false;
    const inv = (0, xml_1.attr)(node, "invalidUrl");
    if (inv)
        out.invalidUrl = inv;
    return out;
}
function parseHlinkSnd(node, ctx) {
    const snd = (0, xml_1.findByLocalName)(node, "snd");
    if (!snd)
        return undefined;
    const name = (0, xml_1.attr)(snd, "name");
    const rid = (0, xml_1.attr)(snd, "r:embed") ?? (0, xml_1.attr)(snd, "embed") ?? (0, xml_1.attr)(snd, "r:link") ?? (0, xml_1.attr)(snd, "link");
    let src;
    if (rid && ctx.rels) {
        const path = ctx.rels.resolve(rid);
        if (path) {
            src = /^https?:\/\//i.test(path) || /^file:/i.test(path) ? path : ctx.resolveImage?.(path);
        }
    }
    if (!name && !src)
        return undefined;
    return { ...(name ? { name } : {}), ...(src ? { src } : {}) };
}
/** `<a:hlinkClick r:id>` → 目标 slide 的 1-based 页码字符串（player / 编辑器对话框约定）。 */
function resolveSlideJumpTarget(rid, ctx) {
    if (!rid)
        return undefined;
    const partPath = ctx.rels?.resolve(rid);
    if (!partPath)
        return undefined;
    const n = ctx.resolveSlideNumber?.(partPath);
    return n !== undefined ? String(n) : undefined;
}
function mapAction(action) {
    const a = action.toLowerCase();
    // ECMA-376 §19.2.2.3 —「跳到指定页」是 hlinksldjump，目标页由 r:id 关系给出，
    // action 串里不含 jump=。必须先于下面的 jump= 分支匹配。
    if (a.includes("hlinksldjump"))
        return "slide";
    if (a.includes("nextslide"))
        return "next";
    if (a.includes("previousslide"))
        return "prev";
    if (a.includes("firstslide"))
        return "first";
    // "lastslideviewed" 内含 "lastslide"，必须先判，否则「返回上次查看」永远退化成「末页」。
    if (a.includes("lastslideviewed"))
        return "back";
    if (a.includes("lastslide"))
        return "last";
    if (a.includes("endshow"))
        return "endShow";
    if (a.includes("jump="))
        return "slide";
    return null;
}
function readLineHeight(pPr) {
    const ln = (0, xml_1.findByLocalName)(pPr, "lnSpc");
    if (!ln)
        return {};
    const pct = (0, xml_1.findByLocalName)(ln, "spcPct");
    if (pct) {
        const v = (0, xml_1.attr)(pct, "val");
        if (v)
            return { multiplier: Number(v) / 100000 };
    }
    const pts = (0, xml_1.findByLocalName)(ln, "spcPts");
    if (pts) {
        const v = (0, xml_1.attr)(pts, "val");
        if (v)
            return { absolutePx: (0, units_1.ptToPx)(Number(v) / 100) };
    }
    return {};
}
function readSpaceSpec(node) {
    if (!node)
        return undefined;
    const pts = (0, xml_1.findByLocalName)(node, "spcPts");
    if (pts) {
        const v = (0, xml_1.attr)(pts, "val");
        if (v)
            return (0, units_1.ptToPx)(Number(v) / 100);
    }
    return undefined;
}
function inheritedFontFamily(ctx) {
    const minor = ctx.theme?.fontMinorSet;
    return cssFontFamily([minor?.latin, minor?.ea, minor?.cs, minor?.sym, ctx.defaultFontFamily]);
}
function mapAlign(v) {
    switch (v) {
        case "ctr":
            return "middle";
        case "r":
            return "end";
        case "just":
        case "justLow":
            return "justify";
        case "l":
        default:
            return "start";
    }
}
