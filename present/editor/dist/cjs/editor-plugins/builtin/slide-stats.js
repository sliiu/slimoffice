"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slideStatsEditorPlugin = void 0;
const core_1 = require("@sliiu/present-core");
const define_1 = require("../define");
function countShapes(pres) {
    let n = 0;
    for (const slide of pres.slides) {
        for (const layer of slide.layers)
            n += layer.shapes.length;
    }
    return n;
}
function countOnSlide(slide) {
    if (!slide)
        return 0;
    return slide.layers.reduce((sum, l) => sum + l.shapes.length, 0);
}
/** Built-in demo plugin — shows deck / slide shape counts in a floating panel. */
exports.slideStatsEditorPlugin = (0, define_1.defineEditorPlugin)({
    id: core_1.OFFICIAL_EDITOR_PLUGIN_IDS.slideStats,
    name: "Slide stats",
    version: "1.0.0",
    activate(ctx) {
        const doc = ctx.editor.hostElement().ownerDocument;
        const deckLine = doc.createElement("div");
        const slideLine = doc.createElement("div");
        const selLine = doc.createElement("div");
        const panel = ctx.ui.addPanel({
            id: "slide-stats-panel",
            title: ctx.locale.startsWith("zh") ? "形状统计" : "Shape stats",
            initialOpen: true,
            render(host) {
                host.style.cssText = "display:flex;flex-direction:column;gap:6px;line-height:1.5";
                host.append(deckLine, slideLine, selLine);
            },
        });
        const refreshDeckAndSlide = () => {
            const pres = ctx.editor.getPresentation();
            const idx = ctx.editor.getSlideIndex();
            const slide = pres.slides[idx];
            const zh = ctx.locale.startsWith("zh");
            deckLine.textContent = zh
                ? `全稿形状：${countShapes(pres)}`
                : `Deck shapes: ${countShapes(pres)}`;
            slideLine.textContent = zh
                ? `当前页形状：${countOnSlide(slide)}`
                : `This slide: ${countOnSlide(slide)}`;
        };
        const refreshSelection = () => {
            const sel = ctx.editor.getSelectedShapeIds();
            const zh = ctx.locale.startsWith("zh");
            selLine.textContent = zh ? `已选：${sel.length}` : `Selected: ${sel.length}`;
        };
        const refresh = () => {
            refreshDeckAndSlide();
            refreshSelection();
        };
        const offs = [
            ctx.events.on("selectionchange", refreshSelection),
            ctx.events.on("slidechange", refresh),
            ctx.events.on("command", refresh),
            ctx.events.on("presentationchange", refresh),
        ];
        refresh();
        return () => {
            for (const off of offs)
                off();
            panel.remove();
        };
    },
});
