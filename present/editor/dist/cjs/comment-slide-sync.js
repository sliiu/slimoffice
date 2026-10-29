"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.remapCommentsAfterSlideDelete = remapCommentsAfterSlideDelete;
exports.restoreCommentsAfterSlideInsert = restoreCommentsAfterSlideInsert;
exports.remapCommentsAfterSlideInsert = remapCommentsAfterSlideInsert;
exports.remapCommentsAfterSlideRemoveAt = remapCommentsAfterSlideRemoveAt;
exports.remapCommentsAfterSlidesDelete = remapCommentsAfterSlidesDelete;
exports.restoreCommentsAfterSlidesInsert = restoreCommentsAfterSlidesInsert;
exports.remapCommentsAfterSlideMove = remapCommentsAfterSlideMove;
function remapIndexAfterSlideMove(from, to, idx) {
    if (idx === from)
        return to;
    if (from < idx && to >= idx)
        return idx - 1;
    if (from > idx && to <= idx)
        return idx + 1;
    return idx;
}
function normalizeComments(pres) {
    if (pres.comments && !pres.comments.length)
        pres.comments = undefined;
}
/** 删除一页后：移除该页批注，其后页批注 slideIndex -1。 */
function remapCommentsAfterSlideDelete(pres, deletedIndex) {
    if (!pres.comments?.length)
        return [];
    const removed = pres.comments.filter((c) => c.slideIndex === deletedIndex);
    pres.comments = pres.comments
        .filter((c) => c.slideIndex !== deletedIndex)
        .map((c) => c.slideIndex > deletedIndex ? { ...c, slideIndex: c.slideIndex - 1 } : c);
    normalizeComments(pres);
    return removed.map((c) => ({ ...c }));
}
/** 撤销删除页：在 idx 插入页后，恢复 removed 并上移其后批注索引。 */
function restoreCommentsAfterSlideInsert(pres, insertedIndex, restored) {
    if (!pres.comments)
        pres.comments = [];
    for (const c of pres.comments) {
        if (c.slideIndex >= insertedIndex)
            c.slideIndex++;
    }
    for (const c of restored) {
        pres.comments.push({ ...c, slideIndex: insertedIndex });
    }
}
/** 在 at 插入空白页：at 及之后批注 slideIndex +1。 */
function remapCommentsAfterSlideInsert(pres, at) {
    if (!pres.comments?.length)
        return;
    for (const c of pres.comments) {
        if (c.slideIndex >= at)
            c.slideIndex++;
    }
}
/** 撤销插入页：移除 at 页批注并下移其后索引。 */
function remapCommentsAfterSlideRemoveAt(pres, at) {
    if (!pres.comments?.length)
        return;
    pres.comments = pres.comments
        .filter((c) => c.slideIndex !== at)
        .map((c) => (c.slideIndex > at ? { ...c, slideIndex: c.slideIndex - 1 } : c));
    normalizeComments(pres);
}
/** 批量删除（indices 降序）：移除对应页批注并重映射索引。 */
function remapCommentsAfterSlidesDelete(pres, indicesDesc) {
    const removedByIndex = new Map();
    if (!pres.comments?.length || !indicesDesc.length)
        return removedByIndex;
    const deleted = new Set(indicesDesc);
    const sortedAsc = [...indicesDesc].sort((a, b) => a - b);
    for (const idx of sortedAsc) {
        removedByIndex.set(idx, pres.comments.filter((c) => c.slideIndex === idx).map((c) => ({ ...c })));
    }
    pres.comments = pres.comments
        .filter((c) => !deleted.has(c.slideIndex))
        .map((c) => {
        const shift = sortedAsc.filter((i) => i < c.slideIndex).length;
        return shift ? { ...c, slideIndex: c.slideIndex - shift } : c;
    });
    normalizeComments(pres);
    return removedByIndex;
}
/** 撤销批量删除：按升序插回各页批注并恢复索引。 */
function restoreCommentsAfterSlidesInsert(pres, removedByIndex) {
    if (!removedByIndex.size)
        return;
    const sorted = [...removedByIndex.keys()].sort((a, b) => a - b);
    for (const idx of sorted) {
        restoreCommentsAfterSlideInsert(pres, idx, removedByIndex.get(idx) ?? []);
    }
}
/** 移动一页后重映射批注 slideIndex。 */
function remapCommentsAfterSlideMove(pres, from, to) {
    if (!pres.comments?.length)
        return;
    for (const c of pres.comments) {
        c.slideIndex = remapIndexAfterSlideMove(from, to, c.slideIndex);
    }
}
