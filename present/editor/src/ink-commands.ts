import type { EditCommand, Presentation, Rect, Shape, TextShape } from "@ppt/core";
import { isInkShapeId } from "./ink-tool";
import { createTextBox, genShapeId } from "./shape-factory";
import { findMainLayer } from "./slide-layout-utils";

interface RemovedInk {
  layerIdx: number;
  pos: number;
  shape: Shape;
}

interface InkConvertSnapshot {
  newId: string;
  prevId: string;
  prevName?: string;
}

/** Remove all ink path shapes from one slide (undoable). */
export class ClearInkOnSlideCmd implements EditCommand {
  readonly label = "Clear ink";
  private removed: RemovedInk[] = [];

  constructor(private slideIdx: number) {}

  apply(pres: Presentation): void {
    this.removed = [];
    const slide = pres.slides[this.slideIdx];
    if (!slide) return;
    for (let li = 0; li < slide.layers.length; li++) {
      const layer = slide.layers[li]!;
      for (let pos = layer.shapes.length - 1; pos >= 0; pos--) {
        const sh = layer.shapes[pos]!;
        if (!isInkShapeId(sh.id)) continue;
        this.removed.push({ layerIdx: li, pos, shape: sh });
        layer.shapes.splice(pos, 1);
      }
    }
  }

  revert(pres: Presentation): void {
    const slide = pres.slides[this.slideIdx];
    if (!slide) return;
    for (const item of this.removed) {
      const layer = slide.layers[item.layerIdx];
      if (!layer) continue;
      layer.shapes.splice(item.pos, 0, item.shape);
    }
    this.removed = [];
  }
}

/** Convert ink strokes on the current slide to regular freeform path shapes. */
export class ConvertInkToShapeCmd implements EditCommand {
  readonly label = "Convert ink to shape";
  private changed: InkConvertSnapshot[] = [];

  constructor(
    private slideIdx: number,
    private shapeIds: string[],
  ) {}

  apply(pres: Presentation): void {
    if (this.changed.length > 0) return;
    const slide = pres.slides[this.slideIdx];
    const main = slide ? findMainLayer(slide) : undefined;
    if (!main) return;
    const idSet = new Set(this.shapeIds);
    for (const sh of main.shapes) {
      if (sh.kind !== "path" || !idSet.has(sh.id) || !isInkShapeId(sh.id)) continue;
      const newId = genShapeId("path");
      this.changed.push({ newId, prevId: sh.id, prevName: sh.name });
      sh.id = newId;
      sh.name = "Freeform";
    }
  }

  revert(pres: Presentation): void {
    const slide = pres.slides[this.slideIdx];
    const main = slide ? findMainLayer(slide) : undefined;
    if (!main) return;
    for (const snap of this.changed) {
      const target = main.shapes.find((s) => s.id === snap.newId);
      if (!target) continue;
      target.id = snap.prevId;
      if (snap.prevName !== undefined) target.name = snap.prevName;
    }
    this.changed = [];
  }
}

interface RemovedInkPos {
  layerIdx: number;
  pos: number;
  shape: Shape;
}

/** Convert ink strokes to a text box using pre-recognized text (OCR runs outside the command). */
export class ConvertInkToTextCmd implements EditCommand {
  readonly label = "Convert ink to text";
  private removed: RemovedInkPos[] = [];
  private addedText?: TextShape;
  private insertPos = 0;

  constructor(
    private slideIdx: number,
    private shapeIds: string[],
    private recognizedText: string,
    private textBbox: Rect,
  ) {}

  apply(pres: Presentation): void {
    if (this.addedText) return;
    const slide = pres.slides[this.slideIdx];
    const main = slide ? findMainLayer(slide) : undefined;
    if (!slide || !main) return;
    const idSet = new Set(this.shapeIds);
    let minPos = Infinity;
    for (let li = 0; li < slide.layers.length; li++) {
      const layer = slide.layers[li]!;
      for (let pos = layer.shapes.length - 1; pos >= 0; pos--) {
        const sh = layer.shapes[pos]!;
        if (sh.kind !== "path" || !idSet.has(sh.id) || !isInkShapeId(sh.id)) continue;
        if (layer === main) minPos = Math.min(minPos, pos);
        this.removed.push({ layerIdx: li, pos, shape: sh });
        layer.shapes.splice(pos, 1);
      }
    }
    if (!this.removed.length) return;
    const fontSize = Math.max(14, Math.min(48, Math.round(this.textBbox.h * 0.65)));
    this.addedText = createTextBox(this.textBbox, {
      text: this.recognizedText,
      name: "Ink text",
      idPrefix: "inktxt",
      fontSize,
      fill: { kind: "none" },
    });
    this.insertPos = minPos === Infinity ? main.shapes.length : minPos;
    main.shapes.splice(this.insertPos, 0, this.addedText);
  }

  revert(pres: Presentation): void {
    const slide = pres.slides[this.slideIdx];
    const main = slide ? findMainLayer(slide) : undefined;
    if (!slide || !main || !this.addedText) return;
    const idx = main.shapes.findIndex((s) => s.id === this.addedText!.id);
    if (idx >= 0) main.shapes.splice(idx, 1);
    const sorted = [...this.removed].sort((a, b) => a.layerIdx - b.layerIdx || a.pos - b.pos);
    for (const item of sorted) {
      const layer = slide.layers[item.layerIdx];
      if (!layer) continue;
      layer.shapes.splice(Math.min(item.pos, layer.shapes.length), 0, item.shape);
    }
    this.removed = [];
    this.addedText = undefined;
  }
}
