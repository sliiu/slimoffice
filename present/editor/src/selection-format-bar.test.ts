import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error jsdom ships without types in this repo; tests run via tsx.
import { JSDOM } from "jsdom";
import { encodeIconDescr } from "./icon-picker-dialog.js";
import {
  FORMAT_BAR_ZOOM_IN,
  formatBarPosition,
  formatSubject,
  mountSelectionFormatBar,
  scaleRectAboutCenter,
  selectionFormatMode,
  type SelectionFormatActions,
  type SelectionFormatView,
} from "./selection-format-bar.js";

const view = { left: 80, top: 120, right: 900, bottom: 700 };
const viewport = { w: 1440, h: 900 };
const bar = { w: 220, h: 36 };

const base = { view: "normal", background: false, dragging: false, editingText: false };

describe("format subject", () => {
  it("buckets fillable geometry, lines, pictures, tables, and text cells", () => {
    assert.equal(formatSubject({ kind: "rect" }), "shape");
    assert.equal(formatSubject({ kind: "ellipse" }), "shape");
    assert.equal(formatSubject({ kind: "path" }), "shape");
    assert.equal(formatSubject({ kind: "polygon" }), "shape");
    assert.equal(formatSubject({ kind: "line" }), "line");
    assert.equal(formatSubject({ kind: "image" }), "image");
    assert.equal(formatSubject({ kind: "image", descr: encodeIconDescr("star", "#111827") }), "icon");
    assert.equal(formatSubject({ kind: "image", descr: "a photo" }), "image");
    assert.equal(formatSubject({ kind: "group", tableMeta: { rows: 2, cols: 2 } }), "table");
    assert.equal(formatSubject({ kind: "text" }), "text");
    assert.equal(formatSubject({ kind: "text", cellMeta: {} }), "text");
    assert.equal(formatSubject({ kind: "group", smartArtMeta: { layout: "list" } }), "other");
    assert.equal(formatSubject({ kind: "chart" }), "other");
    assert.equal(formatSubject({ kind: "group" }), "other");
  });
});

describe("selection format bar mode", () => {
  it("shows text controls for a text box or an open text editor", () => {
    assert.deepEqual(
      selectionFormatMode({ ...base, subjects: ["text"] }),
      { kind: "text" },
    );
    assert.deepEqual(
      selectionFormatMode({ ...base, editingText: true, subjects: ["shape"] }),
      { kind: "text" },
    );
  });

  it("shows fill for one shape, align from two, distribute from three", () => {
    assert.deepEqual(
      selectionFormatMode({ ...base, subjects: ["shape"] }),
      { kind: "shape", align: false, distribute: false },
    );
    assert.deepEqual(
      selectionFormatMode({ ...base, subjects: ["shape", "shape"] }),
      { kind: "shape", align: true, distribute: false },
    );
    assert.deepEqual(
      selectionFormatMode({ ...base, subjects: ["shape", "shape", "shape"] }),
      { kind: "shape", align: true, distribute: true },
    );
  });

  it("gives lines, pictures, and tables their own bars", () => {
    assert.deepEqual(selectionFormatMode({ ...base, subjects: ["line"] }), { kind: "line" });
    assert.deepEqual(selectionFormatMode({ ...base, subjects: ["line", "line"] }), { kind: "line" });
    assert.deepEqual(selectionFormatMode({ ...base, subjects: ["image"] }), { kind: "image" });
    assert.deepEqual(selectionFormatMode({ ...base, subjects: ["icon"] }), { kind: "icon" });
    assert.deepEqual(selectionFormatMode({ ...base, subjects: ["icon", "icon"] }), { kind: "icon" });
    assert.deepEqual(selectionFormatMode({ ...base, subjects: ["table"] }), { kind: "table" });
  });

  it("hides when the selection mixes buckets or is a kind without a bar", () => {
    assert.equal(selectionFormatMode({ ...base, subjects: ["shape", "line"] }).kind, "hidden");
    assert.equal(selectionFormatMode({ ...base, subjects: ["text", "image"] }).kind, "hidden");
    assert.equal(selectionFormatMode({ ...base, subjects: ["icon", "image"] }).kind, "hidden");
    assert.equal(selectionFormatMode({ ...base, subjects: ["other"] }).kind, "hidden");
    assert.equal(selectionFormatMode({ ...base, subjects: ["table", "shape"] }).kind, "hidden");
  });

  it("hides while dragging, outside normal view, on the background, or with nothing selected", () => {
    assert.equal(selectionFormatMode({ ...base, dragging: true, subjects: ["text"] }).kind, "hidden");
    assert.equal(selectionFormatMode({ ...base, view: "reading", subjects: ["text"] }).kind, "hidden");
    assert.equal(selectionFormatMode({ ...base, view: "sorter", subjects: ["shape", "shape"] }).kind, "hidden");
    assert.equal(selectionFormatMode({ ...base, background: true, subjects: ["shape"] }).kind, "hidden");
    assert.equal(selectionFormatMode({ ...base, subjects: [] }).kind, "hidden");
  });
});

