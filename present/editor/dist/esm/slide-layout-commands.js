import { recomputeSlideInheritance } from "@sliiu/present-parser";
import { cloneLayoutPlaceholders, findMainLayer, replaceSlideMainShapes, resolveSlideLayout, syncRawMainShapes, } from "./slide-layout-utils.js";
function deepClone(v) {
    if (typeof structuredClone === "function")
        return structuredClone(v);
    return JSON.parse(JSON.stringify(v));
}
function snapshotMainShapes(slideIdx, pres) {
    const slide = pres.slides[slideIdx];
    const main = slide ? findMainLayer(slide) : undefined;
    return main ? main.shapes.map((s) => deepClone(s)) : undefined;
}
function applyLayoutToSlide(pres, slideIdx, layoutRef) {
    const slide = pres.slides[slideIdx];
    if (!slide)
        return false;
    slide.layoutRef = { ...layoutRef };
    const layout = resolveSlideLayout(pres, slide);
    if (!layout)
        return false;
    const placeholders = cloneLayoutPlaceholders(layout);
    replaceSlideMainShapes(slide, placeholders);
    syncRawMainShapes(slide, placeholders);
    return recomputeSlideInheritance(pres, slideIdx);
}
/** Switch the current slide to another master layout and reset placeholders. */
export class ApplySlideLayoutCmd {
    slideIdx;
    next;
    label = "Apply layout";
    prevLayoutRef;
    prevShapes;
    constructor(slideIdx, next) {
        this.slideIdx = slideIdx;
        this.next = next;
    }
    apply(pres) {
        const slide = pres.slides[this.slideIdx];
        if (!slide)
            return;
        if (!this.prevShapes) {
            this.prevLayoutRef = slide.layoutRef ? { ...slide.layoutRef } : undefined;
            this.prevShapes = snapshotMainShapes(this.slideIdx, pres);
        }
        applyLayoutToSlide(pres, this.slideIdx, this.next);
    }
    revert(pres) {
        const slide = pres.slides[this.slideIdx];
        if (!slide || !this.prevShapes)
            return;
        slide.layoutRef = this.prevLayoutRef ? { ...this.prevLayoutRef } : undefined;
        replaceSlideMainShapes(slide, this.prevShapes.map((s) => deepClone(s)));
        syncRawMainShapes(slide, this.prevShapes);
        recomputeSlideInheritance(pres, this.slideIdx);
    }
}
/** Reset slide placeholders to the current layout defaults; removes extra shapes. */
export class ResetSlideToLayoutCmd {
    slideIdx;
    label = "Reset layout";
    prevShapes;
    constructor(slideIdx) {
        this.slideIdx = slideIdx;
    }
    apply(pres) {
        const slide = pres.slides[this.slideIdx];
        if (!slide?.layoutRef)
            return;
        if (!this.prevShapes)
            this.prevShapes = snapshotMainShapes(this.slideIdx, pres);
        applyLayoutToSlide(pres, this.slideIdx, slide.layoutRef);
    }
    revert(pres) {
        const slide = pres.slides[this.slideIdx];
        if (!slide || !this.prevShapes)
            return;
        replaceSlideMainShapes(slide, this.prevShapes.map((s) => deepClone(s)));
        syncRawMainShapes(slide, this.prevShapes);
        recomputeSlideInheritance(pres, this.slideIdx);
    }
}
