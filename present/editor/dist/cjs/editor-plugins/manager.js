"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEditorPluginRuntime = createEditorPluginRuntime;
const event_bus_1 = require("./event-bus");
const ui_host_1 = require("./ui-host");
function createEditorPluginRuntime(deps, initialPlugins = []) {
    const bus = new event_bus_1.EditorEventBusImpl();
    const shared = {};
    const records = new Map();
    const uiHandles = new Map();
    const editorApi = {
        getPresentation: () => deps.getPresentation(),
        getSlideIndex: () => deps.getSlideIndex(),
        getSlideCount: () => deps.getPresentation().slides.length,
        gotoSlide: (i) => deps.gotoSlide(i),
        getSelectedShapeIds: () => [...deps.getSelectedShapeIds()],
        execute: (cmd) => deps.execute(cmd),
        undo: () => deps.undo(),
        redo: () => deps.redo(),
        stackInfo: () => deps.stackInfo(),
        stageElement: () => deps.stage,
        hostElement: () => deps.host,
    };
    const wrapUi = (pluginId, ui) => {
        const orig = ui;
        const tracked = new Set();
        uiHandles.set(pluginId, tracked);
        const wrapHandle = (h) => {
            tracked.add(h);
            const origRemove = h.remove.bind(h);
            h.remove = () => {
                origRemove();
                tracked.delete(h);
            };
            return h;
        };
        return {
            addPanel: (opts) => wrapHandle(orig.addPanel(opts)),
            addRibbonButton: (opts) => wrapHandle(orig.addRibbonButton(opts)),
            mount: (node) => wrapHandle(orig.mount(node)),
        };
    };
    const buildCtx = (pluginId) => {
        const ui = wrapUi(pluginId, (0, ui_host_1.createEditorPluginUIHost)(deps.doc, deps.root, pluginId));
        return {
            get presentation() {
                return deps.getPresentation();
            },
            editor: editorApi,
            events: bus,
            ui,
            shared,
            locale: deps.locale,
            log: (...args) => console.log(`[editor-plugin:${pluginId}]`, ...args),
        };
    };
    const disposeUi = (pluginId) => {
        const set = uiHandles.get(pluginId);
        if (!set)
            return;
        for (const h of [...set])
            h.remove();
        uiHandles.delete(pluginId);
    };
    const unregister = (id) => {
        const rec = records.get(id);
        if (!rec)
            return;
        for (const fn of [...rec.cleanups].reverse()) {
            try {
                fn();
            }
            catch (e) {
                console.error(`[ppt-editor] plugin '${id}' cleanup threw`, e);
            }
        }
        try {
            rec.plugin.deactivate?.();
        }
        catch (e) {
            console.error(`[ppt-editor] plugin '${id}' deactivate threw`, e);
        }
        disposeUi(id);
        records.delete(id);
    };
    const register = async (plugin) => {
        if (!plugin?.id)
            throw new Error("[ppt-editor] editor plugin.id is required");
        if (!plugin.activate)
            throw new Error("[ppt-editor] editor plugin.activate is required");
        if (records.has(plugin.id))
            unregister(plugin.id);
        const ctx = buildCtx(plugin.id);
        const cleanups = [];
        try {
            const ret = await plugin.activate(ctx);
            if (typeof ret === "function")
                cleanups.push(ret);
        }
        catch (e) {
            console.error(`[ppt-editor] plugin '${plugin.id}' activate threw`, e);
            disposeUi(plugin.id);
            return;
        }
        records.set(plugin.id, { plugin, cleanups });
        bus.emitCurrentState();
    };
    const runtime = {
        register,
        unregister,
        list: () => [...records.keys()],
        notifySelectionChange: () => {
            bus.fire("selectionchange", {
                slideIndex: deps.getSlideIndex(),
                shapeIds: [...deps.getSelectedShapeIds()],
            });
        },
        notifySlideChange: () => {
            const pres = deps.getPresentation();
            bus.fire("slidechange", {
                slideIndex: deps.getSlideIndex(),
                total: pres.slides.length,
            });
        },
        notifyCommand: (event) => bus.fire("command", event),
        notifyPresentationChange: () => bus.fire("presentationchange", undefined),
        destroy: () => {
            bus.fire("destroy", undefined);
            for (const id of [...records.keys()])
                unregister(id);
            bus.clear();
            (0, ui_host_1.removeEditorPluginLayers)(deps.root);
        },
    };
    if (initialPlugins.length) {
        void Promise.all(initialPlugins.map((p) => register(p)));
    }
    return runtime;
}
