// 构建 cTn id → 绝对时间 (start, end) 映射。
// par 同步开始；seq 累加；afterPrevious 接前一个；withPrevious 与同辈起点对齐。
// 容器自身 dur 优先；缺省时取子节点 max end - start。
import { getCTn, getChildren, isContainer, } from "../types.js";
import { condDelay, msOf } from "./helpers.js";
export function buildTnIndex(timing) {
    // §19.5.20 cond.tn 引用其他节点的 begin/end：第一轮 walkTn 时 tnIndex 还空，
    // 所有 cond.tn 引用都被当作 0；这会让"依赖链"上的后续节点 start/end 偏小。
    // 解决：不动点迭代——把上一轮结果作为 tnIndex 输入再走一遍，直到 map 不再变化
    // 或达到 max 迭代数（保险，防止环引用导致死循环）。
    let prev = new Map();
    for (let iter = 0; iter < 4; iter++) {
        const out = new Map();
        for (const r of timing.tnLst)
            walkTn(r, 0, out, prev);
        if (sameIndex(out, prev))
            return out;
        prev = out;
    }
    return prev;
}
function sameIndex(a, b) {
    if (a.size !== b.size)
        return false;
    for (const [k, va] of a) {
        const vb = b.get(k);
        if (!vb)
            return false;
        if (vb.start !== va.start || vb.end !== va.end)
            return false;
    }
    return true;
}
export function walkTn(node, base, out, 
// §19.5.20 上一轮 tnIndex（不动点迭代时用），让 cond.tn 引用前向节点也能解析。
refIndex) {
    const cTn = getCTn(node);
    const own = msOf(cTn.delay) + condDelay(cTn.stCondLst, refIndex);
    const start = base + own;
    let end = start + msOf(cTn.dur);
    if (isContainer(node)) {
        const children = getChildren(node);
        let cursor = start;
        let maxEnd = start;
        let lastChildStart = start;
        const isSeqLike = node.kind === "seq" || node.kind === "excl";
        let chainAnchor = start;
        for (const c of children) {
            const ct = getCTn(c).nodeType;
            // 与 walk.ts 一致：afterEffect → 上一个 end；withEffect → chainAnchor（最近一个
            // 非-with 同辈的 effective_start）；其它 par 默认 = parent start，seq/excl 默认 = 上一个 end。
            const isWith = ct === "withEffect" || ct === "withGroup" || ct === "withPar";
            const isAfter = ct === "afterEffect" || ct === "afterGroup";
            let childBase = start;
            if (isAfter) {
                childBase = cursor;
            }
            else if (isWith) {
                childBase = chainAnchor;
            }
            else if (isSeqLike) {
                childBase = cursor;
            }
            lastChildStart =
                childBase + msOf(getCTn(c).delay) + condDelay(getCTn(c).stCondLst, refIndex);
            if (!isWith)
                chainAnchor = lastChildStart;
            const ce = walkTn(c, childBase, out, refIndex);
            if (ce.end > maxEnd)
                maxEnd = ce.end;
            cursor = ce.end;
        }
        // 容器显式 dur 是"至少这么长"（padding / hold）；子树实际跨度更长时必须
        // 用 maxEnd，否则 afterPrevious 会按短 dur 起算、时间轴和播放对不上。
        // 典型：编辑器 insertEffect 给 inner preset par 写了 default 500ms，但
        // fly-in 等模板叶子仍是 2000ms —— 旧逻辑只信 cTn.dur，第二条 afterEffect
        // 会画在 0.5s 而第一条 bar 已经拉到 2.0s。
        end = Math.max(end, maxEnd);
    }
    // §19.5.18 cTn.repeatCount/repeatDur 影响节点 end 时间。
    if (typeof cTn.repeatCount === "number" && cTn.repeatCount > 0) {
        end = start + (end - start) * Math.max(1, cTn.repeatCount / 1000);
    }
    else if (typeof cTn.repeatDur === "number" && cTn.repeatDur > 0) {
        end = start + cTn.repeatDur;
    }
    if (cTn.id)
        out.set(cTn.id, { start, end });
    return { start, end };
}
