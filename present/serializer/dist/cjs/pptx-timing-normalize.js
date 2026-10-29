"use strict";
// 写盘前把内存里的时序树整理成 PowerPoint 能识别的形状（ECMA-376 §19.5）。
//
// 内存模型（editor/animation/store.ts insertEffect）为了方便编辑，在 mainSeq 下直接挂
// 一个"效果包装 par"：cTn 上带 presetID / nodeType=clickEffect|withEffect|afterEffect，
// 还有一个非标准的 cTn.delay。编辑器、播放器、compile 都认这套结构。
//
// OOXML 不认：
//   - CT_TLCommonTimeNodeData 没有 delay 属性，延迟只能写在 stCondLst/cond@delay 上；
//     未知属性会让 PowerPoint 走"修复"并丢掉整段 <p:timing>。
//   - PowerPoint 只从 mainSeq → 点击组 par → 同步组 par → 效果 par 这三层里读效果。
//     少一层、或者点击组自己带 presetID，效果就被当成不认识的容器，动画面板里为空。
//
// 这里只改序列化副本；内存树保持不动，编辑器契约不受影响。
// 已是标准结构的树（从 .pptx 解析进来的）原样通过。
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeTimingForOoxml = normalizeTimingForOoxml;
exports.needsOoxmlNormalization = needsOoxmlNormalization;
const animation_1 = require("@sliiu/present-animation");
const EFFECT_NODE_TYPES = new Set(["clickEffect", "withEffect", "afterEffect"]);
// 编辑器把这些"效果级"字段写在包装 par 上；PowerPoint 读效果 par。搬过去时包装层优先。
const EFFECT_LEVEL_FIELDS = ["repeatCount", "repeatDur", "autoRev", "accel", "decel", "spd"];
function normalizeTimingForOoxml(timing) {
    const copy = structuredClone(timing);
    pruneDanglingTargets(copy);
    const ids = new CTnIdAllocator(copy);
    for (const n of copy.tnLst)
        hoistDelays(n);
    for (const b of copy.bldLst ?? []) {
        if (b.kind !== "bldP")
            continue;
        for (const tmpl of b.tmplLst ?? [])
            for (const n of tmpl.tnLst ?? [])
                hoistDelays(n);
    }
    const mainSeq = findMainSeq(copy);
    if (!mainSeq)
        return copy;
    if (mainSeq.ctn.dur === undefined)
        mainSeq.ctn.dur = "indefinite";
    const converted = [];
    mainSeq.ctn.childTnLst = groupMainSeqChildren(mainSeq.ctn.childTnLst ?? [], mainSeq.ctn.id, ids, converted);
    if (converted.length > 0)
        ensureBuildEntries(copy, converted);
    return copy;
}
/**
 * 源文件里的时序是不是我们早期 serializer 直出的编辑器结构（cTn@delay、效果包装直挂 mainSeq）。
 * round-trip 遇到这种快照即使用户没动动画也要重写，否则旧稿子再保存一次仍然打不开动画。
 */
