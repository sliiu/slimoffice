import { remapCommentsAfterSlideDelete, remapCommentsAfterSlideInsert, remapCommentsAfterSlideMove, remapCommentsAfterSlideRemoveAt, remapCommentsAfterSlidesDelete, restoreCommentsAfterSlideInsert, restoreCommentsAfterSlidesInsert, } from "./comment-slide-sync.js";
import { remapSectionsAfterSlideDelete, remapSectionsAfterSlideInsert, remapSectionsAfterSlideMove, remapSectionsAfterSlideRemoveAt, remapSectionsAfterSlidesDelete, } from "./section-slide-sync.js";
export function reindexPresentationSlides(pres) {
    pres.slides.forEach((s, i) => {
        s.index = i;
    });
}
export function newSlideId() {
    return `slide_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
/** 将 `from` 位置的 slide 插入到 `dropBefore` 之前；无需移动时返回 null。 */
export function computeSlideMoveTarget(from, dropBefore) {
    if (from === dropBefore || from === dropBefore - 1)
        return null;
    return from < dropBefore ? dropBefore - 1 : dropBefore;
}
/** slide 列表重排后，把单个下标映射到新位置。 */
export function remapIndexAfterSlideMove(from, to, idx) {
    if (idx === from)
        return to;
    if (from < idx && to >= idx)
        return idx - 1;
    if (from > idx && to <= idx)
        return idx + 1;
    return idx;
}
/** 批量重映射 slide 多选集合。 */
export function remapSlideIndexSetAfterMove(from, to, indices) {
    const out = new Set();
    for (const i of indices)
        out.add(remapIndexAfterSlideMove(from, to, i));
    return out;
}
/** 在指定位置插入一张幻灯片。 */
export class InsertSlideCmd {
    idx;
    slide;
    label = "Insert slide";
    inserted;
    constructor(idx, slide) {
        this.idx = idx;
        this.slide = slide;
    }
    apply(pres) {
        const at = Math.max(0, Math.min(this.idx, pres.slides.length));
        remapCommentsAfterSlideInsert(pres, at);
        remapSectionsAfterSlideInsert(pres, at);
        pres.slides.splice(at, 0, this.slide);
        this.inserted = { idx: at, slide: this.slide };
        reindexPresentationSlides(pres);
    }
    revert(pres) {
        if (!this.inserted)
            return;
        const cur = pres.slides.indexOf(this.inserted.slide);
        if (cur >= 0)
            pres.slides.splice(cur, 1);
        remapCommentsAfterSlideRemoveAt(pres, this.inserted.idx);
        remapSectionsAfterSlideRemoveAt(pres, this.inserted.idx);
        reindexPresentationSlides(pres);
    }
}
export class DeleteSlideCmd {
    idx;
    label = "Delete slide";
    removed;
    removedComments = [];
    constructor(idx) {
        this.idx = idx;
    }
    apply(pres) {
        if (this.idx < 0 || this.idx >= pres.slides.length)
            return;
        this.removedComments = remapCommentsAfterSlideDelete(pres, this.idx);
        remapSectionsAfterSlideDelete(pres, this.idx);
        const [s] = pres.slides.splice(this.idx, 1);
        if (!s)
            return;
        this.removed = { idx: this.idx, slide: s };
        reindexPresentationSlides(pres);
    }
    revert(pres) {
        if (!this.removed)
            return;
        remapSectionsAfterSlideInsert(pres, this.removed.idx);
        pres.slides.splice(this.removed.idx, 0, this.removed.slide);
        restoreCommentsAfterSlideInsert(pres, this.removed.idx, this.removedComments);
        reindexPresentationSlides(pres);
    }
}
/** 批量删除（单次 undo）；indices 应为降序，调用方负责排序。 */
export class DeleteSlidesCmd {
    label = "Delete slides";
    removed;
    removedComments = new Map();
    constructor(indices) {
        this.indices = [...indices].sort((a, b) => b - a);
    }
    indices;
    apply(pres) {
        this.removedComments = remapCommentsAfterSlidesDelete(pres, this.indices);
        remapSectionsAfterSlidesDelete(pres, this.indices);
        this.removed = [];
        for (const idx of this.indices) {
            if (idx < 0 || idx >= pres.slides.length)
                continue;
            const [s] = pres.slides.splice(idx, 1);
            if (s)
                this.removed.push({ idx, slide: s });
        }
        reindexPresentationSlides(pres);
    }
    revert(pres) {
        if (!this.removed?.length)
            return;
        const sorted = [...this.removed].sort((a, b) => a.idx - b.idx);
        for (const { idx, slide } of sorted) {
            remapSectionsAfterSlideInsert(pres, idx);
            pres.slides.splice(idx, 0, slide);
        }
        restoreCommentsAfterSlidesInsert(pres, this.removedComments);
        reindexPresentationSlides(pres);
    }
}
export class MoveSlideCmd {
    from;
    to;
    label = "Move slide";
    done;
    constructor(from, to) {
        this.from = from;
        this.to = to;
    }
    apply(pres) {
        if (this.from < 0 || this.from >= pres.slides.length)
            return;
        const [s] = pres.slides.splice(this.from, 1);
        if (!s)
            return;
        const at = Math.max(0, Math.min(this.to, pres.slides.length));
        pres.slides.splice(at, 0, s);
        this.done = { from: this.from, to: at };
        remapCommentsAfterSlideMove(pres, this.from, at);
        remapSectionsAfterSlideMove(pres, this.from, at);
        reindexPresentationSlides(pres);
    }
    revert(pres) {
        if (!this.done)
            return;
        const [s] = pres.slides.splice(this.done.to, 1);
        if (!s)
            return;
        pres.slides.splice(this.done.from, 0, s);
        remapCommentsAfterSlideMove(pres, this.done.to, this.done.from);
        remapSectionsAfterSlideMove(pres, this.done.to, this.done.from);
        reindexPresentationSlides(pres);
    }
}
export class DuplicateSlideCmd {
    idx;
    label = "Duplicate slide";
    inserted;
    constructor(idx) {
        this.idx = idx;
    }
    apply(pres) {
        const src = pres.slides[this.idx];
        if (!src)
            return;
        const copy = JSON.parse(JSON.stringify(src));
        copy.id = newSlideId();
        copy.name = `${src.name} (copy)`;
        const at = this.idx + 1;
        remapCommentsAfterSlideInsert(pres, at);
        remapSectionsAfterSlideInsert(pres, at);
        pres.slides.splice(at, 0, copy);
        this.inserted = { idx: at, slide: copy };
        reindexPresentationSlides(pres);
    }
    revert(pres) {
        if (!this.inserted)
            return;
        const cur = pres.slides.indexOf(this.inserted.slide);
        if (cur >= 0)
            pres.slides.splice(cur, 1);
        remapCommentsAfterSlideRemoveAt(pres, this.inserted.idx);
        remapSectionsAfterSlideRemoveAt(pres, this.inserted.idx);
        reindexPresentationSlides(pres);
    }
}
