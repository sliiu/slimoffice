// §19.5.37 iterate 把目标文本切分为 spTgt.txEl 片段并错开偏移。
// iterate 仅在原 tgtEl 指定的范围内拆分；如果 tgtEl.txEl.pRg/charRg 已限定段或字符范围，
// 必须仅对该范围内拆分，否则一次 emphasis 会扩散到整个 shape 的所有段落/字符。
import { isBehavior, isMedia } from "../types.js";
import { msOf } from "./helpers.js";
import { buildBuildIndex, findBuild } from "./builds.js";
// PowerPoint "Effect Options → Animate text → By letter / By word" 语义（§19.5.37 iterate）：
// 每个字母/词独立、错开启动地执行**整套 entrance/emph**——包括 transform（rotation/tx/ty/scale）
// 和样式（opacity/color/font*）。CharRangeAnimatable/ParagraphAnimatable 自带 tx/ty/scale/rotation
// override，渲染端会把每个字母 wrap 在独立 g 里加 transform；所以这里把所有 prop track
// 都按 iterate slice 拆即可——不需要按 attr 类型区分 char-level / shape-level。
//
// 反例（之前的错误）：把 rotation/tx/ty/scale 排除在切分之外让整 shape 转一次，会与
// PowerPoint 行为偏差：渐变式缩放（entr 53）by letter 时整 shape 整体缩放、文字跟着走，
// 实际 PowerPoint 是每个字母独立从 scale 0 飞到 1，错开启动。
//
// 整 shape 也要参与动画的情形由 bldP@animBg=1 控制：那种情况 walk 会额外 prepend 一个
// whole-shape slice，让 shape 本体跟 letter 同步做一次完整 transform（见
// shouldPrependShapeBgSlice）。
export function expandIterateSlices(iterate, tgtEl, cTn, ctx) {
    const spid = tgtEl.spTgt?.spid;
    if (!spid)
        return null;
    if (!ctx.getTextSlices)
        return null;
    const all = ctx.getTextSlices(spid, iterate.type);
    if (all.length === 0)
        return null;
    const basePRg = tgtEl.spTgt?.txEl?.pRg;
    const baseCharRg = tgtEl.spTgt?.txEl?.charRg;
    const slices = all.filter((sl) => {
        if (basePRg) {
            const p = sl.pRg?.st ?? -1;
            if (p < basePRg.st || p > basePRg.end)
                return false;
        }
        if (baseCharRg && sl.charRg) {
            if (sl.charRg.st < baseCharRg.st || sl.charRg.end > baseCharRg.end)
                return false;
        }
        return true;
    });
    if (slices.length === 0)
        return null;
    // §19.5.37 iterate 的"基础 dur"是 iterate 所属容器的 effective dur，不是 leaf 自己的
    // cTn.dur。walk.ts 进入带 iterate 的容器时把容器子叶子最大 dur 存进 iterate.baseDurMs，
    // 这里优先用它；只有缺失（极少见，例如 leaf 直接挂 iterate 容器外）时才回落叶子 dur。
    // 修复 set leaf cTn.dur=1ms × tmPct=30000 → 0.3ms 这种荒谬步进。
    const leafDur = msOf(cTn.dur) || 0;
    const durMs = iterate.baseDurMs ?? leafDur;
    let stepMs;
    // §19.5.37 iterate 步进时间：
    //   tmAbs 显式（ms）→ 直接采用
    //   tmPct 显式（千分比，% of dur）→ 按比例换算
    //   都缺省 → PowerPoint 默认 10% of dur（≠ dur/N，PowerPoint 行为是固定百分比）
    if (iterate.tmAbs !== undefined)
        stepMs = iterate.tmAbs;
    else if (iterate.tmPct !== undefined)
        stepMs = (iterate.tmPct / 100000) * durMs;
    else
        stepMs = durMs * 0.1;
    const baseSpTgt = tgtEl.spTgt;
    const order = iterate.backwards ? slices.slice().reverse() : slices;
    const out = order.map((sl) => ({
        tgtEl: {
            ...tgtEl,
            spTgt: {
                ...baseSpTgt,
                txEl: { ...(baseSpTgt.txEl ?? {}), pRg: sl.pRg, charRg: sl.charRg },
            },
        },
        stepMs,
    }));
    return out;
}
// §19.5.4 bldP@animBg=1：iterate 拆字符时，shape 本体作为额外的第 0 个 slice 一并参与
// 动画（PowerPoint "Fly in by letter" + animate background 行为）。缺失这一 slice 会
// 导致 shape 不 fly/不 spin，只有文字飞入/旋转。
//
// 在 entrance / emphasis / exit 三类 preset 上都 prepend（animBg=1 时）：
//   - entrance: shape + letters 同步入场，与 PowerPoint Fly in by letter+animBg 一致
//   - emphasis: shape + letters 同步强调（如 Spin by letter+animBg：整 shape 同时旋转）
//   - exit:    shape + letters 同步离场——例如 Faded Zoom exit by letter+animBg=1，
//              不只是字母淡出缩小，整个椭圆/矩形也应一起 fade 消失。否则 step 末态
//              只有文字隐藏、shape 背景残留（见 quicktour slide 6 sp_4 Faded Zoom exit
//              对照 PowerPoint 导出 baseline：shape 必须完全消失）。
//              注：旧 Animations 用例 baseline 还停留在"shape 残留可见"的历史行为，
//              已记 todo `update-baseline-stale`，新行为以 PowerPoint 真值为准。
//   - path:    motion path 本身就是整 shape 行为，prepend 会重复一次相同 atom，跳过。
export function shouldPrependShapeBgSlice(presetClass, tgtEl, cTnGrpId, ctx) {
    if (presetClass !== "entr" && presetClass !== "emph" && presetClass !== "exit")
        return false;
    const spid = tgtEl.spTgt?.spid;
    if (!spid)
        return false;
    if (tgtEl.spTgt?.txEl?.pRg || tgtEl.spTgt?.txEl?.charRg)
        return false;
    if (!ctx.builds || ctx.builds.length === 0)
        return false;
    const buildIdx = ctx.buildIndex ?? buildBuildIndex(ctx.builds);
    ctx.buildIndex = buildIdx;
    const spec = findBuild(buildIdx, `sp_${spid}`, cTnGrpId);
    return !!spec?.animBg;
}
export function withTgtEl(node, tgtEl) {
    if (isMedia(node)) {
        return { ...node, cMediaNode: { ...node.cMediaNode, tgtEl } };
    }
    if (isBehavior(node)) {
        const b = node;
        const cBhvr = { ...b.cBhvr, tgtEl };
        return { ...b, cBhvr };
    }
    return node;
}
