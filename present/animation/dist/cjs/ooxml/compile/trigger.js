"use strict";
// nodeType / stCondLst 驱动 StepTrigger 与"用户驱动事件"判定。
// §19.5.20 cond.evt：这些事件都算用户驱动，不能进 onLoad 自动段。
// 主序列里的 onClick / onNext 仍是向前的单击（onNext = 请求下一状态）。
// interactiveSeq 按事件分开：单击、双击、悬停、移出、上一页、下一页。
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLICK_LIKE_EVTS = void 0;
exports.hasOnClick = hasOnClick;
exports.shapeClickTarget = shapeClickTarget;
exports.triggerOf = triggerOf;
exports.containsClick = containsClick;
const types_1 = require("../types");
exports.CLICK_LIKE_EVTS = new Set([
    "onClick",
    "onPrev",
    "onNext",
    "onMouseOver",
    "onMouseOut",
    "onDblClick",
]);
function hasOnClick(conds) {
    if (!conds)
        return false;
    return conds.some((c) => c.evt && exports.CLICK_LIKE_EVTS.has(c.evt));
}
function shapeClickTarget(conds) {
    if (!conds)
        return undefined;
    for (const c of conds) {
        if (c.evt && exports.CLICK_LIKE_EVTS.has(c.evt) && c.tgtEl?.spTgt?.spid) {
            return `sp_${c.tgtEl.spTgt.spid}`;
        }
    }
    return undefined;
}
function firstClickLike(conds) {
    if (!conds)
        return undefined;
    for (const c of conds) {
        if (c.evt && exports.CLICK_LIKE_EVTS.has(c.evt))
            return c.evt;
    }
    return undefined;
}
function gestureTrigger(evt, interactive) {
    if (evt === "onDblClick")
        return "onShapeDblClick";
    if (evt === "onMouseOver")
        return "onShapeHover";
    if (evt === "onMouseOut")
        return "onShapeMouseOut";
    if (evt === "onPrev")
        return "onPrev";
    if (interactive && evt === "onNext")
        return "onNext";
    if (evt === "onClick" || evt === "onNext")
        return interactive ? "onShapeClick" : "onClick";
    if (interactive && !evt)
        return "onShapeClick";
    return undefined;
}
// delay="indefinite" 是单击；同一 stCondLst 再写 onBegin 指向 mainSeq 时，
// 序列一开始这条就成立，PowerPoint / WPS 随页面自动起播，不再等单击。
function startsWhenSequenceBegins(node) {
    const conds = (0, types_1.getCTn)(node).stCondLst;
    if (!conds)
        return false;
    return conds.some((c) => (c.evt === "onBegin" || c.evt === "begin") && !!c.tn);
}
function triggerOf(node) {
    const cTn = (0, types_1.getCTn)(node);
    const interactive = cTn.nodeType === "interactiveSeq";
    if (interactive) {
        return gestureTrigger(firstClickLike(cTn.stCondLst), true) ?? "onShapeClick";
    }
    switch (cTn.nodeType) {
        case "clickEffect":
        case "clickPar":
        case "clickTn":
            return startsWhenSequenceBegins(node) ? "onLoad" : "onClick";
        case "withEffect":
        case "withGroup":
        case "withPar":
            return "withPrevious";
        case "afterEffect":
        case "afterGroup":
            return "afterPrevious";
        case "mainSeq":
        case "tmRoot":
        case "tnNode":
            return "onLoad";
        default: {
            return gestureTrigger(firstClickLike(cTn.stCondLst), false) ?? "withPrevious";
        }
    }
}
function containsClick(n) {
    const cTn = (0, types_1.getCTn)(n);
    if (cTn.nodeType === "interactiveSeq")
        return true;
    if ((cTn.nodeType === "clickEffect" ||
        cTn.nodeType === "clickPar" ||
        cTn.nodeType === "clickTn") &&
        !startsWhenSequenceBegins(n))
        return true;
    if (hasOnClick(cTn.stCondLst))
        return true;
    for (const c of (0, types_1.getChildren)(n))
        if (containsClick(c))
            return true;
    return false;
}
