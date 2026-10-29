"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConvertInkToTextCmd = exports.ConvertInkToShapeCmd = exports.ClearInkOnSlideCmd = void 0;
const ink_tool_1 = require("./ink-tool");
const shape_factory_1 = require("./shape-factory");
const slide_layout_utils_1 = require("./slide-layout-utils");
/** Remove all ink path shapes from one slide (undoable). */
class ClearInkOnSlideCmd {
    slideIdx;
    label = "Clear ink";
    removed = [];
    constructor(slideIdx) {
        this.slideIdx = slideIdx;
    }
    apply(pres) {
        this.removed = [];
        const slide = pres.slides[this.slideIdx];
        if (!slide)
            return;
        for (let li = 0; li < slide.layers.length; li++) {
            const layer = slide.layers[li];
            for (let pos = layer.shapes.length - 1; pos >= 0; pos--) {
                const sh = layer.shapes[pos];
                if (!(0, ink_tool_1.isInkShapeId)(sh.id))
                    continue;
                this.removed.push({ layerIdx: li, pos, shape: sh });
                layer.shapes.splice(pos, 1);
            }
        }
    }
    revert(pres) {
        const slide = pres.slides[this.slideIdx];
        if (!slide)
            return;
        for (const item of this.removed) {
            const layer = slide.layers[item.layerIdx];
            if (!layer)
                continue;
            layer.shapes.splice(item.pos, 0, item.shape);
        }
        this.removed = [];
    }
}
exports.ClearInkOnSlideCmd = ClearInkOnSlideCmd;
/** Convert ink strokes on the current slide to regular freeform path shapes. */
class ConvertInkToShapeCmd {
    slideIdx;
    shapeIds;
    label = "Convert ink to shape";
    changed = [];
    constructor(slideIdx, shapeIds) {
        this.slideIdx = slideIdx;
        this.shapeIds = shapeIds;
    }
    apply(pres) {
        if (this.changed.length > 0)
            return;
        const slide = pres.slides[this.slideIdx];
        const main = slide ? (0, slide_layout_utils_1.findMainLayer)(slide) : undefined;
        if (!main)
            return;
        const idSet = new Set(this.shapeIds);
        for (const sh of main.shapes) {
            if (sh.kind !== "path" || !idSet.has(sh.id) || !(0, ink_tool_1.isInkShapeId)(sh.id))
                continue;
            const newId = (0, shape_factory_1.genShapeId)("path");
            this.changed.push({ newId, prevId: sh.id, prevName: sh.name });
            sh.id = newId;
            sh.name = "Freeform";
        }
    }
    revert(pres) {
        const slide = pres.slides[this.slideIdx];
        const main = slide ? (0, slide_layout_utils_1.findMainLayer)(slide) : undefined;
        if (!main)
            return;
        for (const snap of this.changed) {
            const target = main.shapes.find((s) => s.id === snap.newId);
            if (!target)
                continue;
            target.id = snap.prevId;
            if (snap.prevName !== undefined)
                target.name = snap.prevName;
        }
        this.changed = [];
    }
}
exports.ConvertInkToShapeCmd = ConvertInkToShapeCmd;
/** Convert ink strokes to a text box using pre-recognized text (OCR runs outside the command). */
class ConvertInkToTextCmd {
    slideIdx;
    shapeIds;
    recognizedText;
    textBbox;
    label = "Convert ink to text";
    removed = [];
    addedText;
    insertPos = 0;
    constructor(slideIdx, shapeIds, recognizedText, textBbox) {
        this.slideIdx = slideIdx;
        this.shapeIds = shapeIds;
        this.recognizedText = recognizedText;
        this.textBbox = textBbox;
    }
    apply(pres) {
        if (this.addedText)
            return;
        const slide = pres.slides[this.slideIdx];
        const main = slide ? (0, slide_layout_utils_1.findMainLayer)(slide) : undefined;
        if (!slide || !main)
            return;
        const idSet = new Set(this.shapeIds);
        let minPos = Infinity;
        for (let li = 0; li < slide.layers.length; li++) {
            const layer = slide.layers[li];
            for (let pos = layer.shapes.length - 1; pos >= 0; pos--) {
                const sh = layer.shapes[pos];
                if (sh.kind !== "path" || !idSet.has(sh.id) || !(0, ink_tool_1.isInkShapeId)(sh.id))
                    continue;
                if (layer === main)
                    minPos = Math.min(minPos, pos);
                this.removed.push({ layerIdx: li, pos, shape: sh });
                layer.shapes.splice(pos, 1);
            }
        }
        if (!this.removed.length)
            return;
        const fontSize = Math.max(14, Math.min(48, Math.round(this.textBbox.h * 0.65)));
        this.addedText = (0, shape_factory_1.createTextBox)(this.textBbox, {
            text: this.recognizedText,
            name: "Ink text",
            idPrefix: "inktxt",
            fontSize,
            fill: { kind: "none" },
        });
        this.insertPos = minPos === Infinity ? main.shapes.length : minPos;
        main.shapes.splice(this.insertPos, 0, this.addedText);
    }
    revert(pres) {
        const slide = pres.slides[this.slideIdx];
        const main = slide ? (0, slide_layout_utils_1.findMainLayer)(slide) : undefined;
        if (!slide || !main || !this.addedText)
            return;
        const idx = main.shapes.findIndex((s) => s.id === this.addedText.id);
        if (idx >= 0)
            main.shapes.splice(idx, 1);
        const sorted = [...this.removed].sort((a, b) => a.layerIdx - b.layerIdx || a.pos - b.pos);
        for (const item of sorted) {
            const layer = slide.layers[item.layerIdx];
            if (!layer)
                continue;
            layer.shapes.splice(Math.min(item.pos, layer.shapes.length), 0, item.shape);
        }
        this.removed = [];
        this.addedText = undefined;
    }
}
exports.ConvertInkToTextCmd = ConvertInkToTextCmd;
