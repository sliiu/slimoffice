"use strict";
// 形状级 [TURN SCOPE] 兜底守卫。
//
// 背景：chat 的 [TURN SCOPE] 系统消息只能"软性"约束模型；实战中用户选了
// slide 1 的某一个 shape（比如 "BG overlay"）让 AI 改透明度，模型常常会把
// deck 里所有同名/同类 shape 一并改掉（推断"用户想全 deck 一致"）。本守卫
// 在工具适配层做最后一道硬阻断：只要 port.getSelectedShapeIds() 非空，所有
// shapeScoped 工具都必须把 shapeId / shapeIds 限定到这个集合内，否则调用
// 直接以 ok:false 失败，错误信息里把允许范围一并报回模型让它自我纠偏。
//
// 关键约束：
//   - 仅当选区非空时启用；否则沿用"slideIdx 范围 + 模型自决"流程。
//   - 仅守卫"按 id 改既有 shape"的工具（ToolDef.shapeScoped=true）；
//     insertShape / setSlideBackground 等不传 shapeId 的工具不受影响。
//   - 多 shape 工具（groupShapes / alignShapes）的每个 id 都必须在选区内。
//   - 用户若说"all shapes"，仍受守卫拦截 —— 模型应在 recap 里告知用户
//     "只改了选中的那个，需要全 deck 请先清掉选区"。这是有意识的取舍：
//     相对"AI 全 deck 静默漂移"，让 AI 出错一次再恢复好得多。
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertShapeInScope = assertShapeInScope;
exports.extractShapeTarget = extractShapeTarget;
function assertShapeInScope(port, target) {
    const selected = port.getSelectedShapeIds();
    if (selected.length === 0)
        return null;
    const selectedSet = new Set(selected);
    const violators = [];
    if (typeof target.shapeId === "string" && !selectedSet.has(target.shapeId)) {
        violators.push(target.shapeId);
    }
    if (Array.isArray(target.shapeIds)) {
        for (const id of target.shapeIds) {
            if (typeof id === "string" && !selectedSet.has(id))
                violators.push(id);
        }
    }
    if (violators.length === 0)
        return null;
    const allowedList = [...selectedSet].map((id) => `"${id}"`).join(", ");
    const blockedList = violators.map((id) => `"${id}"`).join(", ");
    return {
        ok: false,
        error: `BLOCKED by [TURN SCOPE]: shape id(s) ${blockedList} are NOT in the user's selection. ` +
            `The user pinned exactly these shape id(s) for this turn: [${allowedList}]. ` +
            `Only mutate that exact set — even if other slides have shapes with the same NAME ` +
            `(e.g. "BG overlay" / "Title" appear on every slide, but the user picked ONE instance). ` +
            `If the user truly wants a deck-wide change, ask them to deselect first OR call a deck-wide tool ` +
            `(applyTheme / generateAndApplyTheme / fillImagePlaceholders / applyMainstreamAnimations without slideIdx). ` +
            `Recover by re-issuing this call with shapeId set to one of [${allowedList}], or surface the limitation in your recap.`,
    };
}
/** 从任意工具入参里抽出 shapeId / shapeIds 字段（适配器统一调用）。 */
function extractShapeTarget(args) {
    const a = (args ?? {});
    const target = {};
    if (typeof a.shapeId === "string")
        target.shapeId = a.shapeId;
    if (Array.isArray(a.shapeIds)) {
        target.shapeIds = a.shapeIds.filter((x) => typeof x === "string");
    }
    return target;
}