describe("selection format bar position", () => {
  it("sits above the selection when there is room inside the canvas", () => {
    const pos = formatBarPosition({
      anchor: { left: 400, top: 300, right: 560, bottom: 380 },
      view,
      bar,
      viewport,
    });
    assert.deepEqual(pos, { left: 370, top: 300 - 8 - 36 });
  });

  it("drops below the selection when the canvas top would cover the bar", () => {
    const pos = formatBarPosition({
      anchor: { left: 400, top: 130, right: 560, bottom: 180 },
      view,
      bar,
      viewport,
    });
    assert.ok(pos);
    assert.equal(pos.top, 180 + 8);
    assert.equal(pos.left, 370);
  });

  it("hides when the selection is scrolled out of the canvas", () => {
    assert.equal(
      formatBarPosition({
        anchor: { left: 400, top: -200, right: 560, bottom: -40 },
        view,
        bar,
        viewport,
      }),
      null,
    );
  });

  it("stays inside the canvas when a zoomed selection hangs into the slide column", () => {
    const narrow = { w: 38, h: 36 };
    const canvas = { left: 180, top: 100, right: 1000, bottom: 700 };
    const pos = formatBarPosition({
      anchor: { left: 40, top: 280, right: 190, bottom: 360 },
      view: canvas,
      bar: narrow,
      viewport,
    });
    assert.ok(pos);
    assert.ok(pos.left >= canvas.left + 8, `left ${pos.left} covers the slide column`);
    assert.ok(pos.left + narrow.w <= canvas.right - 8);
    assert.ok(pos.top >= canvas.top + 8);
    assert.ok(pos.top + narrow.h <= canvas.bottom - 8);
  });

  it("uses the visible slice of a zoomed selection instead of its off-canvas center", () => {
    const pos = formatBarPosition({
      anchor: { left: -2000, top: 240, right: 2500, bottom: 420 },
      view,
      bar: { w: 38, h: 36 },
      viewport,
    });
    assert.ok(pos);
    const visibleMid = (view.left + view.right) / 2;
    assert.ok(Math.abs(pos.left + 19 - visibleMid) < 2);
    assert.ok(pos.left >= view.left + 8);
    assert.ok(pos.left + 38 <= view.right - 8);
  });

  it("pins to the canvas left when the bar is wider than the canvas", () => {
    const canvas = { left: 180, top: 100, right: 360, bottom: 700 };
    const pos = formatBarPosition({
      anchor: { left: 200, top: 300, right: 320, bottom: 380 },
      view: canvas,
      bar,
      viewport,
    });
    assert.ok(pos);
    assert.equal(pos.left, canvas.left + 8);
    assert.ok(pos.top >= canvas.top + 8);
    assert.ok(pos.top + bar.h <= canvas.bottom - 8);
  });
});

function stubActions(): SelectionFormatActions {
  const noop = () => {};
  return {
    label: (key) => key,
    liveStart: noop,
    liveEnd: noop,
    applyFontSize: noop,
    toggleBold: noop,
    applyTextColor: noop,
    applyAlign: noop,
    toggleBullet: noop,
    applyFill: noop,
    applyStroke: noop,
    applyStrokeWidth: noop,
    applyArrows: noop,
    replaceImage: noop,
    replaceIcon: noop,
    crop: noop,
    zoom: noop,
    rotateQuarter: noop,
    flip: noop,
    table: noop,
    align: noop,
    distribute: noop,
  };
}

function textBarState(anchorTop: number): SelectionFormatView {
  return {
    mode: { kind: "text" },
    anchor: { left: 400, top: anchorTop, right: 560, bottom: anchorTop + 80 },
    view,
    viewport,
    fontSize: 24,
    bold: false,
    textColor: "#111827",
    bullet: false,
    fill: "#94a3b8",
    stroke: "#1e3a8a",
    strokeWidth: 1,
    arrows: "none",
    croppable: false,
    cropping: false,
    arrangeable: false,
  };
}

function isHtmlInput(el: Element | null, win: Window & typeof globalThis): el is HTMLInputElement {
  return !!el && el instanceof win.HTMLInputElement;
}

