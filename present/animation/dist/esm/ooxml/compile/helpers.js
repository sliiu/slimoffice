// Shared low-level helpers reused across compile/*.
// All exports stay internal to the @sliiu/present-animation package.
import { bySplineEasing } from "../easing.js";
import { resolveAnimColor } from "../color.js";
import { evalExpr } from "../expr.js";
import { lookupAttr } from "../attr-map.js";
import { getChildren, isBehavior, isContainer, isMedia, } from "../types.js";
let _id = 0;
export const genId = (p) => `${p}${++_id}`;
export function msOf(d) {
    if (typeof d !== "number")
        return 0;
    return d;
}
export function condDelay(conds, tnIndex) {
    if (!conds)
        return 0;
    for (const c of conds) {
        // §19.5.20 cond.tn + evt=begin/end：tn 优先表示"事件源"，cond.delay 表示
        // 事件触发后再延迟 N ms（默认 0）。两者并存时为：abs(event) + delay。
        if (c.tn && tnIndex) {
            const entry = tnIndex.get(c.tn);
            if (entry) {
                const extra = typeof c.delay === "number" ? c.delay : 0;
                if (c.evt === "begin" || c.evt === "onBegin")
                    return entry.start + extra;
                if (c.evt === "end" || c.evt === "onEnd")
                    return entry.end + extra;
            }
        }
        // 纯延迟（无 tn 引用）：单独的 ms 数字。
        if (typeof c.delay === "number")
            return c.delay;
    }
    return 0;
}
export function decodeAnimVal(v, kind, decode, 
// §20.1.2 schemeClr / sysClr 解析需要主题配色表；缺省时 scheme color 会落到 #000000。
// 调用方（如 compileSet/compileAnim）应把 CompileCtx.colorCtx 透传到这里。
colorCtx) {
    switch (v.kind) {
        case "bool":
            return v.val;
        case "int":
        case "flt":
            return v.val;
        case "clr":
            return resolveAnimColor(v.val, colorCtx) ?? "#000000";
        case "str":
        default:
            return decode(v.val);
    }
    void kind;
}
export function decodeTavValue(t, kind, decode, ctx) {
    // §19.5.71 fmla 优先于 val。含 $ 的公式表示整段行为的进度曲线，由 compileAnim
    // 按 0→1 采样，不经过这里；此处只处理把 $ 当作本帧 tm 的公式。
    if (t.fmla !== undefined) {
        const tmPct = typeof t.tm === "number" ? t.tm / 100000 : 0;
        const v = evalExpr(t.fmla, { ...ctx, extra: { $: tmPct } });
        if (Number.isFinite(v))
            return v;
    }
    if (t.val)
        return decodeAnimVal(t.val, kind, decode, ctx.colorCtx);
    return undefined;
}
// keyframe-level easing：tav.bySpline 优先于父级 (cTn.accel/decel)。
export function tavEasing(t, parentEasing) {
    return bySplineEasing(t.bySpline) ?? parentEasing;
}
export function leafDefaultDuration(node) {
    if (node.kind === "set" || node.kind === "cmd")
        return 1;
    if (node.kind === "animEffect")
        return 500;
    return 500;
}
function animIsOpacityOnlyChannel(node) {
    const names = node.cBhvr.attrNameLst ?? [];
    if (names.length === 0)
        return false;
    for (const n of names) {
        const spec = lookupAttr(n);
        if (!spec || spec.property !== "opacity")
            return false;
    }
    return true;
}
// PowerPoint 把「闪一下 / 换一帧」写成 style.visibility 的 discrete tav
// （hidden ↔ visible）。这是文件里的时间轴，不是编辑器没展开的透明度占位。
function isAuthoredVisibilitySequence(node) {
    const names = node.cBhvr.attrNameLst ?? [];
    if (!names.includes("style.visibility"))
        return false;
    for (const t of node.tavLst ?? []) {
        const v = t.val;
        if (v?.kind !== "str")
            continue;
        const s = v.val.toLowerCase();
        if (s === "hidden" || s === "visible")
            return true;
    }
    return false;
}
function isVisibilityOrOpacitySet(node) {
    if (node.kind !== "set")
        return false;
    const names = node.cBhvr.attrNameLst ?? [];
    return names.length > 0 && names.every((n) => n === "style.visibility" || n === "style.opacity");
}
/**
 * 编辑器在没有样本时写出的占位：可见性 set + 一条透明度 anim。
 * 旁边已经有位移 / 滤镜 / 缩放时返回 false，那些叶子按文件里的树播放。
 */
export function presetChildrenAreOpacityPlaceholder(node) {
    if (!isContainer(node))
        return false;
    let sawOpacityAnim = false;
    let foreign = false;
    const visit = (n) => {
        if (isMedia(n)) {
            foreign = true;
            return;
        }
        if (isBehavior(n)) {
            if (n.kind === "anim" && isAuthoredVisibilitySequence(n)) {
                foreign = true;
                return;
            }
            if (n.kind === "anim" && animIsOpacityOnlyChannel(n)) {
                sawOpacityAnim = true;
                return;
            }
            if (isVisibilityOrOpacitySet(n))
                return;
            foreign = true;
            return;
        }
        if (isContainer(n)) {
            for (const c of getChildren(n))
                visit(c);
        }
    };
    for (const c of getChildren(node))
        visit(c);
    return sawOpacityAnim && !foreign;
}
/** Appear / Disappear 与叶子 opacity 组合时仍走叶子语义，避免与预设表冲突。 */
export function shouldDelegateAnimToParPreset(inh, node) {
    if (inh.presetClass !== "entr" && inh.presetClass !== "exit")
        return false;
    if (inh.presetClass === "entr" && inh.presetID === 1)
        return false;
    if (inh.presetClass === "exit" && inh.presetID === 1)
        return false;
    if (inh.opacityPlaceholder === false)
        return false;
    return animIsOpacityOnlyChannel(node);
}
