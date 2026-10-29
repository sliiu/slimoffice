function cloneJson(v) {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}
/** Replace `pres.viewGuides` (undoable). */
export class SetViewGuidesCmd {
    next;
    label = "View guides";
    prev;
    captured = false;
    constructor(next) {
        this.next = next;
    }
    apply(pres) {
        if (!this.captured) {
            this.prev = cloneJson(pres.viewGuides);
            this.captured = true;
        }
        pres.viewGuides = cloneJson(this.next);
    }
    revert(pres) {
        pres.viewGuides = cloneJson(this.prev);
    }
}
/** Replace `pres.showPr` (undoable) — ECMA-376 `p:showPr` slideshow settings. */
export class SetShowPropertiesCmd {
    next;
    label = "Show settings";
    prev;
    captured = false;
    constructor(next) {
        this.next = next;
    }
    apply(pres) {
        if (!this.captured) {
            this.prev = cloneJson(pres.showPr);
            this.captured = true;
        }
        pres.showPr = cloneJson(this.next);
    }
    revert(pres) {
        pres.showPr = cloneJson(this.prev);
    }
}
