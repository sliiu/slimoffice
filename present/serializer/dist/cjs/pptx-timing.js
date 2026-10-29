"use strict";
// OoxmlTiming → XML 序列化（ECMA-376 §19.5）。
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeTransition = serializeTransition;
exports.serializeTiming = serializeTiming;
exports.remapTimingSpids = remapTimingSpids;
exports.mergeMediaTiming = mergeMediaTiming;
const animation_1 = require("@sliiu/present-animation");
const core_1 = require("@sliiu/present-core");
const media_table_1 = require("./media-table");
const pptx_timing_normalize_1 = require("./pptx-timing-normalize");
const xml_util_1 = require("./xml-util");
// 由 OOXML 标定常量推导 spd 三档的判定边界 — 即 fast/med 与 med/slow 的中点。
// 这样 dur ↔ spd 互推时不引入任何启发式幻数。
const SPD_FAST_MED_BOUNDARY = (core_1.TRANSITION_SPEED_TO_SEC.fast + core_1.TRANSITION_SPEED_TO_SEC.med) / 2;
const SPD_MED_SLOW_BOUNDARY = (core_1.TRANSITION_SPEED_TO_SEC.med + core_1.TRANSITION_SPEED_TO_SEC.slow) / 2;
// ECMA-376 §19.5.50 p:transition — slide 级过渡。与 @sliiu/present-parser parseSlideTransition 对称。
//
// 写盘形状对齐 PowerPoint 自己的输出（[MS-PPTX] §2.3 Slide Transitions）：
//   - ECMA 2006 的 21 种 prst 直接写 <p:KIND/>；
//   - PowerPoint 2010 新增的（vortex / ripple / prism …）是 p14 命名空间元素，2013 新增的
//     （airplane / origami / curtains …）是 <p15:prstTrans prst=…/>，Morph 是 <p159:morph/>；
//   - 精确毫秒时长是 p14:dur，不是 p 命名空间的属性；
//   - 只要用到任何 p14 / p15 / p159 内容，就必须包成 mc:AlternateContent：Choice Requires=前缀，
//     Fallback 给 ECMA 版本（扩展类型回退 fade，ECMA 类型去掉 dur 原样写）。
// 之前"扩展类型直接写 <p:KIND/> PowerPoint 会容忍"是错的：p 命名空间下未知元素 / 属性触发修复，
// 整页 transition 被丢弃；schema 校验（xmllint + ISO 29500-4 XSD）能直接抓到。
function serializeTransition(t, media) {
    if (!t)
        return "";
    const params = t.params ?? {};
    const baseAttrs = {};
    let durMs;
    // spd 与 dur：duration > 0 时写 spd（老版本回退）+ p14:dur（精确 ms）。
    // duration === 0 时（cut / 显式 0），只写 dur="0"，spd 在此场景无意义。
    // 边界值由 ECMA-376 §19.5.50 标定的三档秒数（fast=0.5/med=0.75/slow=1.25）取中点推导。
    if (Number.isFinite(t.duration) && t.duration > 0) {
        baseAttrs.spd =
            t.duration < SPD_FAST_MED_BOUNDARY ? "fast"
                : t.duration >= SPD_MED_SLOW_BOUNDARY ? "slow"
                    : "med";
        durMs = Math.round(t.duration * 1000);
    }
    else if (t.duration === 0) {
        durMs = 0;
    }
    // advClick / advTm：parseSlideTransition 仅在源 XML 显式带 attr 时写入 params。
    // 因此这里也只在 params 显式存在时反向写出，避免来回对比噪声。
    const advClickRaw = params.advClick;
    const advAfterRaw = params.advAfter;
    if (advClickRaw === true)
        baseAttrs.advClick = 1;
    else if (advClickRaw === false)
        baseAttrs.advClick = 0;
    if (typeof advAfterRaw === "number" && advAfterRaw >= 0) {
        baseAttrs.advTm = Math.round(advAfterRaw * 1000);
    }
    const sndAc = buildSndAc(params.sound, media);
    const elKind = ECMA_ELEMENT_BY_KIND[t.kind] ?? t.kind;
    const family = transitionFamily(elKind);
    const ecmaInner = family === "ecma" && ECMA_TRANSITION_KINDS.has(elKind) ? buildInnerTransition(elKind, params) : "<p:fade/>";
    // 纯 ECMA 且不需要精确时长：一行 <p:transition>，与 PowerPoint 只选速度档时的输出一致。
    if (family === "ecma" && durMs === undefined) {
        return `<p:transition${(0, xml_util_1.attrs)(baseAttrs)}>${ecmaInner}${sndAc}</p:transition>`;
    }
    const requires = family === "ecma" ? "p14" : family;
    const choiceAttrs = { ...baseAttrs };
    if (durMs !== undefined)
        choiceAttrs["p14:dur"] = durMs;
    const choiceInner = family === "ecma" ? ecmaInner : buildExtTransition(family, elKind, params);
    return `<mc:AlternateContent xmlns:mc="${NS_MC}" xmlns:p14="${NS_P14}"><mc:Choice Requires="${requires}"${requires === "p15" ? ` xmlns:p15="${NS_P15}"` : requires === "p159" ? ` xmlns:p159="${NS_P159}"` : ""}><p:transition${(0, xml_util_1.attrs)(choiceAttrs)}>${choiceInner}${sndAc}</p:transition></mc:Choice><mc:Fallback><p:transition${(0, xml_util_1.attrs)(baseAttrs)}>${ecmaInner}${sndAc}</p:transition></mc:Fallback></mc:AlternateContent>`;
}
const NS_MC = "http://schemas.openxmlformats.org/markup-compatibility/2006";
const NS_P14 = "http://schemas.microsoft.com/office/powerpoint/2010/main";
const NS_P15 = "http://schemas.microsoft.com/office/powerpoint/2012/main";
const NS_P159 = "http://schemas.microsoft.com/office/powerpoint/2015/09/main";
// ISO 29500 pml.xsd CT_SlideTransition 的 choice 成员。
const ECMA_TRANSITION_KINDS = new Set([
    "blinds", "checker", "circle", "dissolve", "comb", "cover", "cut", "diamond", "fade", "newsflash", "plus",
    "pull", "push", "random", "randomBar", "split", "strips", "wedge", "wheel", "wipe", "zoom",
]);
// 编辑器 kind 与 ECMA 元素名不同的情况：PowerPoint「揭开」写盘是 <p:pull>。
const ECMA_ELEMENT_BY_KIND = { uncover: "pull" };
// CT_OrientationTransition 与 p14 doors / window 用 dir="horz|vert" 写横竖；只有 split 有 orient 属性。
const ORIENT_AS_DIR_KINDS = new Set(["blinds", "checker", "comb", "randomBar", "doors", "window"]);
// [MS-PPTX] §2.3.1：p14 命名空间下的 transition 元素（PowerPoint 2010）。
const P14_TRANSITION_KINDS = new Set([
    "vortex", "switch", "flip", "ripple", "honeycomb", "prism", "doors", "window", "ferris", "gallery",
    "conveyor", "pan", "glitter", "warp", "flythrough", "flash", "shred", "reveal", "wheelReverse",
]);
// 编辑器 / transition-fx 里的 3D 系列在 OOXML 中都是 p14:prism 的变体（isContent / isInverted 组合）。
const P14_PRISM_VARIANTS = {
    cube: {},
    box: { isInverted: true },
    rotate: { isContent: true },
    orbit: { isContent: true, isInverted: true },
};
// [MS-PPTX] §2.3.1.x p15:prstTrans@prst 取值（PowerPoint 2013）。
const P15_PRST_TRANS = {
    fall: "fallOver", fallOver: "fallOver", drape: "drape", curtains: "curtains", wind: "wind", prestige: "prestige",
    fracture: "fracture", crush: "crush", peelOff: "peelOff", pageCurl: "pageCurlDouble",
    pageCurlDouble: "pageCurlDouble", pageCurlSingle: "pageCurlSingle", airplane: "airplane", origami: "origami",
};
function transitionFamily(kind) {
    if (ECMA_TRANSITION_KINDS.has(kind))
        return "ecma";
    if (P14_TRANSITION_KINDS.has(kind) || kind in P14_PRISM_VARIANTS)
        return "p14";
    if (kind in P15_PRST_TRANS)
        return "p15";
    if (kind === "morph")
        return "p159";
    // 未知类型：Choice 与 Fallback 都退成 fade，比写一个 p 命名空间下的未知元素安全。
    return "ecma";
}
function buildExtTransition(family, kind, params) {
    if (family === "p159") {
        const opt = params?.option ? ` option="${escXml(String(params.option))}"` : "";
        return `<p159:morph${opt}/>`;
    }
    if (family === "p15") {
        // CT_PresetTransition 用 invX / invY 表示方向（与 parser 对称），没有 dir 属性。
        const inv = {};
        if (params?.dir === "right")
            inv.invX = 1;
        else if (params?.dir === "down")
            inv.invY = 1;
        return `<p15:prstTrans prst="${P15_PRST_TRANS[kind] ?? kind}"${(0, xml_util_1.attrs)(inv)}/>`;
    }
    const a = {};
    if (params?.dir)
        a.dir = normalizeDirOut(String(params.dir));
    if (params?.orient && ORIENT_AS_DIR_KINDS.has(kind))
        a.dir = String(params.orient);
    if (params?.pattern)
        a.pattern = String(params.pattern);
    if (params?.thruBlk)
        a.thruBlk = 1;
    const prism = P14_PRISM_VARIANTS[kind];
    if (prism || kind === "prism") {
        const isContent = prism?.isContent ?? params?.isContent === true;
        const isInverted = prism?.isInverted ?? params?.isInverted === true;
        if (isContent)
            a.isContent = 1;
        if (isInverted)
            a.isInverted = 1;
        return `<p14:prism${(0, xml_util_1.attrs)(a)}/>`;
    }
    return `<p14:${kind}${(0, xml_util_1.attrs)(a)}/>`;
}
// 与 parser/transition.ts KIND_TABLE 对称：dir/orient/pattern/thruBlk 反向序列化为 OOXML 属性名。
//
// ECMA-376 §19.5 各 transition 元素的属性名不完全一致，例如：
//   - CT_WheelTransition 使用 spokes（unsignedInt），不是 pattern；
//   - CT_TransitionGlitter 使用 pattern（hexagon/diamond）；
//   - CT_OrientationTransition (blinds/checker/randomBar/comb) 使用 dir="horz|vert"。
// parser 把这些都规约到一个 params.pattern / params.orient 字段，序列化时按 kind 派发到正确的 OOXML 属性。
function buildInnerTransition(kind, params) {
    if (kind === "cut") {
        const a = {};
        if (params?.thruBlk)
            a.thruBlk = 1;
        return `<p:cut${(0, xml_util_1.attrs)(a)}/>`;
    }
    if (kind === "fade") {
        const a = {};
        if (params?.thruBlk)
            a.thruBlk = 1;
        return `<p:fade${(0, xml_util_1.attrs)(a)}/>`;
    }
    const a = {};
    if (params?.dir)
        a.dir = normalizeDirOut(String(params.dir));
    if (params?.orient) {
        if (ORIENT_AS_DIR_KINDS.has(kind))
            a.dir = String(params.orient);
        else
            a.orient = String(params.orient);
    }
    if (params?.pattern) {
        const attrName = PATTERN_ATTR_BY_KIND[kind] ?? "pattern";
        a[attrName] = String(params.pattern);
    }
    if (params?.thruBlk)
        a.thruBlk = 1;
    return `<p:${kind}${(0, xml_util_1.attrs)(a)}/>`;
}
// CT_WheelTransition 的 spokes（unsignedInt）— OOXML §19.5.51。其余 prst（glitter/shred/...）
// 默认走 pattern。新增 prst 时只在此表里登记差异即可，不动主路径。
const PATTERN_ATTR_BY_KIND = {
    wheel: "spokes",
    wheelReverse: "spokes",
};
// ECMA-376 §19.5.49 sndAc / §19.5.48 stSnd — slide 进入时播放声音。
function buildSndAc(sound, media) {
    if (!sound || typeof sound !== "object")
        return "";
    const s = sound;
    if (!s.src)
        return "";
    let src = s.src;
    if (media && !/^rId\d+/i.test(src) && (src.startsWith("data:") || src.startsWith("blob:"))) {
        src = media.registerRel(src, media_table_1.REL_TYPE_AUDIO);
    }
    const isRid = /^rId\d+/i.test(src);
    const attrPairs = {
        "r:embed": isRid ? src : undefined,
        "r:link": isRid ? undefined : src,
    };
    const loop = s.loop ? ` loop="1"` : "";
    return `<p:sndAc><p:stSnd${loop}><p:snd${(0, xml_util_1.attrs)(attrPairs)}/></p:stSnd></p:sndAc>`;
}
// 反向方向归一化：parseSlideTransition.normalizeDir 的逆映射。
function normalizeDirOut(d) {
    switch (d) {
        case "left": return "l";
        case "right": return "r";
        case "up": return "u";
        case "down": return "d";
        // ST_TransitionCornerDirectionType：lu / ru / ld / rd。
        case "topLeft": return "lu";
        case "topRight": return "ru";
        case "bottomLeft": return "ld";
        case "bottomRight": return "rd";
        default: return d;
    }
}
function serializeTiming(timing, media) {
    if (!timing)
        return "";
    const prev = activeTimingMedia;
    activeTimingMedia = media;
    try {
        // 内存树是编辑器视角（包装 par + cTn.delay）；写盘前整理成 PowerPoint 读得懂的三层结构。
        const canonical = (0, pptx_timing_normalize_1.normalizeTimingForOoxml)(timing);
        const tnLst = canonical.tnLst.map(nodeToXml).join("");
        const bldLst = (canonical.bldLst ?? []).map(bldToXml).join("");
        return `<p:timing><p:tnLst>${tnLst}</p:tnLst>${bldLst ? `<p:bldLst>${bldLst}</p:bldLst>` : ""}</p:timing>`;
    }
    finally {
        activeTimingMedia = prev;
    }
}
/**
 * 把时序里的 spid 改成这次写出的 `cNvPr@id`。
 *
 * 编辑器 / 播放器用 `sp_${spid}` 找回 shape.id（`sp_7`、`sp_dg_…`、`sp_edit_…` 都成立）。
 * OOXML 的 `spid` 必须是同一 part 里的数字 `cNvPr@id`。`sp_<数字>` 两边一致；
 * 其余 id 在写盘时会被分配一个新数字，不改写的话 PowerPoint 对不上形状，动画落空或打到别的形状上。
 * 只改序列化用的副本，内存里的逻辑 spid 保持不动。
 */
