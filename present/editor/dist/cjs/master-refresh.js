"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recomputeSlidesForMasterEdit = recomputeSlidesForMasterEdit;
const parser_1 = require("@sliiu/present-parser");
/** 母版 / 版式编辑后，刷新引用该 master（及可选 layout）的全部 slide 占位符继承。 */
function recomputeSlidesForMasterEdit(pres, ctx) {
    let count = 0;
    for (let i = 0; i < pres.slides.length; i++) {
        const ref = pres.slides[i]?.layoutRef;
        if (!ref || ref.masterId !== ctx.masterId)
            continue;
        if (ctx.layoutId && ref.layoutId !== ctx.layoutId)
            continue;
        if ((0, parser_1.recomputeSlideInheritance)(pres, i))
            count++;
    }
    return count;
}
