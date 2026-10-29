// 动画编辑命令 — 走 CommandStack 的 EditCommand 接口。
// 实现策略：每个命令在 apply 时直接修改 slide.ooxmlTiming（深拷贝前后差异以便 revert）。
import { ensureTiming, insertEffect, moveEffect, removeEffect, setEffectProperty, copyShapeAnimations, } from "./store.js";
function slideAt(pres, idx) {
    return pres.slides[idx];
}
function cloneTiming(timing) {
    if (!timing)
        return undefined;
    return JSON.parse(JSON.stringify(timing));
}
export class AddAnimEffectCmd {
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
        const timing = ensureTiming(slide);
        insertEffect(timing, this.args);
    }
    revert(pres) {
        const slide = slideAt(pres, this.slideIdx);
        if (!slide)
            return;
        slide.ooxmlTiming = this.before ? cloneTiming(this.before) : undefined;
    }
}
export class RemoveAnimEffectCmd {
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
        removeEffect(slide.ooxmlTiming, this.path);
    }
    revert(pres) {
        const slide = slideAt(pres, this.slideIdx);
        if (!slide)
            return;
        slide.ooxmlTiming = this.before ? cloneTiming(this.before) : undefined;
    }
}
export class MoveAnimEffectCmd {
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
        moveEffect(slide.ooxmlTiming, this.path, this.newIndex);
    }
    revert(pres) {
        const slide = slideAt(pres, this.slideIdx);
        if (!slide)
            return;
        slide.ooxmlTiming = this.before ? cloneTiming(this.before) : undefined;
    }
}
export class SetAnimEffectPropCmd {
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
        setEffectProperty(slide.ooxmlTiming, this.path, this.patch);
    }
    revert(pres) {
        const slide = slideAt(pres, this.slideIdx);
        if (!slide)
            return;
        slide.ooxmlTiming = this.before ? cloneTiming(this.before) : undefined;
    }
}
export class SetAnimTriggerCmd extends SetAnimEffectPropCmd {
    constructor(slideIdx, path, trigger) {
        super(slideIdx, path, { trigger });
    }
}
export class CopyShapeAnimationsCmd {
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
        const timing = ensureTiming(slide);
        copyShapeAnimations(timing, this.sourceShapeId, this.targetShapeId);
    }
    revert(pres) {
        const slide = slideAt(pres, this.slideIdx);
        if (!slide)
            return;
        slide.ooxmlTiming = this.before ? cloneTiming(this.before) : undefined;
    }
}