function remapTimingSpids(timing, spIdByShapeId) {
    if (!timing || !spIdByShapeId?.size)
        return timing;
    const toWritten = new Map();
    for (const [shapeId, num] of spIdByShapeId) {
        if (!Number.isFinite(num))
            continue;
        const written = String(num);
        const keys = shapeId.startsWith("sp_") ? [shapeId, shapeId.slice(3)] : [shapeId];
        for (const key of keys) {
            if (key !== written)
                toWritten.set(key, written);
        }
    }
    if (toWritten.size === 0)
        return timing;
    const copy = structuredClone(timing);
    for (const n of copy.tnLst)
        rewriteTimeNodeSpids(n, toWritten);
    for (const b of copy.bldLst ?? []) {
        b.spid = toWritten.get(b.spid) ?? b.spid;
        if (b.kind === "bldP") {
            for (const tmpl of b.tmplLst ?? []) {
                for (const n of tmpl.tnLst ?? [])
                    rewriteTimeNodeSpids(n, toWritten);
            }
        }
    }
    return copy;
}
function rewriteTimeNodeSpids(n, toWritten) {
    if (n.kind === "seq") {
        rewriteCondSpids(n.prevCondLst, toWritten);
        rewriteCondSpids(n.nextCondLst, toWritten);
    }
    const ctn = animation_1.ooxml.getCTn(n);
    rewriteCondSpids(ctn.stCondLst, toWritten);
    rewriteCondSpids(ctn.endCondLst, toWritten);
    if (ctn.endSync)
        rewriteTgtSpids(ctn.endSync.tgtEl, toWritten);
    rewriteTgtSpids(animation_1.ooxml.getTgtEl(n), toWritten);
    for (const ch of ctn.childTnLst ?? [])
        rewriteTimeNodeSpids(ch, toWritten);
    for (const ch of ctn.subTnLst ?? [])
        rewriteTimeNodeSpids(ch, toWritten);
}
function rewriteCondSpids(conds, toWritten) {
    if (!conds)
        return;
    for (const c of conds)
        rewriteTgtSpids(c.tgtEl, toWritten);
}
function rewriteTgtSpids(t, toWritten) {
    if (!t)
        return;
    if (t.inkTgt)
        t.inkTgt = toWritten.get(t.inkTgt) ?? t.inkTgt;
    if (!t.spTgt)
        return;
    t.spTgt.spid = toWritten.get(t.spTgt.spid) ?? t.spTgt.spid;
    if (t.spTgt.subSpId)
        t.spTgt.subSpId = toWritten.get(t.spTgt.subSpId) ?? t.spTgt.subSpId;
}
let activeTimingMedia;
function nodeToXml(n) {
    switch (n.kind) {
        case "par":
            return `<p:par>${ctnToXml(n.ctn)}</p:par>`;
        case "seq":
            return `<p:seq${(0, xml_util_1.attrs)({ concurrent: boolAttr(n.concurrent), nextAc: n.nextAc, prevAc: n.prevAc })}>${ctnToXml(n.ctn)}${condLstXml("prevCondLst", n.prevCondLst)}${condLstXml("nextCondLst", n.nextCondLst)}</p:seq>`;
        case "excl":
            return `<p:excl>${ctnToXml(n.ctn)}</p:excl>`;
        case "set":
            return `<p:set>${cBhvrToXml(n.cBhvr)}${animValElem("to", n.to)}</p:set>`;
        case "anim":
            return `<p:anim${(0, xml_util_1.attrs)({
                by: n.by,
                from: n.from,
                to: n.to,
                calcmode: n.calcMode,
                valueType: n.valueType,
            })}>${cBhvrToXml(n.cBhvr)}${tavLstXml(n.tavLst)}</p:anim>`;
        case "animClr":
            return `<p:animClr${(0, xml_util_1.attrs)({
                clrSpc: n.clrSpc,
                dir: n.dir,
            })}>${cBhvrToXml(n.cBhvr)}${colorBySlot(n.by)}${animClrSlot("from", n.from)}${animClrSlot("to", n.to)}</p:animClr>`;
        case "animEffect":
            return `<p:animEffect${(0, xml_util_1.attrs)({
                transition: n.transition,
                filter: n.filter,
                prLst: n.prLst,
            })}>${cBhvrToXml(n.cBhvr)}${n.progress !== undefined ? animValElem("progress", { kind: "flt", val: n.progress }) : ""}</p:animEffect>`;
        case "animMotion":
            return `<p:animMotion${(0, xml_util_1.attrs)({
                origin: n.origin,
                path: n.path,
                pathEditMode: n.pathEditMode,
                rAng: n.rAng,
                ptsTypes: n.ptsTypes,
            })}>${cBhvrToXml(n.cBhvr)}${animPointElem("by", n.by)}${animPointElem("from", n.from)}${animPointElem("to", n.to)}${n.rCtr ? `<p:rCtr x="${n.rCtr.x}" y="${n.rCtr.y}"/>` : ""}</p:animMotion>`;
        case "animRot":
            return `<p:animRot${(0, xml_util_1.attrs)({ by: n.by, from: n.from, to: n.to })}>${cBhvrToXml(n.cBhvr)}</p:animRot>`;
        case "animScale":
            return `<p:animScale${(0, xml_util_1.attrs)({ zoomContents: boolAttr(n.zoomContents) })}>${cBhvrToXml(n.cBhvr)}${animPointElem("by", n.by)}${animPointElem("from", n.from)}${animPointElem("to", n.to)}</p:animScale>`;
        case "cmd":
            return `<p:cmd${(0, xml_util_1.attrs)({ type: n.type, cmd: n.cmd })}>${cBhvrToXml(n.cBhvr)}</p:cmd>`;
        case "audio":
            return `<p:audio${(0, xml_util_1.attrs)({ isNarration: boolAttr(n.isNarration) })}>${cMediaNodeToXml(n.cMediaNode)}</p:audio>`;
        case "video":
            return `<p:video${(0, xml_util_1.attrs)({ fullScrn: boolAttr(n.fullScrn) })}>${cMediaNodeToXml(n.cMediaNode)}</p:video>`;
    }
}
function ctnToXml(c) {
    const a = {
        id: c.id,
        presetID: c.presetID,
        presetClass: c.presetClass,
        presetSubtype: c.presetSubtype,
        presetVersion: c.presetVersion,
        // §19.5.18 CT_TLCommonTimeNodeData 没有 delay 属性：内存里的 cTn.delay 由
        // normalizeTimingForOoxml 搬进 stCondLst/cond@delay，这里绝不直出。
        dur: c.dur === "indefinite" ? "indefinite" : c.dur,
        repeatCount: c.repeatCount,
        repeatDur: c.repeatDur === "indefinite" ? "indefinite" : c.repeatDur,
        // §19.5.18 spd / tmFilter：原值直出（parser 端就以字符串保留）。
        spd: c.spd,
        tmFilter: c.tmFilter,
        accel: c.accel,
        decel: c.decel,
        autoRev: boolAttr(c.autoRev),
        restart: c.restart,
        fill: c.fill,
        syncBehavior: c.syncBehavior,
        evtFilter: c.evtFilter,
        display: boolAttr(c.display),
        masterRel: c.masterRel,
        bldLvl: c.bldLvl,
        grpId: c.grpId,
        afterEffect: boolAttr(c.afterEffect),
        nodeType: c.nodeType,
        nodePh: boolAttr(c.nodePh),
    };
    const inner = [];
    if (c.stCondLst)
        inner.push(condLstXml("stCondLst", c.stCondLst));
    if (c.endCondLst)
        inner.push(condLstXml("endCondLst", c.endCondLst));
    if (c.endSync)
        inner.push(condToXml(c.endSync, "endSync"));
    if (c.iterate)
        inner.push(iterateToXml(c.iterate));
    if (c.childTnLst && c.childTnLst.length > 0)
        inner.push(`<p:childTnLst>${c.childTnLst.map(nodeToXml).join("")}</p:childTnLst>`);
    if (c.subTnLst && c.subTnLst.length > 0)
        inner.push(`<p:subTnLst>${c.subTnLst.map(nodeToXml).join("")}</p:subTnLst>`);
    return `<p:cTn${(0, xml_util_1.attrs)(a)}>${inner.join("")}</p:cTn>`;
}
function cBhvrToXml(b) {
    const attrLst = b.attrNameLst && b.attrNameLst.length > 0
        ? `<p:attrNameLst>${b.attrNameLst.map((n) => `<p:attrName>${escXml(n)}</p:attrName>`).join("")}</p:attrNameLst>`
        : "";
    const aAttr = {
        additive: b.additive,
        accumulate: b.accumulate,
        xfrmType: b.xfrmType,
        from: b.from,
        to: b.to,
        by: b.by,
        rctx: b.rctx,
        override: b.override,
    };
    return `<p:cBhvr${(0, xml_util_1.attrs)(aAttr)}>${ctnToXml(b.ctn)}${tgtElToXml(b.tgtEl)}${attrLst}</p:cBhvr>`;
}
function cMediaNodeToXml(m) {
    const a = {
        vol: m.vol,
        mute: boolAttr(m.mute),
        numSld: m.numSld,
        showWhenStopped: boolAttr(m.showWhenStopped),
    };
    return `<p:cMediaNode${(0, xml_util_1.attrs)(a)}>${ctnToXml(m.ctn)}${tgtElToXml(m.tgtEl)}</p:cMediaNode>`;
}
function tgtElToXml(t) {
    const inner = [];
    if (t.sldTgt)
        inner.push("<p:sldTgt/>");
    if (t.spTgt) {
        const sp = t.spTgt;
        const sub = [];
        if (sp.txEl) {
            const tx = sp.txEl;
            const sb = [];
            if (tx.charRg)
                sb.push(`<p:charRg${(0, xml_util_1.attrs)({ st: tx.charRg.st, end: tx.charRg.end })}/>`);
            if (tx.pRg)
                sb.push(`<p:pRg${(0, xml_util_1.attrs)({ st: tx.pRg.st, end: tx.pRg.end })}/>`);
            sub.push(`<p:txEl>${sb.join("")}</p:txEl>`);
        }
        if (sp.subSpId)
            sub.push(`<p:subSp spid="${sp.subSpId}"/>`);
        if (sp.oleChartEl)
            sub.push(`<p:oleChartEl${(0, xml_util_1.attrs)({ type: sp.oleChartEl.type, lvl: sp.oleChartEl.lvl })}/>`);
        if (sp.graphicEl) {
            const g = sp.graphicEl;
            const gp = [];
            if (g.chartEl)
                gp.push(`<p:chartEl${(0, xml_util_1.attrs)({ seriesIdx: g.chartEl.seriesIdx, categoryIdx: g.chartEl.categoryIdx, bldStep: g.chartEl.bldStep })}/>`);
            if (g.dgmEl)
                gp.push(`<p:dgmEl${(0, xml_util_1.attrs)({ id: g.dgmEl.id, bldStep: g.dgmEl.bldStep })}/>`);
            sub.push(`<p:graphicEl><a:graphic><a:graphicData>${gp.join("")}</a:graphicData></a:graphic></p:graphicEl>`);
        }
        // §19.5.66 CT_TLShapeTargetElement: <bg/> 是 CT_Empty 子元素（与 txEl/subSp 互斥）。
        if (sp.bg)
            sub.unshift("<p:bg/>");
        inner.push(`<p:spTgt${(0, xml_util_1.attrs)({ spid: sp.spid })}>${sub.join("")}</p:spTgt>`);
    }
    if (t.sndTgt) {
        const st = t.sndTgt;
        let embed = st.embed;
        let link = st.link;
        const src = st.src;
        if (src && activeTimingMedia && !/^rId\d+/i.test(src)) {
            embed = activeTimingMedia.registerRel(src, media_table_1.REL_TYPE_AUDIO);
            link = undefined;
        }
        inner.push(`<p:sndTgt${(0, xml_util_1.attrs)({ "r:embed": embed, "r:link": link, name: st.name, builtIn: boolAttr(st.builtIn) })}/>`);
    }
    if (t.inkTgt)
        inner.push(`<p:inkTgt spid="${t.inkTgt}"/>`);
    return `<p:tgtEl>${inner.join("")}</p:tgtEl>`;
}
function condLstXml(tag, conds) {
    if (!conds || conds.length === 0)
        return "";
    return `<p:${tag}>${conds.map((c) => condToXml(c)).join("")}</p:${tag}>`;
}
// §19.5.20 CT_TLTimeCondition：<p:cond> 与 <p:endSync> 同一类型，endSync 自身就是条件，
// 属性直接写在 endSync 上，不再嵌一层 cond。
function condToXml(c, tag = "cond") {
    const a = {
        evt: c.evt,
        delay: c.delay === "indefinite" ? "indefinite" : c.delay,
    };
    const inner = [];
    if (c.tgtEl)
        inner.push(tgtElToXml(c.tgtEl));
    if (c.tn !== undefined)
        inner.push(`<p:tn val="${c.tn}"/>`);
    if (c.rtn)
        inner.push(`<p:rtn val="${c.rtn}"/>`);
    return `<p:${tag}${(0, xml_util_1.attrs)(a)}>${inner.join("")}</p:${tag}>`;
}
function iterateToXml(it) {
    const a = { type: it.type, backwards: boolAttr(it.backwards) };
    const inner = it.tmAbs !== undefined ? `<p:tmAbs val="${it.tmAbs}"/>` : it.tmPct !== undefined ? `<p:tmPct val="${it.tmPct}"/>` : "";
    return `<p:iterate${(0, xml_util_1.attrs)(a)}>${inner}</p:iterate>`;
}
function tavLstXml(tavs) {
    if (!tavs || tavs.length === 0)
        return "";
    return `<p:tavLst>${tavs.map((tv) => `<p:tav${(0, xml_util_1.attrs)({ tm: tv.tm, fmla: tv.fmla })}>${animValElem("val", tv.val)}</p:tav>`).join("")}</p:tavLst>`;
}
function animValElem(tag, v) {
    if (!v)
        return "";
    const inner = v.kind === "bool" ? `<p:boolVal val="${v.val ? 1 : 0}"/>` :
        v.kind === "int" ? `<p:intVal val="${v.val}"/>` :
            v.kind === "flt" ? `<p:fltVal val="${v.val}"/>` :
                v.kind === "str" ? `<p:strVal val="${escXml(v.val)}"/>` :
                    // §19.5.79 CT_TLAnimVariant：颜色必须包在 <p:clrVal>（CT_Color）里，裸 <a:srgbClr> 解析端读不到。
                    v.kind === "clr" ? `<p:clrVal>${animClrInner(v.val)}</p:clrVal>` : "";
    return `<p:${tag}>${inner}</p:${tag}>`;
}
function animClrSlot(tag, c) {
    if (!c)
        return "";
    return `<p:${tag}>${animClrInner(c)}</p:${tag}>`;
}
function colorBySlot(by) {
    if (!by)
        return "";
    if (by.rgb)
        return `<p:by><p:rgb r="${by.rgb.r}" g="${by.rgb.g}" b="${by.rgb.b}"/></p:by>`;
    if (by.hsl)
        return `<p:by><p:hsl h="${by.hsl.h}" s="${by.hsl.s}" l="${by.hsl.l}"/></p:by>`;
    return "";
}
function animClrInner(c) {
    const mods = (c.modifiers ?? []).map(modToXml).join("");
    // parser 端 hex / lastClr 带 "#" 前缀（parseAnimColor），ST_HexColorRGB 不带。
    if (c.hex)
        return `<a:srgbClr val="${hexRgb(c.hex)}">${mods}</a:srgbClr>`;
    if (c.scheme)
        return `<a:schemeClr val="${c.scheme}">${mods}</a:schemeClr>`;
    if (c.prst)
        return `<a:prstClr val="${c.prst}">${mods}</a:prstClr>`;
    if (c.hsl)
        return `<a:hslClr hue="${c.hsl.h}" sat="${c.hsl.s}" lum="${c.hsl.l}">${mods}</a:hslClr>`;
    if (c.sys)
        return `<a:sysClr val="${c.sys.val ?? ""}"${c.sys.lastClr ? ` lastClr=\"${hexRgb(c.sys.lastClr)}\"` : ""}>${mods}</a:sysClr>`;
    if (c.scrgb)
        return `<a:scrgbClr r="${c.scrgb.r}" g="${c.scrgb.g}" b="${c.scrgb.b}">${mods}</a:scrgbClr>`;
    return "";
}
function modToXml(m) {
    return `<a:${m.kind} val="${m.val}"/>`;
}
// §19.5.4 CT_TLPoint：animMotion / animScale 的 by / from / to 是带 x、y 属性的空元素，
// 与 rCtr 同形；没有 <p:pt> 子元素这一层（那是 a:custGeom 的写法）。
function animPointElem(tag, p) {
    if (!p)
        return "";
    return `<p:${tag} x="${p.x}" y="${p.y}"/>`;
}
function hexRgb(hex) {
    return hex.startsWith("#") ? hex.slice(1) : hex;
}
function bldToXml(b) {
    if (b.kind === "bldP") {
        const advAutoOut = b.advAuto === "indefinite" ? "indefinite" : b.advAuto;
        return `<p:bldP${(0, xml_util_1.attrs)({
            spid: b.spid,
            grpId: b.grpId,
            uiExpand: boolAttr(b.uiExpand),
            build: b.build,
            bldLvl: b.bldLvl,
            animBg: boolAttr(b.animBg),
            rev: boolAttr(b.rev),
            advAuto: advAutoOut,
            autoUpdateAnimBg: boolAttr(b.autoUpdateAnimBg),
        })}/>`;
    }
    if (b.kind === "bldGraphic") {
        return `<p:bldGraphic${(0, xml_util_1.attrs)({ spid: b.spid, grpId: b.grpId, bldAsOne: boolAttr(b.bldAsOne) })}/>`;
    }
    if (b.kind === "bldDgm") {
        return `<p:bldDgm${(0, xml_util_1.attrs)({ spid: b.spid, grpId: b.grpId, bld: b.bld })}/>`;
    }
    return `<p:bldOleChart${(0, xml_util_1.attrs)({ spid: b.spid, grpId: b.grpId, bld: b.bld, animBg: boolAttr(b.animBg) })}/>`;
}
function boolAttr(v) {
    if (v === undefined)
        return undefined;
    return v ? 1 : 0;
}
function escXml(s) {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function emptyTmRoot() {
    return {
        tnLst: [
            {
                kind: "par",
                ctn: {
                    id: "1",
                    dur: "indefinite",
                    restart: "never",
                    nodeType: "tmRoot",
                    childTnLst: [
                        {
                            kind: "seq",
                            concurrent: true,
                            nextAc: "seek",
                            ctn: { id: "2", dur: "indefinite", nodeType: "mainSeq" },
                            prevCondLst: [{ evt: "onPrev", delay: 0, tgtEl: { sldTgt: true } }],
                            nextCondLst: [{ evt: "onNext", delay: 0, tgtEl: { sldTgt: true } }],
                        },
                    ],
                },
            },
        ],
        bldLst: [],
    };
}
function walkTimeNodes(nodes, visit) {
    if (!nodes)
        return;
    for (const n of nodes) {
        visit(n);
        if (n.kind === "par" || n.kind === "seq" || n.kind === "excl")
            walkTimeNodes(n.ctn.childTnLst, visit);
        if (n.kind === "video" || n.kind === "audio")
            walkTimeNodes(n.cMediaNode.ctn.childTnLst, visit);
        if ("cBhvr" in n && n.cBhvr?.ctn.childTnLst)
            walkTimeNodes(n.cBhvr.ctn.childTnLst, visit);
    }
}
function mediaSpidsInTiming(timing) {
    const out = new Set();
    walkTimeNodes(timing.tnLst, (n) => {
        if (n.kind !== "video" && n.kind !== "audio")
            return;
        const spid = n.cMediaNode.tgtEl.spTgt?.spid;
        if (spid)
            out.add(spid);
    });
    return out;
}
function maxTimeNodeId(timing) {
    let max = 1;
    const take = (id) => {
        const n = Number(id);
        if (Number.isFinite(n) && n > max)
            max = n;
    };
    walkTimeNodes(timing.tnLst, (n) => {
        if (n.kind === "par" || n.kind === "seq" || n.kind === "excl")
            take(n.ctn.id);
        else if (n.kind === "video" || n.kind === "audio")
            take(n.cMediaNode.ctn.id);
        else if ("cBhvr" in n)
            take(n.cBhvr.ctn.id);
    });
    return max;
}
function mediaTimingNode(hint, tnId) {
    const node = {
        kind: hint.kind,
        cMediaNode: {
            vol: hint.muted ? 0 : 80000,
            mute: hint.muted || undefined,
            ctn: {
                id: tnId,
                fill: "hold",
                display: false,
                stCondLst: [{ delay: hint.autoplay ? 0 : "indefinite" }],
                ...(hint.loop ? { repeatCount: "indefinite" } : {}),
            },
            tgtEl: { spTgt: { spid: String(hint.spid) } },
        },
    };
    if (node.kind === "audio" && hint.isNarration)
        node.isNarration = true;
    return node;
}
/** 给插入的视频 / 音频补 Office 需要的 `p:video` / `p:audio` 时序节点。 */
function mergeMediaTiming(timing, hints) {
    if (!hints?.length)
        return timing;
    const have = timing ? mediaSpidsInTiming(timing) : new Set();
    const pending = hints.filter((h) => !have.has(String(h.spid)));
    if (!pending.length)
        return timing;
    // 只改序列化副本：直接往 slide.ooxmlTiming 里 push 会让每次导出都多一条媒体节点。
    const base = timing ? structuredClone(timing) : emptyTmRoot();
    const root = base.tnLst[0];
    if (!root || root.kind !== "par")
        return base;
    const children = root.ctn.childTnLst ?? (root.ctn.childTnLst = []);
    let nextId = maxTimeNodeId(base) + 1;
    for (const h of pending)
        children.push(mediaTimingNode(h, String(nextId++)));
    return base;
}
