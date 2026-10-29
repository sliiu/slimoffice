import { EditorEventBusImpl } from "./event-bus.js";
export function createMockEditorPluginContext(opts = {}) {
    const bus = new EditorEventBusImpl();
    const calls = { execute: [], undo: 0, redo: 0, goto: [] };
    let slideIndex = opts.slideIndex ?? 0;
    let selected = [...(opts.selectedShapeIds ?? [])];
    const pres = opts.presentation ??
        {
            id: "mock",
            size: { width: 1280, height: 720 },
            slides: [{
                    id: "s1",
                    name: "Slide 1",
                    index: 0,
                    layers: [{ id: "main", name: "main", visible: true, locked: false, shapes: [] }],
                }],
        };
    const noopUi = {
        addPanel: () => ({ remove: () => { } }),
        addRibbonButton: () => ({ remove: () => { } }),
        mount: () => ({ remove: () => { } }),
    };
    const editor = {
        getPresentation: () => pres,
        getSlideIndex: () => slideIndex,
        getSlideCount: () => pres.slides.length,
        gotoSlide: (i) => {
            calls.goto.push(i);
            slideIndex = i;
        },
        getSelectedShapeIds: () => selected,
        execute: (cmd) => {
            calls.execute.push(cmd.label);
        },
        undo: () => {
            calls.undo++;
            return true;
        },
        redo: () => {
            calls.redo++;
            return true;
        },
        stackInfo: () => ({ canUndo: false, canRedo: false }),
        stageElement: () => ({}),
        hostElement: () => ({}),
    };
    return {
        presentation: pres,
        editor,
        events: bus,
        ui: noopUi,
        shared: {},
        locale: opts.locale ?? "en",
        log: () => { },
        fireSelectionChange: (e) => bus.fire("selectionchange", e),
        fireSlideChange: (e) => bus.fire("slidechange", e),
        calls,
    };
}
