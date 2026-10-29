"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.remapSectionsAfterSlideDelete = remapSectionsAfterSlideDelete;
exports.remapSectionsAfterSlidesDelete = remapSectionsAfterSlidesDelete;
exports.remapSectionsAfterSlideInsert = remapSectionsAfterSlideInsert;
exports.remapSectionsAfterSlideRemoveAt = remapSectionsAfterSlideRemoveAt;
exports.remapSectionsAfterSlideMove = remapSectionsAfterSlideMove;
const core_1 = require("@sliiu/present-core");
function remapIndexAfterSlideMove(from, to, idx) {
    if (idx === from)
        return to;
    if (from < idx && to >= idx)
        return idx - 1;
    if (from > idx && to <= idx)
        return idx + 1;
    return idx;
}
function setSections(pres, sections) {
    const next = (0, core_1.normalizeDeckSections)(sections, pres.slides.length);
    pres.sections = next.length ? next : undefined;
}
/** 删除一页后：移除该页节标题，其后节 startIndex -1。 */
function remapSectionsAfterSlideDelete(pres, deletedIndex) {
    if (!pres.sections?.length)
        return;
    setSections(pres, pres.sections
        .filter((s) => s.startIndex !== deletedIndex)
        .map((s) => s.startIndex > deletedIndex ? { ...s, startIndex: s.startIndex - 1 } : s));
}
/** 批量删除后：移除落在删除索引上的节，并递减其后 startIndex。 */
function remapSectionsAfterSlidesDelete(pres, deletedIndices) {
    if (!pres.sections?.length || !deletedIndices.length)
        return;
    const deleted = new Set(deletedIndices);
    let sections = pres.sections.filter((s) => !deleted.has(s.startIndex));
    const shiftBefore = (idx) => {
        let n = 0;
        for (const d of deleted) {
            if (d < idx)
                n++;
        }
        return idx - n;
    };
    sections = sections.map((s) => ({ ...s, startIndex: shiftBefore(s.startIndex) }));
    setSections(pres, sections);
}
/** 在 at 插入页：at 及之后节 startIndex +1。 */
function remapSectionsAfterSlideInsert(pres, at) {
    if (!pres.sections?.length)
        return;
    setSections(pres, pres.sections.map((s) => s.startIndex >= at ? { ...s, startIndex: s.startIndex + 1 } : s));
}
/** 撤销插入：at 及之后节 startIndex -1。 */
function remapSectionsAfterSlideRemoveAt(pres, at) {
    if (!pres.sections?.length)
        return;
    setSections(pres, pres.sections
        .filter((s) => s.startIndex !== at)
        .map((s) => (s.startIndex > at ? { ...s, startIndex: s.startIndex - 1 } : s)));
}
/** 单页移动后重映射节 startIndex。 */
function remapSectionsAfterSlideMove(pres, from, to) {
    if (!pres.sections?.length)
        return;
    setSections(pres, pres.sections.map((s) => ({
        ...s,
        startIndex: remapIndexAfterSlideMove(from, to, s.startIndex),
    })));
}
