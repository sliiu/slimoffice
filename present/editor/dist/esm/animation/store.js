// AnimationStore：把 OOXML timing 展平为编辑器视角的扁平 Effect 列表。
// 维护 Effect ↔ OOXML cTn 节点的双向映射，便于 UI 增删改查。
import { ooxml } from "@sliiu/present-animation";
// Effect.id 必须在多次 buildEffectList 之间保持稳定：
// UI（panel/timeline）会把当前选中的 effectId 保存到组件内部状态；任何编辑命令都会
// 触发 stack.subscribe → refresh → buildEffectList 重建列表。如果 id 在每次重建时变化
// （旧实现里用递增计数器），选中态会丢，inspector 立刻收起，造成"动画无法设置详细参数"。
// 这里基于 OOXML 路径（topIdx + cTnId + parentPath）派生稳定 id，结构未变时 id 不变。
function effectIdFromPath(path) {
    const ct = path.cTnId ?? "?";
    const pp = path.parentPath.length > 0 ? path.parentPath.join("-") : "0";
    return `eff_${path.topIdx}_${ct}_${pp}`;
}
export function buildEffectList(timing) {
    if (!timing)
        return [];
    const out = [];
    for (let topIdx = 0; topIdx < timing.tnLst.length; topIdx++) {
        walk(timing.tnLst[topIdx], topIdx, [], out);
    }
    return out;
}
function walk(node, topIdx, parentPath, out, hint) {
    const cTn = ooxml.getCTn(node);
    let nextHint = hint;
    if (cTn.nodeType === "interactiveSeq") {
        const shapeId = condShapeId(cTn.stCondLst);
        nextHint = { trigger: triggerOf(cTn), triggerShapeId: shapeId };
    }
    if (cTn.nodeType === "clickEffect" || cTn.nodeType === "clickPar" || cTn.nodeType === "clickTn" || cTn.nodeType === "withEffect" || cTn.nodeType === "afterEffect") {
        const e = effectFromContainer(node, cTn, topIdx, parentPath);
        if (e) {
            if (nextHint) {
                e.trigger = nextHint.trigger;
                if (nextHint.triggerShapeId)
                    e.triggerShapeId = nextHint.triggerShapeId;
            }
            out.push(e);
            return;
        }
    }
    if (ooxml.isContainer(node)) {
        const children = node.ctn.childTnLst ?? [];
        for (let i = 0; i < children.length; i++) {
            walk(children[i], topIdx, [...parentPath, i], out, nextHint);
        }
    }
}
function condShapeId(conds) {
    if (!conds)
        return undefined;
    for (const c of conds) {
        if (c.tgtEl?.spTgt?.spid)
            return `sp_${c.tgtEl.spTgt.spid}`;
    }
    return undefined;
}
function effectFromContainer(node, cTn, topIdx, parentPath) {
    const trigger = triggerOf(cTn);
    let triggerShapeId;
    let targetShapeId;
    let paraRange;
    let charRange;
    if ((trigger === "onShapeClick" ||
        trigger === "onShapeDblClick" ||
        trigger === "onShapeHover" ||
        trigger === "onShapeMouseOut") &&
        cTn.stCondLst) {
        for (const c of cTn.stCondLst) {
            if ((c.evt === "onClick" || c.evt === "onDblClick" || c.evt === "onMouseOver" || c.evt === "onMouseOut") &&
                c.tgtEl?.spTgt) {
                triggerShapeId = `sp_${c.tgtEl.spTgt.spid}`;
                break;
            }
        }
    }
    const inner = findLeafTarget(node);
    if (!inner)
        return null;
    targetShapeId = `sp_${inner.spid}`;
    if (inner.txEl?.pRg)
        paraRange = inner.txEl.pRg;
    if (inner.txEl?.charRg)
        charRange = inner.txEl.charRg;
    // §19.5.18 cTn.dur 优先（容器显式时长）；否则取子树里最长的 leaf dur。
    // 不能用 findLeafTarget 返回的"第一个 leaf"——PowerPoint 出品的 entrance/exit
    // 几乎都以 set(style.visibility, dur=1ms) 打头，取第一个会把时长误判成 1ms，
    // 时间轴上 bar 退化成 1px、看起来像"瞬时/同时"。取 max leaf dur 才是动画实际长度。
    const baseDur = msNum(cTn.dur);
    const innerDur = maxLeafDurMs(node);
    const duration = baseDur > 1 ? baseDur : innerDur > 0 ? innerDur : msNum(inner.dur);
    const delay = msNum(cTn.delay) + condDelay(cTn.stCondLst);
    const path = { topIdx, cTnId: cTn.id, parentPath };
    return {
        id: effectIdFromPath(path),
        trigger,
        triggerShapeId,
        targetShapeId,
        paraRange,
        charRange,
        presetClass: classOf(cTn.presetClass),
        presetId: cTn.presetID,
        presetSubtype: cTn.presetSubtype,
        durationMs: duration,
        delayMs: delay,
        iterations: cTn.repeatCount === "indefinite"
            ? Infinity
            : typeof cTn.repeatCount === "number" && cTn.repeatCount > 0
                ? Math.max(1, cTn.repeatCount / 1000)
                : 1,
        autoReverse: !!cTn.autoRev,
        repeatCount: typeof cTn.repeatCount === "number" ? cTn.repeatCount : undefined,
        spd: cTn.spd,
        accel: cTn.accel,
        decel: cTn.decel,
        path,
    };
}
function triggerOf(cTn) {
    switch (cTn.nodeType) {
        case "clickEffect":
        case "clickPar":
        case "clickTn":
            return "onClick";
        case "withEffect":
        case "withGroup":
        case "withPar":
            return "withPrevious";
        case "afterEffect":
        case "afterGroup":
            return "afterPrevious";
        case "interactiveSeq": {
            const evt = cTn.stCondLst?.find((c) => c.evt)?.evt;
            if (evt === "onDblClick")
                return "onShapeDblClick";
            if (evt === "onMouseOver")
                return "onShapeHover";
            if (evt === "onMouseOut")
                return "onShapeMouseOut";
            if (evt === "onPrev")
                return "onPrev";
            if (evt === "onNext")
                return "onNext";
            return "onShapeClick";
        }
        default:
            return "onLoad";
    }
}
function classOf(presetClass) {
    if (presetClass === "entr" || presetClass === "exit" || presetClass === "emph" || presetClass === "path")
        return presetClass;
    if (presetClass === "mediacall")
        return "media";
    return "custom";
}
function findLeafTarget(node) {
    // 深度优先，找第一个 cBhvr.tgtEl.spTgt.spid
    const stack = [node];
    while (stack.length > 0) {
        const n = stack.pop();
        if (ooxml.isBehavior(n) || ooxml.isMedia(n)) {
            const tgt = ooxml.isMedia(n) ? n.cMediaNode.tgtEl : n.cBhvr.tgtEl;
            if (tgt.spTgt?.spid) {
                const cTn = ooxml.isMedia(n) ? n.cMediaNode.ctn : n.cBhvr.ctn;
                return {
                    spid: tgt.spTgt.spid,
                    txEl: tgt.spTgt.txEl,
                    dur: msNum(cTn.dur),
                };
            }
        }
        if (ooxml.isContainer(n)) {
            const children = n.ctn.childTnLst ?? [];
            for (let i = children.length - 1; i >= 0; i--)
                stack.push(children[i]);
        }
    }
    return null;
}
// 扫描容器子树里所有 behavior/media leaf，返回最大 cTn.dur（ms）。容器节点自身的
// dur 不计（容器极少显式写 dur，写了也由调用方的 baseDur 分支优先处理）。
function maxLeafDurMs(node) {
    let max = 0;
    const visit = (n) => {
        if (ooxml.isBehavior(n) || ooxml.isMedia(n)) {
            const d = msNum(ooxml.getCTn(n).dur);
            if (d > max)
                max = d;
            return;
        }
        if (ooxml.isContainer(n)) {
            for (const c of n.ctn.childTnLst ?? [])
                visit(c);
        }
    };
    visit(node);
    return max;
}
function msNum(d) {
    if (typeof d !== "number")
        return 0;
    return d;
}
function condDelay(conds) {
    if (!conds)
        return 0;
    for (const c of conds)
        if (typeof c.delay === "number")
            return c.delay;
    return 0;
}
export function ensureTiming(slide) {
    if (slide.ooxmlTiming)
        return slide.ooxmlTiming;
    const root = {
        kind: "par",
        ctn: {
            id: "1",
            dur: "indefinite",
            restart: "never",
            nodeType: "tmRoot",
            childTnLst: [
                {
                    kind: "seq",
                    ctn: {
                        id: "2",
                        concurrent: true,
                        nextAc: "seek",
                        nodeType: "mainSeq",
                        childTnLst: [],
                    },
                    concurrent: true,
                    nextAc: "seek",
                    prevCondLst: [{ evt: "onPrev", delay: 0, tgtEl: { sldTgt: true } }],
                    nextCondLst: [{ evt: "onNext", delay: 0, tgtEl: { sldTgt: true } }],
                },
            ],
        },
    };
    const timing = { tnLst: [root], bldLst: [] };
    slide.ooxmlTiming = timing;
    return timing;
}
export function findMainSeq(timing) {
    for (const top of timing.tnLst) {
        if (!ooxml.isContainer(top))
            continue;
        const children = top.ctn.childTnLst ?? [];
        for (const c of children) {
            if (ooxml.isContainer(c) && c.ctn.nodeType === "mainSeq")
                return c.ctn;
        }
    }
    return null;
}
let _ctnIdCounter = 100;
export function freshCTnId(timing) {
    let max = _ctnIdCounter;
    const visit = (n) => {
        const c = ooxml.getCTn(n);
        if (c.id) {
            const x = Number(c.id);
            if (Number.isFinite(x) && x > max)
                max = x;
        }
        for (const ch of ooxml.getChildren(n))
            visit(ch);
    };
    for (const top of timing.tnLst)
        visit(top);
    _ctnIdCounter = max + 1;
    return String(_ctnIdCounter);
}
export function insertEffect(timing, args) {
    const mainSeq = findMainSeq(timing);
    if (!mainSeq)
        return null;
    const children = mainSeq.childTnLst ?? [];
    const trigger = args.trigger ?? "onClick";
    const presetClass = args.presetClass === "custom" || args.presetClass === "media" ? undefined : args.presetClass;
    const durationMs = args.durationMs ?? defaultDuration(args.presetClass, args.presetId);
    const delayMs = args.delayMs ?? 0;
    const nodeType = trigger === "onClick" ? "clickEffect" :
        trigger === "withPrevious" ? "withEffect" :
            trigger === "afterPrevious" ? "afterEffect" : "clickEffect";
    const subtree = makePresetSubtree(timing, args, durationMs);
    // wrapper dur 必须覆盖子树真实跨度。fly-in 等模板叶子常为 2000ms，而
    // defaultDuration(entr)=500 只会写到 inner par；wrapper 不写 dur 时
    // afterPrevious 会按 inner 500ms 起算，时间轴第二条错位到 0.5s。
    const wrapperDur = Math.max(durationMs, maxLeafDurMs(subtree));
    const clickPar = {
        kind: "par",
        ctn: {
            id: freshCTnId(timing),
            fill: "hold",
            presetID: args.presetId,
            presetClass,
            presetSubtype: args.presetSubtype,
            nodeType,
            delay: delayMs,
            dur: wrapperDur,
            childTnLst: [subtree],
        },
    };
    const idx = args.index !== undefined ? Math.max(0, Math.min(args.index, children.length)) : children.length;
    children.splice(idx, 0, clickPar);
    mainSeq.childTnLst = children;
    return clickPar;
}
function defaultDuration(cls, presetId) {
    // 各 class 默认时长贴近 PowerPoint：entr/exit 500ms（"medium fast"），
    // emph / motion path 2000ms（"medium"，路径/强调更长才看得清）。
    if (cls === "emph")
        return 2000;
    if (cls === "path")
        return 2000;
    void presetId;
    return 500;
}
function makePresetSubtree(timing, args, durationMs) {
    const spid = args.targetShapeId.replace(/^sp_/, "");
    // 优先用 OOXML 子树模板（presets-template/registry）展开：与 PowerPoint
    // 原生 PPT 写出的子树一致，可走完整 compile 路径（filter/motion/iterate 全保留）。
    // 找不到时（custom / 模板缺失）才回退到 set+opacity 占位淡入淡出。
    if ((args.presetClass === "entr" ||
        args.presetClass === "exit" ||
        args.presetClass === "emph" ||
        args.presetClass === "path") &&
        typeof args.presetId === "number") {
        const tpl = ooxml.findPresetTemplate(args.presetClass, args.presetId);
        if (tpl) {
            const expanded = ooxml.expandPresetTemplate(tpl, {
                tgtSpid: spid,
                pRg: args.paraRange,
                charRg: args.charRange,
                presetSubtype: args.presetSubtype,
                durMs: durationMs,
            });
            const expandedCTn = ooxml.getCTn(expanded);
            expandedCTn.presetID = args.presetId;
            expandedCTn.presetClass = args.presetClass;
            if (args.presetSubtype !== undefined)
                expandedCTn.presetSubtype = args.presetSubtype;
            reassignCTnIds(expanded, timing);
            // 用户/调用方指定的 durationMs 与模板默认 dur 不同时，按比例缩放模板
            // 内部 leaf dur 与 delay，保证总时长与 UI 期望一致（同时保留各 leaf 节奏）。
            // expand 已把 durMs 写到根 cTn.dur，模板原时长只能从子节点量。
            const children = ooxml.getCTn(expanded).childTnLst ?? [];
            const origTotal = Math.max(0, ...children.map(estimateContainerDuration));
            if (origTotal > 0 && Math.abs(origTotal - durationMs) > 1) {
                for (const c of children)
                    scaleDurations(c, durationMs, durationMs / origTotal);
            }
            return expanded;
        }
    }
    const txEl = args.paraRange
        ? { pRg: args.paraRange }
        : args.charRange
            ? { charRg: args.charRange }
            : undefined;
    const tgtEl = { spTgt: { spid, ...(txEl ? { txEl } : {}) } };
    const setNode = {
        kind: "set",
        cBhvr: {
            ctn: { id: freshCTnId(timing), dur: 1, fill: "hold" },
            tgtEl,
            attrNameLst: ["style.visibility"],
        },
        to: { kind: "str", val: args.presetClass === "exit" ? "hidden" : "visible" },
    };
    const animOpacity = {
        kind: "anim",
        cBhvr: {
            ctn: { id: freshCTnId(timing), dur: durationMs, fill: "hold" },
            tgtEl,
            attrNameLst: ["style.opacity"],
            additive: "base",
        },
        calcMode: "lin",
        valueType: "num",
        tavLst: args.presetClass === "exit"
            ? [
                { tm: 0, val: { kind: "str", val: "1" } },
                { tm: 100000, val: { kind: "str", val: "0" } },
            ]
            : [
                { tm: 0, val: { kind: "str", val: "0" } },
                { tm: 100000, val: { kind: "str", val: "1" } },
            ],
    };
    return {
        kind: "par",
        ctn: {
            id: freshCTnId(timing),
            presetID: args.presetId,
            presetClass: args.presetClass === "custom" || args.presetClass === "media" ? undefined : args.presetClass,
            presetSubtype: args.presetSubtype,
            childTnLst: [setNode, animOpacity],
        },
    };
}
// 模板提取时保留了源 PPT 的 cTn.id，多次插入或与既有 timing 树合并会冲突。
// 这里整棵子树重新分配 id，确保唯一性（不影响时序 / 行为）。
function reassignCTnIds(node, timing) {
    const cTn = ooxml.getCTn(node);
    cTn.id = freshCTnId(timing);
    for (const c of ooxml.getChildren(node))
        reassignCTnIds(c, timing);
}
export function removeEffect(timing, effectPath) {
    const mainSeq = findMainSeq(timing);
    if (!mainSeq)
        return null;
    const children = mainSeq.childTnLst ?? [];
    for (let i = 0; i < children.length; i++) {
        const c = children[i];
        if (ooxml.getCTn(c).id === effectPath.cTnId) {
            children.splice(i, 1);
            return c;
        }
    }
    return null;
}
export function moveEffect(timing, effectPath, newIndex) {
    const mainSeq = findMainSeq(timing);
    if (!mainSeq)
        return;
    const children = mainSeq.childTnLst ?? [];
    const idx = children.findIndex((c) => ooxml.getCTn(c).id === effectPath.cTnId);
    if (idx < 0)
        return;
    const [node] = children.splice(idx, 1);
    const clamped = Math.max(0, Math.min(newIndex, children.length));
    children.splice(clamped, 0, node);
}
function nodeChain(timing, path) {
    const top = timing.tnLst[path.topIdx];
    if (!top)
        return null;
    const chain = [top];
    let node = top;
    for (const i of path.parentPath) {
        const next = ooxml.getCTn(node).childTnLst?.[i];
        if (!next)
            return null;
        chain.push(next);
        node = next;
    }
    if (path.cTnId && ooxml.getCTn(node).id !== path.cTnId)
        return null;
    return chain;
}
function nodeAtPath(timing, path) {
    const chain = nodeChain(timing, path);
    if (!chain)
        return null;
    const node = chain[chain.length - 1];
    return node ? { node } : null;
}
function subtreeHasBehavior(node) {
    if (ooxml.isBehavior(node) || ooxml.isMedia(node))
        return true;
    return ooxml.getChildren(node).some(subtreeHasBehavior);
}
const GESTURE_EVT = {
    onShapeClick: "onClick",
    onShapeDblClick: "onDblClick",
    onShapeHover: "onMouseOver",
    onShapeMouseOut: "onMouseOut",
    onPrev: "onPrev",
    onNext: "onNext",
};
function gestureCond(trigger, spid) {
    const evt = GESTURE_EVT[trigger];
    if (trigger === "onPrev" || trigger === "onNext") {
        return { evt, delay: 0, tgtEl: { sldTgt: true } };
    }
    return { evt, delay: 0, tgtEl: spid ? { spTgt: { spid } } : undefined };
}
function removeNode(timing, target) {
    const visit = (node) => {
        const children = ooxml.getCTn(node).childTnLst;
        if (!children)
            return false;
        const i = children.indexOf(target);
        if (i >= 0) {
            children.splice(i, 1);
            return true;
        }
        return children.some(visit);
    };
    for (const top of timing.tnLst) {
        if (visit(top))
            return;
    }
}
function applyEffectTrigger(timing, path, trigger) {
    const chain = nodeChain(timing, path);
    if (!chain || chain.length === 0)
        return;
    const effect = chain[chain.length - 1];
    const ancestor = chain.find((n) => ooxml.getCTn(n).nodeType === "interactiveSeq");
    const gesture = GESTURE_EVT[trigger];
    if (gesture) {
        const cond = gestureCond(trigger, findLeafTarget(effect)?.spid);
        if (ancestor) {
            ooxml.getCTn(ancestor).stCondLst = [cond];
            return;
        }
        if (chain.length < 2)
            return;
        const parent = chain[chain.length - 2];
        const index = path.parentPath[path.parentPath.length - 1];
        const list = ooxml.getCTn(parent).childTnLst;
        if (!list || list[index] !== effect)
            return;
        const seq = {
            kind: "seq",
            concurrent: true,
            nextAc: "seek",
            ctn: {
                id: freshCTnId(timing),
                fill: "hold",
                restart: "whenNotActive",
                nodeType: "interactiveSeq",
                stCondLst: [cond],
                childTnLst: [effect],
            },
        };
        list[index] = seq;
        return;
    }
    const nodeType = trigger === "onClick" ? "clickEffect" :
        trigger === "withPrevious" ? "withEffect" :
            trigger === "afterPrevious" ? "afterEffect" : undefined;
    if (!nodeType)
        return;
    ooxml.getCTn(effect).nodeType = nodeType;
    if (!ancestor || chain.length < 2)
        return;
    const parent = chain[chain.length - 2];
    const index = path.parentPath[path.parentPath.length - 1];
    const list = ooxml.getCTn(parent).childTnLst;
    if (!list || list[index] !== effect)
        return;
    list.splice(index, 1);
    if (!subtreeHasBehavior(ancestor))
        removeNode(timing, ancestor);
    const mainSeq = findMainSeq(timing);
    if (!mainSeq)
        return;
    mainSeq.childTnLst = [...(mainSeq.childTnLst ?? []), effect];
}
export function setEffectProperty(timing, effectPath, patch) {
    const located = nodeAtPath(timing, effectPath);
    if (!located)
        return;
    const node = located.node;
    const cTn = ooxml.getCTn(node);
    if (patch.trigger !== undefined) {
        applyEffectTrigger(timing, effectPath, patch.trigger);
    }
    if (patch.durationMs !== undefined) {
        cTn.dur = patch.durationMs;
        // propagateDuration 按比例缩放内层子树，不再覆写外层 cTn.dur（已是新值）。
        for (const c of cTn.childTnLst ?? []) {
            propagateDuration(c, patch.durationMs);
        }
    }
    if (patch.delayMs !== undefined) {
        cTn.delay = patch.delayMs;
    }
    if (patch.iterations !== undefined) {
        cTn.repeatCount = Math.max(1, patch.iterations) * 1000;
    }
    if (patch.autoReverse !== undefined) {
        cTn.autoRev = patch.autoReverse;
    }
    // §19.5.18 accel/decel：ST_PositiveFixedPercentage (0..100000, 1000=1%)。
    // 0 视为未设置（与 PowerPoint UI 行为一致），删除字段保持 OOXML round-trip 简洁。
    if (patch.accel !== undefined) {
        const v = clampAccelDecel(patch.accel);
        if (v <= 0)
            delete cTn.accel;
        else
            cTn.accel = v;
    }
    if (patch.decel !== undefined) {
        const v = clampAccelDecel(patch.decel);
        if (v <= 0)
            delete cTn.decel;
        else
            cTn.decel = v;
    }
    if (patch.spd !== undefined) {
        const s = patch.spd.trim();
        if (s === "" || s === "med" || s === "medium" || s === "normal")
            delete cTn.spd;
        else
            cTn.spd = s;
    }
    if (patch.presetSubtype !== undefined) {
        cTn.presetSubtype = patch.presetSubtype;
        // 方向变更必须重新展开内层子树：模板的 _subtypes 表里不同 subtype 对应不同
        // animEffect/anim 实现（如 wipe(up) ↔ wipe(down)）；只改外层 cTn.presetSubtype
        // 而不重新展开，会导致播放仍走原方向的子树。
        if (cTn.presetClass &&
            cTn.presetID !== undefined &&
            (cTn.presetClass === "entr" || cTn.presetClass === "exit" || cTn.presetClass === "emph" || cTn.presetClass === "path")) {
            const tpl = ooxml.findPresetTemplate(cTn.presetClass, cTn.presetID);
            if (tpl) {
                const tgtSpid = findFirstSpid(node);
                if (tgtSpid) {
                    const txEl = findFirstTxEl(node);
                    const expanded = ooxml.expandPresetTemplate(tpl, {
                        tgtSpid,
                        pRg: txEl?.pRg,
                        charRg: txEl?.charRg,
                        presetSubtype: patch.presetSubtype,
                        durMs: typeof cTn.dur === "number" ? cTn.dur : undefined,
                    });
                    reassignCTnIds(expanded, timing);
                    cTn.childTnLst = [expanded];
                    // 模板内部 leaf 的 dur 由模板自带（PPT 写出的默认值），用户先前若已
                    // 显式设置过 dur（cTn.dur），方向切换不应丢失，propagate 一次保持一致。
                    if (typeof cTn.dur === "number" && cTn.dur > 1) {
                        propagateDuration(expanded, cTn.dur);
                    }
                }
            }
        }
    }
}
function clampAccelDecel(v) {
    if (!Number.isFinite(v) || v <= 0)
        return 0;
    if (v > 100000)
        return 100000;
    return Math.round(v);
}
function findFirstSpid(node) {
    if (ooxml.isBehavior(node)) {
        return node.cBhvr.tgtEl?.spTgt?.spid;
    }
    if (ooxml.isContainer(node)) {
        for (const c of node.ctn.childTnLst ?? []) {
            const s = findFirstSpid(c);
            if (s)
                return s;
        }
    }
    return undefined;
}
function findFirstTxEl(node) {
    if (ooxml.isBehavior(node)) {
        return node.cBhvr.tgtEl?.spTgt?.txEl;
    }
    if (ooxml.isContainer(node)) {
        for (const c of node.ctn.childTnLst ?? []) {
            const t = findFirstTxEl(c);
            if (t)
                return t;
        }
    }
    return undefined;
}
function propagateDuration(node, durMs) {
    // 模板内多个 leaf 的 dur 通常不一样（例如 emph Teeter 由 6 段 animRot 串成）。
    // 直接把所有 leaf 都改成 durMs 会破坏内部时序——以 leaf 当前 dur 与原总时长的
    // 比例来等比缩放，可在保持子节点节奏的同时让总时长贴近用户期望。
    if (durMs <= 0)
        return;
    const origTotal = estimateContainerDuration(node);
    if (origTotal <= 0) {
        scaleDurations(node, durMs, 1);
        return;
    }
    scaleDurations(node, durMs, durMs / origTotal);
}
function estimateContainerDuration(node) {
    if (ooxml.isBehavior(node)) {
        const d = node.cBhvr.ctn.dur;
        return typeof d === "number" ? d : 0;
    }
    if (ooxml.isContainer(node)) {
        // 优先用 container 自带 cTn.dur（PPT 模板里 par/seq 通常带显式 dur），
        // 否则递归子节点取最大 leaf dur 作 fallback。
        const own = node.ctn.dur;
        if (typeof own === "number" && own > 1)
            return own;
        let maxDur = 0;
        for (const c of node.ctn.childTnLst ?? []) {
            const d = estimateContainerDuration(c);
            if (d > maxDur)
                maxDur = d;
        }
        return maxDur;
    }
    return 0;
}
function scaleDurations(node, targetMs, scale) {
    if (ooxml.isContainer(node)) {
        const cTn = node.ctn;
        if (typeof cTn.dur === "number" && cTn.dur > 1) {
            cTn.dur = Math.max(1, Math.round(cTn.dur * scale));
        }
        if (typeof cTn.delay === "number" && cTn.delay > 0) {
            cTn.delay = Math.max(0, Math.round(cTn.delay * scale));
        }
        for (const c of cTn.childTnLst ?? [])
            scaleDurations(c, targetMs, scale);
        return;
    }
    if (ooxml.isBehavior(node)) {
        const c = node.cBhvr.ctn;
        if (typeof c.dur === "number" && c.dur > 1) {
            c.dur = Math.max(1, Math.round(c.dur * scale));
        }
        if (typeof c.delay === "number" && c.delay > 0) {
            c.delay = Math.max(0, Math.round(c.delay * scale));
        }
    }
}
function normSpid(id) {
    return id.replace(/^sp_/, "");
}
/** 把 source shape 上的动画效果克隆到 target shape（Animation Painter）。 */
export function copyShapeAnimations(timing, sourceShapeId, targetShapeId) {
    const src = normSpid(sourceShapeId);
    const list = buildEffectList(timing).filter((e) => normSpid(e.targetShapeId ?? "") === src);
    let n = 0;
    for (const e of list) {
        if (e.presetClass === "custom" || e.presetClass === "media")
            continue;
        if (e.presetId === undefined)
            continue;
        insertEffect(timing, {
            targetShapeId: targetShapeId,
            presetClass: e.presetClass,
            presetId: e.presetId,
            presetSubtype: e.presetSubtype,
            trigger: e.trigger,
            durationMs: e.durationMs,
            delayMs: e.delayMs,
            paraRange: e.paraRange,
            charRange: e.charRange,
        });
        n++;
    }
    return n;
}
