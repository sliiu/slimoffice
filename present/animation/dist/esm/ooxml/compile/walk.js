// 把 TimeNode 树（容器 + 叶子）展开成 AtomInstance 数组，附带 offset。
//
// 容器同步语义按 ECMA-376 §19.5.18 cTn.nodeType + §19.5.30 par/seq/excl：
//   - par 容器普通子节点 → effective_start = parent_effective_start + own_delay
//   - seq 容器普通子节点 → effective_start = previous_sibling_effective_end + own_delay
//   - excl 容器          → 互斥：同一时刻只跑一个子节点。withEffect 也不允许重叠，
//                         线性放映下按 seq 排开（后一个起点 = 前一个终点）。
//   - nodeType ∈ {afterEffect, afterGroup}
//                         → effective_start = previous_sibling_effective_end + own_delay
//   - nodeType ∈ {withEffect, withGroup, withPar}
//                         → effective_start = chainAnchor + own_delay
//                         其中 chainAnchor = 最近一个 *非-with* 同辈的 effective_start。
//                         多个连续 with* 同辈共用同一个 anchor（PowerPoint UI 的
//                         "Start With Previous + delay" 是相对 chain head 起点的偏移，
//                         不是链式叠加到上一个 with-sibling 的起点）。
//
// walkInstances 入口里 `offset = baseOffset + own_delay`，所以父级只需要把"上一个
// sibling 的 start/end（不含本节点 own_delay）"作为 baseOffset 传入。
import { getCTn, getChildren, getSubChildren, isBehavior, isContainer, isMedia, } from "../types.js";
import { accelDecelEasing } from "../easing.js";
import { compileLeaf } from "./leaf.js";
import { expandIterateSlices, shouldPrependShapeBgSlice, withTgtEl, } from "./iterate.js";
import { condDelay, msOf, presetChildrenAreOpacityPlaceholder } from "./helpers.js";
import { parseTmFilter, resolveIterations, resolveSpdRatio, spdReverses } from "./timing-prop.js";
export function walkInstances(node, ctx, out, baseOffset, parentIterate, onEnd, ancestorEntrExitPreset, ancestorFill, rootAbsStartMs, isSubAnchor, isStepRoot, 
// §19.5.18 cTn@spd: 祖先链上的累积速度倍率（乘积）。leaf 编译时把它叠加到自身 spd
// 上得到最终 duration 倍率。1 = 默认；不带 spd 时透传 1。
ancestorSpdRatio = 1, ancestorReverse = false, 
// §19.5.18 cTn@accel/@decel/@tmFilter 写在 effect 容器上，不在内部 anim 上。
// 叶子自己没有时间滤镜时用最近一层祖先的，否则 Smooth Start/End 被丢成线性。
ancestorEasing) {
    const cTn = getCTn(node);
    // step 根节点：own_delay 已被 step.delay 吸收（emit.buildStep 用同一 stCondLst 写
    // step.delay），所以这里不再把入口节点自己的 own_delay 加到 atom.offset，避免
    // 出现 step.delay + atom.offset 重复 own_delay 的情况。
    // §19.5.18 cTn.delay + cond.delay：仅在递归子层累加 own_delay。
    // isSubAnchor=true: 节点的绝对触发时间已被父调用解析进 baseOffset（subTnLst 锚点）；
    // 这里只看 cTn.delay 数字部分，避免 tn 引用被双重累加。
    let own;
    if (isStepRoot) {
        own = 0;
    }
    else if (isSubAnchor) {
        own = msOf(cTn.delay) / 1000;
    }
    else {
        own = (msOf(cTn.delay) + condDelay(cTn.stCondLst, ctx.tnIndex)) / 1000;
    }
    const offset = baseOffset + own;
    // §19.5.37 iterate stepMs 计算需要"容器整体 dur"——容器本身常常没显式 cTn.dur，
    // dur 只在子叶子上（set=1ms, anim=800ms, animEffect=800ms 等）。这里在节点上首次
    // 看到 iterate 时，扫描所有后代 leaf 取最大 cTn.dur 作为 baseDurMs，注入 iterate
    // 副本随递归向下传递。这样 expandIterateSlices 才能算出正确的 word/letter 步进，
    // 不会被 set leaf 的 1ms 拖到接近 0。
    let iterate = cTn.iterate ?? parentIterate;
    if (cTn.iterate && iterate && iterate.baseDurMs === undefined) {
        const maxLeafDurMs = collectMaxLeafDurMs(node);
        if (maxLeafDurMs > 0)
            iterate = { ...iterate, baseDurMs: maxLeafDurMs };
    }
    // §19.5.18 cTn.fill 沿父链继承：若本节点有 fill 则覆盖，否则透传父级。
    const inheritedFill = cTn.fill ?? ancestorFill;
    // §19.5.18 cTn.spd 累积：本节点 spd × 祖先链 spd（乘积）。容器节点的 spd 影响所有
    // 后代 leaf 的 duration。step 根节点的 spd 已由 buildStep 走到这里，正常累积即可。
    const nodeSpd = resolveSpdRatio(cTn.spd);
    const effectiveSpdRatio = nodeSpd > 0 ? ancestorSpdRatio * nodeSpd : ancestorSpdRatio;
    const childReverse = ancestorReverse !== spdReverses(cTn.spd);
    const ownEasing = parseTmFilter(cTn.tmFilter) ?? accelDecelEasing(cTn.accel, cTn.decel);
    const childEasing = isContainer(node) ? (ownEasing ?? ancestorEasing) : ancestorEasing;
    // §19.5.18 subTnLst：附加子时序，stCondLst 通常含 evt+tn 引用绝对触发时间。
    // 编译时把绝对时间转换为相对 step root 起点的偏移。compile 入口 (emit.buildStep)
    // 传入 rootAbsStartMs；递归层透传。
    let rootAbsMs = rootAbsStartMs;
    if (rootAbsMs === undefined && cTn.id && ctx.tnIndex) {
        rootAbsMs = ctx.tnIndex.get(cTn.id)?.start ?? 0;
    }
    if (isContainer(node)) {
        let propagated = ancestorEntrExitPreset;
        // entrance / exit / emphasis 三类 preset 都需要传下去：shouldPrependShapeBgSlice
        // 用它判断要不要为整 shape 多 emit 一个 slice（animBg=1 时 shape+letters 同步动画）。
        // path preset 不参与 iterate 拆分，跳过即可。
        if (cTn.presetClass &&
            cTn.presetID !== undefined &&
            (cTn.presetClass === "entr" || cTn.presetClass === "exit" || cTn.presetClass === "emph")) {
            propagated = {
                presetClass: cTn.presetClass,
                presetID: cTn.presetID,
                presetSubtype: cTn.presetSubtype,
                durMs: msOf(cTn.dur),
                opacityPlaceholder: presetChildrenAreOpacityPlaceholder(node),
            };
        }
        // §19.5.18 容器 repeatCount / repeatDur：整个容器内的时序作为一个 cycle 重复 N 次。
        // 仅在容器自身（非 step 根，因为 step 根用 step.iterations 处理）应用；finite N
        // 通过展开 cycle 实现。indefinite 不展开：子 atom 记 repeatPeriod，运行时按周期
        // 重复，step 保持活跃直到下一次 click / 切页。
        const containerIter = !isStepRoot && (cTn.repeatCount !== undefined || cTn.repeatDur !== undefined)
            ? resolveIterations(cTn, 0)
            : 1;
        const indefiniteContainer = !Number.isFinite(containerIter);
        const cycles = indefiniteContainer ? 1 : Math.max(1, Math.round(containerIter));
        // §19.5.18 容器 autoRev（PowerPoint 把 "Auto-reverse" 写在 effect 级 cTn 上）：
        // 每轮前向后原路倒放。倒放由 leaf atom.autoReverse 表达 —— 对单 leaf / 同跨度
        // leaf 精确；leaf 早于容器结束时倒放会提前开始（atom 模型无法表达中间停顿）。
        const containerAutoRev = !isStepRoot && !!cTn.autoRev;
        let cycleBase = offset;
        let cursor = offset;
        for (let it = 0; it < cycles; it++) {
            // 每一轮循环：children 起点重置到 cycleBase，cycle 内累加 cycleEnd。
            const cycleStart = cycleBase;
            const cycleAtomStart = out.length;
            let cycleEnd = cycleStart;
            let lastChildStart = cycleStart;
            const isSeqLike = node.kind === "seq" || node.kind === "excl";
            let chainAnchor = cycleStart; // 最近一个非-with 同辈的 effective_start
            for (const c of getChildren(node)) {
                const childNodeType = getCTn(c).nodeType;
                const isWith = childNodeType === "withEffect" ||
                    childNodeType === "withGroup" ||
                    childNodeType === "withPar";
                const isAfter = childNodeType === "afterEffect" || childNodeType === "afterGroup";
                let childBase = cycleStart;
                if (isAfter) {
                    childBase = cycleEnd;
                }
                else if (isWith && node.kind !== "excl") {
                    childBase = chainAnchor;
                }
                else if (isSeqLike) {
                    childBase = cycleEnd;
                }
                const childOwnDelay = (msOf(getCTn(c).delay) + condDelay(getCTn(c).stCondLst, ctx.tnIndex)) /
                    1000;
                lastChildStart = childBase + childOwnDelay;
                if (!isWith)
                    chainAnchor = lastChildStart;
                walkInstances(c, ctx, out, childBase, iterate, (end) => {
                    if (end > cycleEnd)
                        cycleEnd = end;
                }, propagated, inheritedFill, rootAbsMs, undefined, undefined, 
                // §19.5.18 spd 累积：本容器自身 spd 已经折进 effectiveSpdRatio，
                // 子节点继续相乘。
                effectiveSpdRatio, childReverse, childEasing);
            }
            if (containerAutoRev) {
                for (let i = cycleAtomStart; i < out.length; i++)
                    out[i].atom.autoReverse = true;
                cycleEnd = cycleStart + 2 * (cycleEnd - cycleStart);
            }
            if (indefiniteContainer) {
                const period = cycleEnd - cycleStart;
                if (period > 0) {
                    for (let i = cycleAtomStart; i < out.length; i++) {
                        const atom = out[i].atom;
                        atom.repeatPeriod = period;
                        atom.iterations = Infinity;
                    }
                }
            }
            cycleBase = cycleEnd;
            cursor = cycleEnd;
        }
        onEnd(cursor);
        // §19.5.18 subTnLst：本容器的附加时序节点。它们的 stCondLst 通常引用 tn id
        // 表达"另一节点 begin/end 时触发"——这是绝对时间事件。把绝对时间转成 step
        // 内相对 offset：abs_event_ms - rootAbsMs。leaf 自己仍按 walkInstances 入口
        // 处理（cTn.delay + condDelay），所以我们用一个"虚拟容器"把每个 sub 节点
        // 锚定到 rootAbsMs，让递归调用结果直接落在正确相对时刻。
        const subChildren = getSubChildren(node);
        if (subChildren.length > 0 && ctx.tnIndex) {
            for (const sc of subChildren) {
                const scCTn = getCTn(sc);
                const evt = scCTn.stCondLst?.[0];
                const scId = scCTn.id;
                // 优先使用 scCTn.id 的 tnIndex 绝对 start；再 fallback 到 stCondLst tn 引用解析。
                let absMs = scId ? ctx.tnIndex.get(scId)?.start : undefined;
                if (absMs === undefined && evt?.tn) {
                    const e = ctx.tnIndex.get(evt.tn);
                    if (e)
                        absMs = evt.evt === "end" || evt.evt === "onEnd" ? e.end : e.start;
                }
                if (absMs === undefined)
                    continue;
                const subBase = (absMs - (rootAbsMs ?? 0)) / 1000;
                walkInstances(sc, ctx, out, subBase, iterate, (end) => {
                    if (end > cursor)
                        cursor = end;
                    onEnd(end);
                }, propagated, inheritedFill, rootAbsMs, true, undefined, effectiveSpdRatio, childReverse, childEasing);
            }
        }
        return;
    }
    if (isBehavior(node) || isMedia(node)) {
        // walk-local copy: 后续可能改写 (childStyle redirect)；保留原始 node 引用不动。
        let tgtEl = isMedia(node) ? node.cMediaNode.tgtEl : node.cBhvr.tgtEl;
        // §19.5.18 cBhvr@override="childStyle"：set 应只施加在 shape 的"子样式"上——
        // PowerPoint UI 中的 "After Animation: Hide" / "Change Color" 等 after-effect
        // 把 style.visibility=hidden 写到整 shape，语义其实是"只改文字/前景部分，矩形
        // 背景应保留"。这种 set 不再走 iterate 拆分，也不参与 animBg 的整 shape prepend；
        // 直接把 tgtEl 套上空 txEl，makeResolver 会解析到 sp_N_text 而非整 sp_N。
        const isChildStyleOverride = isBehavior(node) &&
            node.cBhvr.override === "childStyle" &&
            !!tgtEl.spTgt &&
            !tgtEl.spTgt.txEl;
        if (isChildStyleOverride) {
            tgtEl = { ...tgtEl, spTgt: { ...tgtEl.spTgt, txEl: {} } };
        }
        // §19.5.37 iterate：每个 letter/word 独立做整套 entrance/emph（含 transform）。
        // CharRangeAnimatable / ParagraphAnimatable 已支持 tx/ty/scale/rotation override，
        // 切到字符即可，无需区分 attr 类型。childStyle override 例外：它是一次性的整段
        // 文字属性切换（PowerPoint "After Animation"），不应被 iterate 拆成 N 份。
        let slices = iterate && !isChildStyleOverride ? expandIterateSlices(iterate, tgtEl, cTn, ctx) : null;
        // §19.5.4 bldP@animBg=1 + iterate + entrance/emph：
        //   除了让每个 letter 做一遍 transform，还要让整 shape 本体一并 fly/spin/zoom
        //   （"animate background" on）；prepend 一个 whole-shape slice 让 SceneNode 整体
        //   也参与同步动画。animBg=0 时不 prepend，整 shape 不动、只字母动（PowerPoint
        //   "animate background" off 行为）。childStyle override 例外：它本身就只针对文字
        //   子层级，不能再追加整 shape slice，否则会把矩形背景一并隐藏。
        if (slices &&
            slices.length > 0 &&
            !isChildStyleOverride &&
            shouldPrependShapeBgSlice(ancestorEntrExitPreset?.presetClass, tgtEl, cTn.grpId, ctx)) {
            const stepMs = slices[0].stepMs;
            const wholeTgt = { ...tgtEl, spTgt: { ...tgtEl.spTgt, txEl: undefined } };
            slices = [{ tgtEl: wholeTgt, stepMs }, ...slices];
        }
        if (slices && slices.length > 0) {
            for (let i = 0; i < slices.length; i++) {
                const { tgtEl: subTgt, stepMs } = slices[i];
                const target = ctx.resolve(subTgt);
                if (!target)
                    continue;
                const cloned = withTgtEl(node, subTgt);
                const atom = compileLeaf(cloned, target, ctx, iterate, ancestorEntrExitPreset, ancestorFill, 
                // §19.5.18: leaf 自身 spd 与祖先链累积 spd 相乘后再应用到 duration。
                effectiveSpdRatio, ancestorReverse, childEasing);
                if (!atom)
                    continue;
                const sliceOffset = offset + (i * stepMs) / 1000;
                out.push({ atom, offset: sliceOffset });
                onEnd(sliceOffset + atom.duration * atom.iterations * (atom.autoReverse ? 2 : 1));
            }
            return;
        }
        const target = ctx.resolve(tgtEl);
        if (!target)
            return;
        const atom = compileLeaf(node, target, ctx, iterate, ancestorEntrExitPreset, ancestorFill, effectiveSpdRatio, ancestorReverse, childEasing);
        if (!atom)
            return;
        out.push({ atom, offset });
        onEnd(offset + atom.duration * atom.iterations * (atom.autoReverse ? 2 : 1));
    }
}
// 取 node 及其后代里 leaf cTn.dur 的最大值（ms）。容器节点自己不算（容器极少在 cTn.dur
// 上写值；即便写也会被这里的 max 一并覆盖）。
function collectMaxLeafDurMs(root) {
    let max = 0;
    const visit = (n) => {
        if (isBehavior(n) || isMedia(n)) {
            const d = msOf(getCTn(n).dur);
            if (d > max)
                max = d;
            return;
        }
        for (const c of getChildren(n))
            visit(c);
        for (const c of getSubChildren(n))
            visit(c);
    };
    visit(root);
    return max;
}
