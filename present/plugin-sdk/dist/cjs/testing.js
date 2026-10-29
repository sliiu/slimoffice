"use strict";
// 单元测试工具：在 Node 中模拟一个 PluginContext，让插件作者可以独立测试逻辑。
//
// 限制：
//   - 不渲染真实 slide。thumbnail / overlay 都是 stub。
//   - 没有 DOM；UI 方法返回 mock 节点（或可由调用者传入 jsdom 实例）。
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMockPluginContext = createMockPluginContext;
function createMockPluginContext(opts = {}) {
    const slideCount = opts.slides?.length ?? opts.slideCount ?? 3;
    const size = opts.size ?? { width: 960, height: 540 };
    const slides = opts.slides ??
        Array.from({ length: slideCount }, (_, i) => ({
            id: `slide_${i + 1}`,
            name: `Slide ${i + 1}`,
            index: i,
            visibleIndex: i,
            show: true,
            hasAnimations: false,
            totalAnimationSteps: 0,
        }));
    const presentation = {
        id: "mock-pres",
        size,
        title: opts.title ?? "Mock Presentation",
        slides,
        visibleOrder: slides
            .map((s, i) => (s.show ? i : -1))
            .filter((i) => i >= 0),
    };
    let cursor = 0;
    let step = 0;
    let stepTotal = 0;
    const calls = {
        next: 0,
        prev: 0,
        goto: [],
        gotoById: [],
        nextStep: 0,
        triggerShape: [],
        freezeActive: 0,
        setNavigationLocked: [],
        setVisible: [],
        setOpacity: [],
    };
    let navigationLocked = false;
    const listeners = new Map();
    const fire = (event, payload) => {
        listeners.get(event)?.forEach((cb) => cb(payload));
    };
    const player = {
        next: () => {
            calls.next++;
            if (cursor < presentation.visibleOrder.length - 1)
                cursor++;
            fire("slidechange", {
                visibleIndex: cursor,
                absoluteIndex: presentation.visibleOrder[cursor] ?? cursor,
                total: presentation.visibleOrder.length,
                slide: slides[presentation.visibleOrder[cursor] ?? cursor],
            });
        },
        prev: () => {
            calls.prev++;
            if (cursor > 0)
                cursor--;
            fire("slidechange", {
                visibleIndex: cursor,
                absoluteIndex: presentation.visibleOrder[cursor] ?? cursor,
                total: presentation.visibleOrder.length,
                slide: slides[presentation.visibleOrder[cursor] ?? cursor],
            });
        },
        goto: (i) => {
            calls.goto.push(i);
            if (i >= 0 && i < presentation.visibleOrder.length)
                cursor = i;
        },
        gotoById: (id) => {
            calls.gotoById.push(id);
            const idx = slides.findIndex((s) => s.id === id);
            if (idx < 0)
                return false;
            cursor = idx;
            return true;
        },
        current: () => cursor,
        total: () => presentation.visibleOrder.length,
        nextStep: () => {
            calls.nextStep++;
            if (step < stepTotal) {
                step++;
                return true;
            }
            return false;
        },
        triggerShape: (id) => {
            calls.triggerShape.push(id);
            return true;
        },
        step: () => ({ totalSteps: stepTotal, currentStep: step }),
        freezeActive: () => {
            calls.freezeActive++;
        },
        setNavigationLocked: (locked) => {
            navigationLocked = locked;
            calls.setNavigationLocked.push(locked);
        },
        isNavigationLocked: () => navigationLocked,
    };
    // ctx.scene 桩：基于 opts.shapes 提供查询 / 命中测试 / 显隐（就地改快照）。
    const shapeList = opts.shapes ? opts.shapes.map((s) => ({ ...s })) : [];
    const findShape = (id) => shapeList.find((s) => s.id === id);
    const inBox = (s, x, y) => x >= s.bbox.x && x <= s.bbox.x + s.bbox.w && y >= s.bbox.y && y <= s.bbox.y + s.bbox.h;
    const scene = {
        shapes: () => shapeList.map((s) => ({ ...s })),
        byName: (name) => {
            const s = shapeList.find((sh) => sh.name === name);
            return s ? { ...s } : null;
        },
        allByName: (name) => shapeList.filter((sh) => sh.name === name).map((s) => ({ ...s })),
        byId: (id) => {
            const s = findShape(id);
            return s ? { ...s } : null;
        },
        hitTest: (x, y) => {
            let hit = null;
            for (const s of shapeList)
                if (s.visible && inBox(s, x, y))
                    hit = s;
            return hit ? { ...hit } : null;
        },
        toSlideCoords: (clientX, clientY) => ({ x: clientX, y: clientY }),
        setVisible: (id, visible) => {
            const s = findShape(id);
            if (!s)
                return false;
            s.visible = visible;
            calls.setVisible.push({ id, visible });
            return true;
        },
        setOpacity: (id, opacity) => {
            const s = findShape(id);
            if (!s)
                return false;
            s.visible = opacity > 0;
            calls.setOpacity.push({ id, opacity });
            return true;
        },
        triggerShape: (id) => {
            calls.triggerShape.push(id);
            return !!findShape(id)?.hasClickAnimation;
        },
    };
    const events = {
        on: (event, cb) => {
            let set = listeners.get(event);
            if (!set) {
                set = new Set();
                listeners.set(event, set);
            }
            set.add(cb);
            return () => {
                listeners.get(event)?.delete(cb);
            };
        },
        off: (event, cb) => {
            listeners.get(event)?.delete(cb);
        },
        emitCurrentSlide: () => {
            const absI = presentation.visibleOrder[cursor] ?? cursor;
            fire("slidechange", {
                visibleIndex: cursor,
                absoluteIndex: absI,
                total: presentation.visibleOrder.length,
                slide: slides[absI],
            });
        },
    };
    const doc = opts.document;
    const mkStubEl = () => {
        if (doc)
            return doc.createElement("div");
        return { remove: () => { } };
    };
    const noopHandle = () => ({ remove: () => { } });
    const ui = {
        addPanel: (o) => {
            o.render(mkStubEl());
            return noopHandle();
        },
        addToolbarButton: () => noopHandle(),
        addOverlay: () => noopHandle(),
        mount: () => noopHandle(),
        setDockOpen: () => { },
        toggleDock: () => { },
        isDockOpen: () => false,
        rootElement: () => mkStubEl(),
        stageElement: () => mkStubEl(),
    };
    // 极简 SVG 桩：返回一个空 <svg viewBox="...">，便于在 Node 中测试。
    const emptySvg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.width} ${size.height}" />`;
    const thumbnail = {
        mount: (_host, _target, _opts) => {
            const dummy = { remove: () => { } };
            return { element: dummy, destroy: () => { } };
        },
        toSvgString: () => emptySvg(presentation.size),
        toSvgBlob: () => 
        // Blob 在 Node 18+ 全局可用；做最小可能的回退。
        typeof Blob !== "undefined"
            ? new Blob([emptySvg(presentation.size)], { type: "image/svg+xml" })
            : { size: 0, type: "image/svg+xml" },
        toDataUrl: () => `data:image/svg+xml;base64,${typeof Buffer !== "undefined"
            ? Buffer.from(emptySvg(presentation.size)).toString("base64")
            : ""}`,
        byVisibleIndex: () => Promise.resolve(typeof Blob !== "undefined"
            ? new Blob([emptySvg(presentation.size)], { type: "image/svg+xml" })
            : { size: 0, type: "image/svg+xml" }),
        byAbsoluteIndex: () => Promise.resolve(typeof Blob !== "undefined"
            ? new Blob([emptySvg(presentation.size)], { type: "image/svg+xml" })
            : { size: 0, type: "image/svg+xml" }),
        byId: () => Promise.resolve(typeof Blob !== "undefined"
            ? new Blob([emptySvg(presentation.size)], { type: "image/svg+xml" })
            : { size: 0, type: "image/svg+xml" }),
        dataUrlByVisibleIndex: () => Promise.resolve(`data:image/svg+xml;base64,${typeof Buffer !== "undefined"
            ? Buffer.from(emptySvg(presentation.size)).toString("base64")
            : ""}`),
        clearCache: () => { },
    };
    const contextMenu = {
        addItem: () => noopHandle(),
        open: () => { },
        close: () => { },
    };
    return {
        presentation,
        player,
        events,
        ui,
        scene,
        thumbnail,
        contextMenu,
        shared: {},
        locale: opts.locale ?? "en",
        live: {
            attached: () => false,
            send: () => { },
            on: () => () => { },
            onAttach: () => () => { },
        },
        log: (...args) => console.log("[mock-plugin]", ...args),
        fireSlideChange: (v) => {
            cursor = v;
            const absI = presentation.visibleOrder[v] ?? v;
            fire("slidechange", {
                visibleIndex: v,
                absoluteIndex: absI,
                total: presentation.visibleOrder.length,
                slide: slides[absI],
            });
        },
        fireStepChange: (currentStep, totalSteps) => {
            step = currentStep;
            stepTotal = totalSteps;
            const absI = presentation.visibleOrder[cursor] ?? cursor;
            fire("stepchange", {
                visibleIndex: cursor,
                absoluteIndex: absI,
                currentStep,
                totalSteps,
                frozen: false,
            });
        },
        calls,
    };
}
