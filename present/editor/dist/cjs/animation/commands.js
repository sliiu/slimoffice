"use strict";
// 动画编辑命令 — 走 CommandStack 的 EditCommand 接口。
// 实现策略：每个命令在 apply 时直接修改 slide.ooxmlTiming（深拷贝前后差异以便 revert）。
Object.defineProperty(exports, "__esModule", { value: true });
exports.CopyShapeAnimationsCmd = exports.SetAnimTriggerCmd = exports.SetAnimEffectPropCmd = exports.MoveAnimEffectCmd = exports.RemoveAnimEffectCmd = exports.AddAnimEffectCmd = void 0;
const store_1 = require("./store");
function slideAt(pres, idx) {
    return pres.slides[idx];
}
function cloneTiming(timing) {
    if (!timing)
        return undefined;
    return JSON.parse(JSON.stringify(timing));
}
class AddAnimEffectCmd {
    slideIdx;
    args;
    label = "Add Animation";
    before;
    constructor(slideIdx, args) {
        this.slideIdx = slideIdx;
        this.args = args;
    }
    apply(pres) {
        const slide = slideAt(pres, this.slideIdx);
        if (!slide)
            return;
        this.before = cloneTiming(slide.ooxmlTiming);
        const timing = (0, store_1.ensureTiming)(slide);
        (0, store_1.insertEffect)(timing, this.args);
    }
    revert(pres) {
        const slide = slideAt(pres, this.slideIdx);
        if (!slide)
            return;
        slide.ooxmlTiming = this.before ? cloneTiming(this.before) : undefined;
    }
}
exports.AddAnimEffectCmd = AddAnimEffectCmd;
class RemoveAnimEffectCmd {
    slideIdx;
    path;
    label = "Remove Animation";
    before;
    constructor(slideIdx, path) {
        this.slideIdx = slideIdx;
        this.path = path;
    }
    apply(pres) {
        const slide = slideAt(pres, this.slideIdx);
        if (!slide || !slide.ooxmlTiming)
            return;
        this.before = cloneTiming(slide.ooxmlTiming);
        (0, store_1.removeEffect)(slide.ooxmlTiming, this.path);
    }
    revert(pres) {
        const slide = slideAt(pres, this.slideIdx);
        if (!slide)
            return;
        slide.ooxmlTiming = this.before ? cloneTiming(this.before) : undefined;
    }
}
exports.RemoveAnimEffectCmd = RemoveAnimEffectCmd;
class MoveAnimEffectCmd {
    slideIdx;
    path;
    newIndex;
    label = "Reorder Animation";
    before;
    constructor(slideIdx, path, newIndex) {
        this.slideIdx = slideIdx;
        this.path = path;
        this.newIndex = newIndex;
    }
    apply(pres) {
        const slide = slideAt(pres, this.slideIdx);
        if (!slide || !slide.ooxmlTiming)
            return;
        this.before = cloneTiming(slide.ooxmlTiming);
        (0, store_1.moveEffect)(slide.ooxmlTiming, this.path, this.newIndex);
    }
    revert(pres) {
        const slide = slideAt(pres, this.slideIdx);
        if (!slide)
            return;
        slide.ooxmlTiming = this.before ? cloneTiming(this.before) : undefined;
    }
}
exports.MoveAnimEffectCmd = MoveAnimEffectCmd;
class SetAnimEffectPropCmd {
    slideIdx;
    path;
    patch;
    label = "Update Animation";
    before;
    constructor(slideIdx, path, patch) {
        this.slideIdx = slideIdx;
        this.path = path;
        this.patch = patch;
    }
    apply(pres) {
        const slide = slideAt(pres, this.slideIdx);
        if (!slide || !slide.ooxmlTiming)
            return;
        this.before = cloneTiming(slide.ooxmlTiming);
        (0, store_1.setEffectProperty)(slide.ooxmlTiming, this.path, this.patch);
    }
    revert(pres) {
        const slide = slideAt(pres, this.slideIdx);
        if (!slide)
            return;
        slide.ooxmlTiming = this.before ? cloneTiming(this.before) : undefined;
    }
}
exports.SetAnimEffectPropCmd = SetAnimEffectPropCmd;
class SetAnimTriggerCmd extends SetAnimEffectPropCmd {
    constructor(slideIdx, path, trigger) {
        super(slideIdx, path, { trigger });
    }
}
exports.SetAnimTriggerCmd = SetAnimTriggerCmd;
class CopyShapeAnimationsCmd {
    slideIdx;
    sourceShapeId;
    targetShapeId;
    label = "Animation painter";
    before;
    constructor(slideIdx, sourceShapeId, targetShapeId) {
        this.slideIdx = slideIdx;
        this.sourceShapeId = sourceShapeId;
        this.targetShapeId = targetShapeId;
    }
    apply(pres) {
        const slide = slideAt(pres, this.slideIdx);
        if (!slide)
            return;
        this.before = cloneTiming(slide.ooxmlTiming);
        const timing = (0, store_1.ensureTiming)(slide);
        (0, store_1.copyShapeAnimations)(timing, this.sourceShapeId, this.targetShapeId);
    }
    revert(pres) {
        const slide = slideAt(pres, this.slideIdx);
        if (!slide)
            return;
        slide.ooxmlTiming = this.before ? cloneTiming(this.before) : undefined;
    }
}
exports.CopyShapeAnimationsCmd = CopyShapeAnimationsCmd;
