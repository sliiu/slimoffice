"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResetSlideToLayoutCmd = exports.ApplySlideLayoutCmd = void 0;
const parser_1 = require("@sliiu/present-parser");
const slide_layout_utils_1 = require("./slide-layout-utils");
function deepClone(v) {
    if (typeof structuredClone === "function")
        return structuredClone(v);
    return JSON.parse(JSON.stringify(v));
}
function snapshotMainShapes(slideIdx, pres) {
    const slide = pres.slides[slideIdx];
    const main = slide ? (0, slide_layout_utils_1.findMainLayer)(slide) : undefined;
    return main ? main.shapes.map((s) => deepClone(s)) : undefined;
}
function applyLayoutToSlide(pres, slideIdx, layoutRef) {
    const slide = pres.slides[slideIdx];
    if (!slide)
        return false;
    slide.layoutRef = { ...layoutRef };
    const layout = (0, slide_layout_utils_1.resolveSlideLayout)(pres, slide);
    if (!layout)
        return false;
    const placeholders = (0, slide_layout_utils_1.cloneLayoutPlaceholders)(layout);
    (0, slide_layout_utils_1.replaceSlideMainShapes)(slide, placeholders);
    (0, slide_layout_utils_1.syncRawMainShapes)(slide, placeholders);
    return (0, parser_1.recomputeSlideInheritance)(pres, slideIdx);
}
/** Switch the current slide to another master layout and reset placeholders. */
class ApplySlideLayoutCmd {
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
        (0, slide_layout_utils_1.replaceSlideMainShapes)(slide, this.prevShapes.map((s) => deepClone(s)));
        (0, slide_layout_utils_1.syncRawMainShapes)(slide, this.prevShapes);
        (0, parser_1.recomputeSlideInheritance)(pres, this.slideIdx);
    }
}
exports.ApplySlideLayoutCmd = ApplySlideLayoutCmd;
/** Reset slide placeholders to the current layout defaults; removes extra shapes. */
class ResetSlideToLayoutCmd {
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
        (0, slide_layout_utils_1.replaceSlideMainShapes)(slide, this.prevShapes.map((s) => deepClone(s)));
        (0, slide_layout_utils_1.syncRawMainShapes)(slide, this.prevShapes);
        (0, parser_1.recomputeSlideInheritance)(pres, this.slideIdx);
    }
}
exports.ResetSlideToLayoutCmd = ResetSlideToLayoutCmd;