function needsOoxmlNormalization(timing) {
    if (!timing)
        return false;
    const hasDelay = (n) => {
        const ctn = animation_1.ooxml.getCTn(n);
        if (ctn.delay !== undefined)
            return true;
        return (ctn.childTnLst ?? []).some(hasDelay) || (ctn.subTnLst ?? []).some(hasDelay);
    };
    if (timing.tnLst.some(hasDelay))
        return true;
    const mainSeq = findMainSeq(timing);
    if (!mainSeq)
        return false;
    return (mainSeq.ctn.childTnLst ?? []).some((c) => {
        const nodeType = animation_1.ooxml.getCTn(c).nodeType;
        return c.kind === "par" && nodeType !== undefined && EFFECT_NODE_TYPES.has(nodeType);
    });
}
// ---- cTn.delay → stCondLst/cond@delay ----
function hoistDelays(n) {
    const ctn = animation_1.ooxml.getCTn(n);
    if (ctn.delay !== undefined) {
        mergeDelayIntoConds(ctn, ctn.delay);
        delete ctn.delay;
    }
    for (const c of ctn.childTnLst ?? [])
        hoistDelays(c);
    for (const c of ctn.subTnLst ?? [])
        hoistDelays(c);
}
function mergeDelayIntoConds(ctn, delay) {
    const conds = ctn.stCondLst;
    if (!conds || conds.length === 0) {
        ctn.stCondLst = [{ delay }];
        return;
    }
    if (delay === "indefinite")
        return;
    let merged = false;
    for (const c of conds) {
        if (c.delay === "indefinite")
            continue;
        c.delay = (typeof c.delay === "number" ? c.delay : 0) + delay;
        merged = true;
    }
    if (!merged)
        conds.push({ delay });
}
function groupMainSeqChildren(children, mainSeqId, ids, converted) {
    const out = [];
    let current = null;
    for (const child of children) {
        const nodeType = animation_1.ooxml.getCTn(child).nodeType;
        if (child.kind !== "par" || !nodeType || !EFFECT_NODE_TYPES.has(nodeType)) {
            out.push(child);
            current = adoptCanonicalGroup(child);
            continue;
        }
        const effect = toEffectNode(child, ids);
        converted.push(effect.node);
        if (nodeType === "clickEffect" || !current) {
            current = newClickGroup(nodeType !== "clickEffect", mainSeqId, ids);
            out.push(current.node);
            addWithGroup(current, 0, ids);
        }
        else if (nodeType === "afterEffect") {
            addWithGroup(current, current.endMs, ids);
        }
        const wg = current.withGroups[current.withGroups.length - 1];
        (wg.node.ctn.childTnLst ??= []).push(effect.node);
        current.endMs = Math.max(current.endMs, wg.startMs + effect.delayMs + effect.durMs);
    }
    return out;
}
function newClickGroup(autoStart, mainSeqId, ids) {
    // 首个效果就是 with/after previous：PowerPoint 让点击组在 mainSeq 开始时自动起播，
    // 写法是在 delay="indefinite" 之后再加一条 onBegin 指向 mainSeq 的 cond。
    const stCondLst = [{ delay: "indefinite" }];
    if (autoStart && mainSeqId)
        stCondLst.push({ evt: "onBegin", delay: 0, tn: mainSeqId });
    const node = { kind: "par", ctn: { id: ids.next(), fill: "hold", stCondLst, childTnLst: [] } };
    return { node, withGroups: [], endMs: 0 };
}
function addWithGroup(group, startMs, ids) {
    const node = {
        kind: "par",
        ctn: { id: ids.next(), fill: "hold", stCondLst: [{ delay: startMs }], childTnLst: [] },
    };
    group.node.ctn.childTnLst.push(node);
    group.withGroups.push({ node, startMs });
}
// 已经是标准点击组（par → 若干同步组 par）的节点：记住它的时间跨度，好让后面紧跟的
// with/after 包装能挂进同一个点击组，而不是另起一次点击。
function adoptCanonicalGroup(node) {
    if (node.kind !== "par")
        return null;
    const kids = node.ctn.childTnLst ?? [];
    if (kids.length === 0 || !kids.every((k) => k.kind === "par"))
        return null;
    const withGroups = [];
    let endMs = 0;
    for (const wg of kids) {
        const startMs = numericCondDelay(wg.ctn.stCondLst);
        withGroups.push({ node: wg, startMs });
        for (const eff of wg.ctn.childTnLst ?? []) {
            endMs = Math.max(endMs, startMs + numericCondDelay(animation_1.ooxml.getCTn(eff).stCondLst) + effectDurMs(eff));
        }
    }
    return { node, withGroups, endMs };
}
function toEffectNode(wrapper, ids) {
    const w = wrapper.ctn;
    const kids = w.childTnLst ?? [];
    // 模板展开出来的子树本身就是一个带 presetID 的效果 par，直接升格；
    // 否则（手工 set + anim 占位）补一层效果 par 把叶子包起来。
    const inner = kids.length === 1 && kids[0].kind === "par" && kids[0].ctn.presetID !== undefined ? kids[0] : null;
    const effect = inner ?? { kind: "par", ctn: { id: ids.next(), childTnLst: kids } };
    const e = effect.ctn;
    if (w.presetID !== undefined)
        e.presetID = w.presetID;
    if (w.presetClass !== undefined)
        e.presetClass = w.presetClass;
    if (w.presetSubtype !== undefined)
        e.presetSubtype = w.presetSubtype;
    e.nodeType = w.nodeType;
    e.fill ??= "hold";
    e.grpId ??= 0;
    for (const k of EFFECT_LEVEL_FIELDS) {
        if (w[k] !== undefined)
            e[k] = w[k];
    }
    // 包装层的延迟（用户设置）与模板自带延迟相加：compile 也是这样累加的。
    const delayMs = numericCondDelay(w.stCondLst) + numericCondDelay(e.stCondLst);
    setNumericCondDelay(e, delayMs);
    // insertEffect 会把子树真实跨度写到包装层 dur；没有就扫叶子。
    const durMs = typeof w.dur === "number" && w.dur > 1 ? w.dur : effectDurMs(effect);
    return { node: effect, delayMs, durMs };
}
function numericCondDelay(conds) {
    if (!conds)
        return 0;
    for (const c of conds)
        if (typeof c.delay === "number" && !c.tn && !c.evt)
            return c.delay;
    return 0;
}
function setNumericCondDelay(ctn, delayMs) {
    const conds = ctn.stCondLst ?? [];
    const idx = conds.findIndex((c) => typeof c.delay === "number" && !c.tn && !c.evt);
    if (idx >= 0)
        conds[idx].delay = delayMs;
    else
        conds.unshift({ delay: delayMs });
    ctn.stCondLst = conds;
}
// 效果实际跨度：叶子 (cond delay + dur) 的最大值。容器 dur 显式且 >1ms 时优先。
function effectDurMs(node) {
    const ctn = animation_1.ooxml.getCTn(node);
    if (animation_1.ooxml.isContainer(node)) {
        if (typeof ctn.dur === "number" && ctn.dur > 1)
            return ctn.dur;
        let max = 0;
        for (const c of ctn.childTnLst ?? []) {
            max = Math.max(max, numericCondDelay(animation_1.ooxml.getCTn(c).stCondLst) + effectDurMs(c));
        }
        return max;
    }
    return typeof ctn.dur === "number" ? ctn.dur : 0;
}
// ---- bldLst ----
// PowerPoint 给每个被动画的形状写一条 bldP（grpId 与效果 cTn@grpId 对齐）。
// 只给本次从包装层转换出来的效果补，解析进来的树保持原样。
function ensureBuildEntries(timing, effects) {
    const bldLst = timing.bldLst ?? (timing.bldLst = []);
    const have = new Set(bldLst.map((b) => b.spid));
    for (const eff of effects) {
        const tgt = firstShapeTarget(eff);
        if (!tgt || have.has(tgt.spid))
            continue;
        if (tgt.graphicEl || tgt.oleChartEl || tgt.bg)
            continue;
        have.add(tgt.spid);
        const entry = { kind: "bldP", spid: tgt.spid, grpId: eff.ctn.grpId ?? 0 };
        if (tgt.txEl?.pRg)
            entry.build = "p";
        bldLst.push(entry);
    }
}
function firstShapeTarget(node) {
    if (animation_1.ooxml.isBehavior(node) || animation_1.ooxml.isMedia(node))
        return animation_1.ooxml.getTgtEl(node)?.spTgt;
    for (const c of animation_1.ooxml.getChildren(node)) {
        const t = firstShapeTarget(c);
        if (t)
            return t;
    }
    return undefined;
}
// ---- 悬空目标 ----
// §19.7.3 ST_DrawingElementId 是 unsignedInt。remapTimingSpids 只能改写本页真实存在的 shape；
// 目标已被删除 / 改名的效果会把逻辑 id（sp_xxx、dg_xxx）原样带到盘上，PowerPoint 因此丢弃整段
// <p:timing>。与其让一个死引用拖垮整页动画，不如在写盘副本里把它连同变空的容器一起摘掉。
const WRITTEN_SPID = /^\d+$/;
function pruneDanglingTargets(timing) {
    timing.tnLst = timing.tnLst.filter((n) => pruneNode(n, true));
    if (timing.bldLst) {
        timing.bldLst = timing.bldLst.filter((b) => WRITTEN_SPID.test(b.spid));
        for (const b of timing.bldLst) {
            if (b.kind !== "bldP")
                continue;
            for (const tmpl of b.tmplLst ?? [])
                tmpl.tnLst = (tmpl.tnLst ?? []).filter((n) => pruneNode(n, true));
        }
    }
}
function tgtIsDangling(tgt) {
    return tgt?.spTgt !== undefined && !WRITTEN_SPID.test(String(tgt.spTgt.spid));
}
/** 返回 false 表示该节点应被移除。`keepEmpty` 只对 tnLst 顶层为真；tmRoot / mainSeq 等骨架自身永远保留。 */
function pruneNode(n, keepEmpty) {
    if (animation_1.ooxml.isBehavior(n) || animation_1.ooxml.isMedia(n))
        return !tgtIsDangling(animation_1.ooxml.getTgtEl(n));
    const ctn = n.ctn;
    const skeleton = ctn.nodeType === "tmRoot" || ctn.nodeType === "mainSeq" || ctn.nodeType === "interactiveSeq";
    const dropCond = (c) => !tgtIsDangling(c.tgtEl);
    if (ctn.stCondLst)
        ctn.stCondLst = ctn.stCondLst.filter(dropCond);
    if (ctn.endCondLst)
        ctn.endCondLst = ctn.endCondLst.filter(dropCond);
    if (ctn.endSync && tgtIsDangling(ctn.endSync.tgtEl))
        delete ctn.endSync;
    if (n.kind === "seq") {
        if (n.prevCondLst)
            n.prevCondLst = n.prevCondLst.filter(dropCond);
        if (n.nextCondLst)
            n.nextCondLst = n.nextCondLst.filter(dropCond);
    }
    const hadChildren = (ctn.childTnLst?.length ?? 0) + (ctn.subTnLst?.length ?? 0) > 0;
    if (ctn.childTnLst)
        ctn.childTnLst = ctn.childTnLst.filter((c) => pruneNode(c, false));
    if (ctn.subTnLst)
        ctn.subTnLst = ctn.subTnLst.filter((c) => pruneNode(c, false));
    const empty = (ctn.childTnLst?.length ?? 0) + (ctn.subTnLst?.length ?? 0) === 0;
    // 本来就空的容器（如 interactiveSeq 骨架）不是我们清出来的，原样保留。
    return keepEmpty || skeleton || !hadChildren || !empty;
}
// ---- 杂项 ----
function findMainSeq(timing) {
    for (const top of timing.tnLst) {
        if (!animation_1.ooxml.isContainer(top))
            continue;
        for (const c of top.ctn.childTnLst ?? []) {
            if (c.kind === "seq" && c.ctn.nodeType === "mainSeq")
                return c;
        }
    }
    return null;
}
class CTnIdAllocator {
    max = 1;
    constructor(timing) {
        const visit = (n) => {
            const id = Number(animation_1.ooxml.getCTn(n).id);
            if (Number.isFinite(id) && id > this.max)
                this.max = id;
            for (const c of animation_1.ooxml.getChildren(n))
                visit(c);
            for (const c of animation_1.ooxml.getCTn(n).subTnLst ?? [])
                visit(c);
        };
        for (const n of timing.tnLst)
            visit(n);
        for (const b of timing.bldLst ?? []) {
            if (b.kind !== "bldP")
                continue;
            for (const tmpl of b.tmplLst ?? [])
                for (const n of tmpl.tnLst ?? [])
                    visit(n);
        }
    }
    next() {
        return String(++this.max);
    }
}
