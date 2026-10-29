import { pickStyle } from "./tx-styles.js";
import { preserveRPrSnapshot } from "./text.js";
const TITLE_TYPES = new Set(["title", "ctrTitle"]);
const BODY_TYPES = new Set(["body", "subTitle", "obj"]);
function familyMatch(a, b) {
    if (a === b)
        return true;
    if (TITLE_TYPES.has(a) && TITLE_TYPES.has(b))
        return true;
    if (BODY_TYPES.has(a) && BODY_TYPES.has(b))
        return true;
    return false;
}
export function phMatch(a, b) {
    if (a.idx && b.idx)
        return a.idx === b.idx;
    if (a.type && b.type)
        return familyMatch(a.type, b.type);
    if (!a.type && !b.type && !a.idx && !b.idx)
        return true;
    return false;
}
export function indexPlaceholders(shapes) {
    const list = [];
    const walk = (s) => {
        if (s.placeholder)
            list.push(s);
        if (s.kind === "group")
            for (const c of s.children)
                walk(c);
    };
    for (const s of shapes)
        walk(s);
    return { list };
}
function findPhInLayer(target, layer) {
    for (const s of layer.list) {
        if (s.placeholder && phMatch(target, s.placeholder))
            return s;
    }
    return undefined;
}
function findTextChild(s) {
    if (s.kind === "text")
        return s;
    if (s.kind === "group") {
        for (const c of s.children) {
            const t = findTextChild(c);
            if (t)
                return t;
        }
    }
    return undefined;
}
function bboxEmpty(b) {
    return !b.w || !b.h;
}
function inheritBbox(out, source) {
    const bbox = out.bbox;
    if (bboxEmpty(bbox)) {
        return { ...out, bbox: { ...source.bbox } };
    }
    return out;
}
function inheritPaints(out, source) {
    let next = out;
    if (!next.fill && source.fill)
        next = { ...next, fill: source.fill };
    if (!next.stroke && source.stroke)
        next = { ...next, stroke: source.stroke };
    if (!next.shadow && source.shadow)
        next = { ...next, shadow: source.shadow };
    if (!next.effects && source.effects)
        next = { ...next, effects: source.effects };
    if (!next.styleRefs && source.styleRefs)
        next = { ...next, styleRefs: source.styleRefs };
    if (!next.hyperlink && source.hyperlink)
        next = { ...next, hyperlink: source.hyperlink };
    if (!next.hoverLink && source.hoverLink)
        next = { ...next, hoverLink: source.hoverLink };
    return next;
}
function mergeTextDefaults(target, src) {
    if (src.length === 0)
        return target;
    const srcP = src[0];
    const srcR = srcP.runs[0] ?? { text: "" };
    return target.map((p) => {
        const merged = { ...p };
        if (!merged.align && srcP.align)
            merged.align = srcP.align;
        if (merged.lineHeight === undefined && srcP.lineHeight !== undefined)
            merged.lineHeight = srcP.lineHeight;
        if (merged.lineHeightPx === undefined && srcP.lineHeightPx !== undefined)
            merged.lineHeightPx = srcP.lineHeightPx;
        merged.runs = p.runs.map((r) => preserveRPrSnapshot({
            ...r,
            fontFamily: r.fontFamily ?? srcR.fontFamily,
            fontSize: r.fontSize ?? srcR.fontSize,
            fontWeight: r.fontWeight ?? srcR.fontWeight,
            color: r.color ?? srcR.color,
            italic: r.italic ?? srcR.italic,
            underline: r.underline ?? srcR.underline,
        }, r));
        return merged;
    });
}
function inheritTextStyle(out, srcText) {
    const empty = !out.paragraphs.some((p) => p.runs.some((r) => r.text.trim() !== ""));
    let paragraphs = out.paragraphs;
    if (empty && srcText.paragraphs.length > 0) {
        paragraphs = srcText.paragraphs;
    }
    else {
        paragraphs = mergeTextDefaults(paragraphs, srcText.paragraphs);
    }
    // ECMA-376 §21.1.2.1.5 lstStyle 继承：layout / master 的占位 shape 上的 lstStyle
    // 是"形状级 9 级段落默认样式"，slide 的段落若未显式设置 algn / bullet / marL 等，
    // 应该走 layout.lstStyle 这条路径而不是 layer 占位段的 paragraph 属性。例如
    // slide1.xml Rectangle 3 (subTitle) 的 a:p 没有 algn 也没有 lstStyle，但 layout
    // 的 lstStyle/lvl1pPr 写了 algn="ctr" + buNone + marL="0"，必须从这里继承到
    // slide 段落才能得到 PowerPoint 同款的居中无 bullet 渲染。
    if (srcText.lstStyle && srcText.lstStyle.length > 0) {
        paragraphs = mergeParagraphsWithLstStyle(paragraphs, srcText.lstStyle);
    }
    return {
        ...out,
        paragraphs,
        vAlign: out.vAlign ?? srcText.vAlign,
        wrap: out.wrap ?? srcText.wrap,
        insets: out.insets ?? srcText.insets,
    };
}
function mergeParagraphsWithLstStyle(paragraphs, lstStyle) {
    return paragraphs.map((p) => mergeParagraphWithLstLevel(p, lstStyle));
}
function mergeParagraphWithLstLevel(p, lstStyle) {
    // §21.1.2.1.5: 段落 level 优先匹配 lvl{N}pPr（lstStyle 中 level==N+1，0 对应 defPPr），
    // 找不到时按最近一级 fallback。
    const wantLevel = (p.level ?? 0) + 1;
    let entry = lstStyle.find((e) => e.level === wantLevel);
    if (!entry)
        entry = lstStyle.find((e) => e.level === 0);
    if (!entry)
        entry = lstStyle[0];
    if (!entry)
        return p;
    const merged = { ...p };
    const pPr = entry.pPr;
    if (pPr) {
        if (merged.align === undefined && pPr.align !== undefined)
            merged.align = pPr.align;
        if (merged.lineHeight === undefined && pPr.lineHeight !== undefined)
            merged.lineHeight = pPr.lineHeight;
        if (merged.lineHeightPx === undefined && pPr.lineHeightPx !== undefined)
            merged.lineHeightPx = pPr.lineHeightPx;
        if (merged.spaceBeforePx === undefined && pPr.spaceBeforePx !== undefined)
            merged.spaceBeforePx = pPr.spaceBeforePx;
        if (merged.spaceAfterPx === undefined && pPr.spaceAfterPx !== undefined)
            merged.spaceAfterPx = pPr.spaceAfterPx;
        if (merged.indent === undefined && pPr.indent !== undefined)
            merged.indent = pPr.indent;
        if (merged.marginLeft === undefined && pPr.marginLeft !== undefined)
            merged.marginLeft = pPr.marginLeft;
        if (merged.marginRight === undefined && pPr.marginRight !== undefined)
            merged.marginRight = pPr.marginRight;
        if (merged.rtl === undefined && pPr.rtl !== undefined)
            merged.rtl = pPr.rtl;
        if (merged.fontAlign === undefined && pPr.fontAlign !== undefined)
            merged.fontAlign = pPr.fontAlign;
        if (merged.defTabSz === undefined && pPr.defTabSz !== undefined)
            merged.defTabSz = pPr.defTabSz;
        if (merged.tabStops === undefined && pPr.tabStops !== undefined)
            merged.tabStops = pPr.tabStops;
    }
    // bullet 字段：lstStyle.bullet 显式存在（含"无项目符号"语义）时必须覆盖段落
    // 默认 bullet——layout 的 buNone 不能被原段落沿用 master 的 bullet 掩盖。
    if (entry.bullet !== undefined && merged.bullet === undefined) {
        merged.bullet = entry.bullet;
    }
    const rPr = entry.rPr;
    if (rPr) {
        merged.runs = merged.runs.map((r) => preserveRPrSnapshot({
            ...r,
            fontFamily: r.fontFamily ?? rPr.fontFamily,
            fontSize: r.fontSize ?? rPr.fontSize,
            fontWeight: r.fontWeight ?? rPr.fontWeight,
            italic: r.italic ?? rPr.italic,
            underline: r.underline ?? rPr.underline,
            color: r.color ?? rPr.color,
        }, r));
    }
    return merged;
}
function applySingleSource(shape, source) {
    let out = shape;
    out = inheritBbox(out, source);
    out = inheritPaints(out, source);
    if (out.kind === "group") {
        const sourceText = findTextChild(source);
        const children = out.children.map((c) => {
            let next = inheritBbox(c, source);
            next = inheritPaints(next, source);
            if (next.kind === "text" && sourceText) {
                next = inheritTextStyle(next, sourceText);
            }
            return next;
        });
        out = { ...out, children };
    }
    else if (out.kind === "text") {
        const sourceText = findTextChild(source);
        if (sourceText)
            out = inheritTextStyle(out, sourceText);
    }
    return out;
}
// Convert pres.defaultTextStyle (TextStyles { body }) into a 9-element LevelStyle[]
// indexed 0..8 corresponding to lvl1pPr..lvl9pPr — same indexing convention that
// master.txStyles → tx-styles.ts uses. parseDefaultTextStyle 输出的 body 是
// `[defPPr, lvl1, ..., lvl9]`，去掉首位 defPPr 即对齐索引。
function presDefaultsToLevels(ts) {
    if (!ts || !ts.body || ts.body.length <= 1)
        return [];
    return ts.body.slice(1).map((spec) => ({
        pPr: { ...(spec.pPr ?? {}) },
        rPr: { ...(spec.rPr ?? {}) },
        bullet: spec.bullet,
    }));
}
export function applyInheritance(slideShapes, layers, opts = {}) {
    const presLevels = presDefaultsToLevels(opts.presDefaultTextStyle);
    // ECMA-376 区分两种 non-placeholder 文本来源：
    //   1) cNvSpPr@txBox=1（插入文本框）：缺省走 presentation.xml/defaultTextStyle/lvl1pPr/defRPr
    //   2) prstGeom/customGeom 自动图形里的文字：缺省走 sldMaster/txStyles/otherStyle/lvl1pPr/defRPr
    // 必须把"非占位文本默认"应用到 **text shape 本身**（而不是它的祖先 group），否则祖先
    // grpSp 容器先吃掉 master.otherStyle 默认值，再到子级 textbox 时 fontSize 已被填上，
    // ?? 短路就会让 textbox 拿不到 presentation 默认值（quicktour slide11 的链接 textbox 即此 case）。
    const walkText = (t) => {
        const isTxBox = t.txBox === true;
        if (isTxBox && presLevels.length)
            return applyLevelsToText(t, presLevels);
        if (opts.masterTxStyles) {
            return applyTxStylesToText(t, { type: "other" }, opts.masterTxStyles);
        }
        return t;
    };
    const walk = (s) => {
        let out = s;
        const ph = out.placeholder;
        if (ph) {
            for (const layer of layers) {
                const src = findPhInLayer(ph, layer);
                if (src)
                    out = applySingleSource(out, src);
            }
            if (opts.masterTxStyles) {
                out = applyTxStylesToShape(out, ph, opts.masterTxStyles);
            }
        }
        else if (out.kind === "text") {
            out = walkText(out);
        }
        if (out.kind === "group") {
            out = {
                ...out,
                children: out.children.map((c) => {
                    // 不向 placeholder 子节点强行注入 non-placeholder 默认 —— 让 walk 自己决定。
                    // 对未带 placeholder 的子 text shape，直接按 txBox/otherStyle 规则补默认。
                    if (c.kind === "text" && !c.placeholder)
                        return walkText(c);
                    return walk(c);
                }),
            };
        }
        return out;
    };
    return slideShapes.map((s) => fillDefaultFontSize(walk(s)));
}
// schema 未规定 sz 缺省。继承链都省略时按 Office 的 18pt 补上，
// 不写入 explicitRPr，导出仍省略 sz。
const OFFICE_DEFAULT_FONT_PX = (1800 / 100) * (96 / 72);
function fillDefaultFontSize(s) {
    if (s.kind === "text")
        return fillTextFontSize(s);
    if (s.kind === "group") {
        return { ...s, children: s.children.map(fillDefaultFontSize) };
    }
    return s;
}
function fillTextFontSize(t) {
    let changed = false;
    const paragraphs = t.paragraphs.map((p) => {
        const runs = p.runs.map((r) => {
            if (r.fontSize != null)
                return r;
            changed = true;
            return preserveRPrSnapshot({ ...r, fontSize: OFFICE_DEFAULT_FONT_PX }, r);
        });
        return { ...p, runs };
    });
    return changed ? { ...t, paragraphs } : t;
}
function applyLevelsToText(s, levels) {
    if (!levels.length)
        return s;
    const paragraphs = s.paragraphs.map((p) => mergeParagraphWithLevel(p, levels));
    return { ...s, paragraphs };
}
function applyTxStylesToShape(s, ph, styles) {
    if (s.kind === "text")
        return applyTxStylesToText(s, ph, styles);
    if (s.kind === "group") {
        const children = s.children.map((c) => c.kind === "text"
            ? applyTxStylesToText(c, ph, styles)
            : c.kind === "group"
                ? applyTxStylesToShape(c, ph, styles)
                : c);
        return { ...s, children };
    }
    return s;
}
function applyTxStylesToText(s, ph, styles) {
    const levels = pickStyle(styles, ph.type);
    if (!levels.length)
        return s;
    const paragraphs = s.paragraphs.map((p) => mergeParagraphWithLevel(p, levels));
    return { ...s, paragraphs };
}
function mergeParagraphWithLevel(p, levels) {
    const lvl = Math.min(Math.max(p.level ?? 0, 0), Math.max(0, levels.length - 1));
    const def = levels[lvl];
    if (!def)
        return p;
    const merged = { ...p };
    if (merged.align === undefined && def.pPr.align !== undefined)
        merged.align = def.pPr.align;
    if (merged.lineHeight === undefined && def.pPr.lineHeight !== undefined)
        merged.lineHeight = def.pPr.lineHeight;
    if (merged.lineHeightPx === undefined && def.pPr.lineHeightPx !== undefined)
        merged.lineHeightPx = def.pPr.lineHeightPx;
    if (merged.spaceBeforePx === undefined && def.pPr.spaceBeforePx !== undefined)
        merged.spaceBeforePx = def.pPr.spaceBeforePx;
    if (merged.spaceAfterPx === undefined && def.pPr.spaceAfterPx !== undefined)
        merged.spaceAfterPx = def.pPr.spaceAfterPx;
    if (merged.indent === undefined && def.pPr.indent !== undefined)
        merged.indent = def.pPr.indent;
    if (merged.marginLeft === undefined && def.pPr.marginLeft !== undefined)
        merged.marginLeft = def.pPr.marginLeft;
    if (merged.bullet === undefined && def.bullet)
        merged.bullet = def.bullet;
    merged.runs = merged.runs.map((r) => mergeRunDefaults(r, def.rPr));
    return merged;
}
function mergeRunDefaults(r, def) {
    return preserveRPrSnapshot({
        ...r,
        fontFamily: r.fontFamily ?? def.fontFamily,
        fontSize: r.fontSize ?? def.fontSize,
        fontWeight: r.fontWeight ?? def.fontWeight,
        italic: r.italic ?? def.italic,
        underline: r.underline ?? def.underline,
        color: r.color ?? def.color,
    }, r);
}
export function nonPlaceholderShapes(shapes) {
    return shapes.filter((s) => !s.placeholder);
}
// ECMA-376 §21.1.2.1.1 bodyPr/normAutofit — PowerPoint 在创作期会按"文本能否塞入框"
// 自动缩小字号并压缩行距。保存的 pptx 把缩放比已经 baked 进 `normAutofit/@fontScale`
// 与 `@lnSpcReduction`：
//   - fontScale=90000 表示 90%（0.9 倍）
//   - lnSpcReduction=20000 表示行距压缩 20%（lineHeight × 0.8）
// 实际渲染时直接把比例乘到每个 run 的 fontSize、每个段落的 lineHeight 上即可，
// renderer 不需要再单独感知 autoFit。spAutoFit / noAutofit 不需要在这里处理：前者
// 形状 bbox 已经在文件里被作者按文字 fit 好（保持原 bbox 即可），后者表示完全不
// autofit。
export function applyAutoFit(shapes) {
    const transformText = (t) => {
        const af = t.autoFit;
        if (!af || af.kind !== "normAutofit")
            return t;
        const fs = af.fontScale ?? 1;
        const ls = af.lnSpcReduction ?? 0;
        if (fs === 1 && ls === 0)
            return t;
        const lhMul = Math.max(0, 1 - ls);
        // ECMA-376 §21.1.2.1.1 normAutofit/@lnSpcReduction — 按比例缩减 **段落的**
        // 行距。如果段落没显式 lnSpc/spcPct（lineHeight=undefined），渲染器会落到
        // 内置默认（1.0 multiplier，见 renderer 行高表达式）；此时同样要把 reduction
        // 落到段落上，否则 fontScale 缩小后行间余白原样保留 → autoFit 失效。
        // 注意：fontSize 缩放下，"按 fontSize 倍率"的行高（lineHeight 是 multiplier）
        // 已经隐式跟随 fontSize 缩小，这里再乘 lhMul 仅表示 spc reduction 部分。
        const paragraphs = t.paragraphs.map((p) => ({
            ...p,
            lineHeight: p.lineHeight !== undefined
                ? p.lineHeight * lhMul
                : ls > 0
                    ? lhMul
                    : p.lineHeight,
            lineHeightPx: p.lineHeightPx !== undefined ? p.lineHeightPx * lhMul : p.lineHeightPx,
            spaceBeforePx: p.spaceBeforePx !== undefined ? p.spaceBeforePx * lhMul : p.spaceBeforePx,
            spaceAfterPx: p.spaceAfterPx !== undefined ? p.spaceAfterPx * lhMul : p.spaceAfterPx,
            runs: p.runs.map((r) => preserveRPrSnapshot({
                ...r,
                fontSize: r.fontSize !== undefined ? r.fontSize * fs : r.fontSize,
            }, r)),
        }));
        return { ...t, paragraphs };
    };
    const walk = (s) => {
        if (s.kind === "text")
            return transformText(s);
        if (s.kind === "group") {
            return { ...s, children: s.children.map(walk) };
        }
        return s;
    };
    return shapes.map(walk);
}
