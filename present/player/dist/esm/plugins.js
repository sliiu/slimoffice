// 播放器插件系统 — 运行时实现
//
// 所有对外类型（Plugin / PluginContext / PluginUIHost / 事件类型 / 缩略图 / UI 选项等）
// 都从 `@sliiu/present-plugin-sdk` 导入并 re-export，保证 SDK 和 player 用同一份契约。
// 本文件只负责 player-side 的 EventBus / PluginManager / PresentationInfo 构造。
// ---------------------------------------------------------------------------
// EventBus
// ---------------------------------------------------------------------------
export class EventBus {
    listeners = new Map();
    currentSlideSnapshot = null;
    on(event, cb) {
        let set = this.listeners.get(event);
        if (!set) {
            set = new Set();
            this.listeners.set(event, set);
        }
        set.add(cb);
        if (event === "slidechange" && this.currentSlideSnapshot) {
            cb(this.currentSlideSnapshot);
        }
        return () => {
            this.listeners.get(event)?.delete(cb);
        };
    }
    off(event, cb) {
        this.listeners.get(event)?.delete(cb);
    }
    fire(event, payload) {
        if (event === "slidechange") {
            this.currentSlideSnapshot = payload;
        }
        const set = this.listeners.get(event);
        if (!set)
            return;
        for (const cb of [...set]) {
            try {
                cb(payload);
            }
            catch (e) {
                console.error(`[ppt-player] event '${event}' listener threw`, e);
            }
        }
    }
    emitCurrentSlide() {
        if (!this.currentSlideSnapshot)
            return;
        const set = this.listeners.get("slidechange");
        if (!set)
            return;
        for (const cb of [...set]) {
            try {
                cb(this.currentSlideSnapshot);
            }
            catch (e) {
                console.error("[ppt-player] emitCurrentSlide listener threw", e);
            }
        }
    }
    clear() {
        this.listeners.clear();
        this.currentSlideSnapshot = null;
    }
}
// ---------------------------------------------------------------------------
// Presentation → PresentationInfo
// ---------------------------------------------------------------------------
export function buildPresentationInfo(pres) {
    const visibleOrder = [];
    const slides = pres.slides.map((s, i) => {
        const show = s.show !== false;
        if (show)
            visibleOrder.push(i);
        return slideToInfo(s, i, -1);
    });
    for (let v = 0; v < visibleOrder.length; v++) {
        const absI = visibleOrder[v];
        slides[absI].visibleIndex = v;
    }
    return {
        id: pres.id,
        size: { width: pres.size.width, height: pres.size.height },
        title: typeof pres.meta?.title === "string" ? pres.meta.title : undefined,
        slides,
        visibleOrder,
        meta: pres.meta ? { ...pres.meta } : undefined,
    };
}
function slideToInfo(s, index, visibleIndex) {
    const totalAnimationSteps = countMainSteps(s);
    return {
        id: s.id,
        name: s.name,
        index,
        visibleIndex,
        show: s.show !== false,
        hasAnimations: totalAnimationSteps > 0,
        totalAnimationSteps,
        notes: s.notes,
        transition: s.transition
            ? { kind: s.transition.kind, duration: s.transition.duration }
            : undefined,
    };
}
function countMainSteps(s) {
    const timing = s.ooxmlTiming;
    if (!timing)
        return 0;
    if (Array.isArray(timing.tnLst))
        return timing.tnLst.length;
    return 1;
}
export class PluginManager {
    records = new Map();
    ctxFactory;
    uiHandlesByPlugin = new Map();
    constructor(ctxFactory) {
        this.ctxFactory = ctxFactory;
    }
    async register(plugin) {
        if (!plugin || !plugin.id) {
            throw new Error("[ppt-player] plugin.id is required");
        }
        if (this.records.has(plugin.id)) {
            console.warn(`[ppt-player] re-registering plugin '${plugin.id}', unloading previous`);
            this.unregister(plugin.id);
        }
        const ctx = this.ctxFactory(plugin.id);
        const trackedUi = this.wrapUiHost(plugin.id, ctx.ui);
        const trackedCtx = { ...ctx, ui: trackedUi };
        const cleanups = [];
        try {
            const ret = await plugin.activate(trackedCtx);
            if (typeof ret === "function")
                cleanups.push(ret);
        }
        catch (e) {
            console.error(`[ppt-player] plugin '${plugin.id}' activate threw`, e);
            this.disposeUiHandles(plugin.id);
            return;
        }
        this.records.set(plugin.id, { plugin, cleanups });
    }
    registerAll(plugins) {
        if (!plugins || plugins.length === 0)
            return Promise.resolve();
        return Promise.all(plugins.map((p) => this.register(p))).then(() => undefined);
    }
    unregister(id) {
        const rec = this.records.get(id);
        if (!rec)
            return false;
        this.records.delete(id);
        for (const c of rec.cleanups) {
            try {
                c();
            }
            catch (e) {
                console.error(`[ppt-player] plugin '${id}' cleanup threw`, e);
            }
        }
        try {
            rec.plugin.deactivate?.();
        }
        catch (e) {
            console.error(`[ppt-player] plugin '${id}' deactivate threw`, e);
        }
        this.disposeUiHandles(id);
        return true;
    }
    destroyAll() {
        for (const id of [...this.records.keys()])
            this.unregister(id);
    }
    list() {
        return [...this.records.keys()];
    }
    has(id) {
        return this.records.has(id);
    }
    wrapUiHost(pluginId, ui) {
        const track = (h) => {
            let set = this.uiHandlesByPlugin.get(pluginId);
            if (!set) {
                set = new Set();
                this.uiHandlesByPlugin.set(pluginId, set);
            }
            set.add(h);
            return {
                remove: () => {
                    try {
                        h.remove();
                    }
                    finally {
                        this.uiHandlesByPlugin.get(pluginId)?.delete(h);
                    }
                },
            };
        };
        return {
            addPanel: (o) => track(ui.addPanel(o)),
            addToolbarButton: (o) => track(ui.addToolbarButton(o)),
            addOverlay: (o) => track(ui.addOverlay(o)),
            mount: (n) => track(ui.mount(n)),
            setDockOpen: (v) => ui.setDockOpen(v),
            toggleDock: () => ui.toggleDock(),
            isDockOpen: () => ui.isDockOpen(),
            rootElement: () => ui.rootElement(),
            stageElement: () => ui.stageElement(),
        };
    }
    disposeUiHandles(pluginId) {
        const set = this.uiHandlesByPlugin.get(pluginId);
        if (!set)
            return;
        for (const h of [...set]) {
            try {
                h.remove();
            }
            catch {
                // ignore
            }
        }
        this.uiHandlesByPlugin.delete(pluginId);
    }
}