describe("selection format size stepper", () => {
  it("steps immediately, keeps repeating while held, and does not move the bar", async () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const doc = dom.window.document;
    const bar = mountSelectionFormatBar(doc, stubActions());
    Object.defineProperty(bar.el, "offsetWidth", { configurable: true, get: () => 220 });
    Object.defineProperty(bar.el, "offsetHeight", { configurable: true, get: () => 36 });

    bar.sync(textBarState(300));
    assert.equal(bar.el.style.top, "256px");
    assert.equal(bar.el.style.visibility, "visible");

    const size = bar.el.querySelector("input.ppt-selection-format-size");
    const win = doc.defaultView;
    if (!win || !isHtmlInput(size, win)) assert.fail("size input");
    assert.equal(size.value, "18");
    const up = bar.el.querySelector<HTMLButtonElement>("[data-spin='up']");
    assert.ok(up);

    const down = new dom.window.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
    size.dispatchEvent(down);
    assert.equal(down.defaultPrevented, false);

    up.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
    assert.equal(size.value, "19");
    bar.sync(textBarState(180));
    assert.equal(bar.el.style.top, "256px");
    assert.equal(bar.el.style.visibility, "visible");
    assert.equal(size.value, "19");

    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.ok(Number(size.value) >= 20);

    doc.dispatchEvent(new dom.window.MouseEvent("pointerup", { bubbles: true, button: 0 }));
    assert.equal(bar.el.style.top, "136px");
    const held = size.value;
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(size.value, held);

    const bold = bar.el.querySelector(".ppt-selection-format-btn");
    assert.ok(bold);
    const buttonDown = new dom.window.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
    bold.dispatchEvent(buttonDown);
    assert.equal(buttonDown.defaultPrevented, true);

    bar.destroy();
    assert.equal(doc.body.contains(bar.el), false);
  });
});

describe("picture arrange on the format bar", () => {
  it("grows and shrinks about the center, and stops before the frame disappears", () => {
    const next = scaleRectAboutCenter({ x: 100, y: 50, w: 200, h: 100 }, FORMAT_BAR_ZOOM_IN);
    assert.ok(next);
    assert.ok(Math.abs(next.x + next.w / 2 - 200) < 1e-6);
    assert.ok(Math.abs(next.y + next.h / 2 - 100) < 1e-6);
    assert.ok(Math.abs(next.w - 220) < 1e-6);
    assert.ok(Math.abs(next.h - 110) < 1e-6);
    assert.equal(scaleRectAboutCenter({ x: 0, y: 0, w: 8, h: 20 }, 0.9), null);
  });

  it("shows zoom, rotate, and flip for one picture or video, not for a shape", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const doc = dom.window.document;
    const bar = mountSelectionFormatBar(doc, stubActions());
    Object.defineProperty(bar.el, "offsetWidth", { configurable: true, get: () => 280 });
    Object.defineProperty(bar.el, "offsetHeight", { configurable: true, get: () => 36 });
    const labels = () =>
      [...bar.el.querySelectorAll("button")]
        .filter((b) => !b.hidden && !b.closest("[hidden]"))
        .map((b) => b.getAttribute("aria-label"));

    bar.sync({ ...textBarState(300), mode: { kind: "image" }, arrangeable: true, croppable: true });
    const svgOf = (label: string) => bar.el.querySelector(`button[aria-label="${label}"] svg`)?.innerHTML ?? "";
    assert.match(svgOf("inspector.flipH"), /M12 14v2/);
    assert.match(svgOf("inspector.flipV"), /M10 12H8/);
    assert.deepEqual(labels().filter((l) => l?.startsWith("toolbar.formatBar") || l?.startsWith("ribbon.rotate") || l?.startsWith("inspector.flip")), [
      "toolbar.formatBar.zoomIn",
      "toolbar.formatBar.zoomOut",
      "ribbon.rotate.plus90",
      "inspector.flipH",
      "inspector.flipV",
      "toolbar.formatBar.replaceImage",
      "toolbar.formatBar.crop",
    ]);

    bar.sync({ ...textBarState(300), mode: { kind: "shape", align: false, distribute: false }, arrangeable: false });
    assert.equal(labels().some((l) => l === "toolbar.formatBar.zoomIn"), false);

    bar.sync({ ...textBarState(300), mode: { kind: "hidden" }, arrangeable: true, croppable: true });
    assert.deepEqual(labels(), [
      "toolbar.formatBar.zoomIn",
      "toolbar.formatBar.zoomOut",
      "ribbon.rotate.plus90",
      "inspector.flipH",
      "inspector.flipV",
      "toolbar.formatBar.crop",
    ]);

    bar.destroy();
  });
});
