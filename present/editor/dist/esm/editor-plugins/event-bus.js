export class EditorEventBusImpl {
    listeners = new Map();
    lastSelection = null;
    lastSlide = null;
    on(event, cb) {
        let set = this.listeners.get(event);
        if (!set) {
            set = new Set();
            this.listeners.set(event, set);
        }
        set.add(cb);
        if (event === "selectionchange" && this.lastSelection) {
            cb(this.lastSelection);
        }
        if (event === "slidechange" && this.lastSlide) {
            cb(this.lastSlide);
        }
        return () => {
            this.listeners.get(event)?.delete(cb);
        };
    }
    off(event, cb) {
        this.listeners.get(event)?.delete(cb);
    }
    fire(event, payload) {
        if (event === "selectionchange")
            this.lastSelection = payload;
        if (event === "slidechange")
            this.lastSlide = payload;
        const set = this.listeners.get(event);
        if (!set)
            return;
        for (const cb of [...set]) {
            try {
                cb(payload);
            }
            catch (e) {
                console.error(`[ppt-editor] event '${event}' listener threw`, e);
            }
        }
    }
    emitCurrentState() {
        if (this.lastSlide)
            this.fire("slidechange", this.lastSlide);
        if (this.lastSelection)
            this.fire("selectionchange", this.lastSelection);
    }
    clear() {
        this.listeners.clear();
        this.lastSelection = null;
        this.lastSlide = null;
    }
}
