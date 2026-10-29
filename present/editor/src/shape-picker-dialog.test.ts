import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
// @ts-expect-error jsdom ships without types in this repo; tests run via tsx.
import { JSDOM } from "jsdom";
import type { RibbonActions } from "./ribbon.js";

function installDom(): Document {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const g = globalThis as unknown as {
    window: Window & typeof globalThis;
    document: Document;
    HTMLElement: typeof HTMLElement;
    Node: typeof Node;
    SVGElement: typeof SVGElement;
    HTMLButtonElement: typeof HTMLButtonElement;
    HTMLInputElement: typeof HTMLInputElement;
    HTMLSelectElement: typeof HTMLSelectElement;
    HTMLTextAreaElement: typeof HTMLTextAreaElement;
    Element: typeof Element;
    Event: typeof Event;
    CustomEvent: typeof CustomEvent;
    MutationObserver: typeof MutationObserver;
    ResizeObserver: typeof ResizeObserver;
    getComputedStyle: typeof getComputedStyle;
  };
  g.window = dom.window as unknown as Window & typeof globalThis;
  g.document = dom.window.document;
  g.HTMLElement = dom.window.HTMLElement;
  g.Node = dom.window.Node;
  g.SVGElement = dom.window.SVGElement;
  g.HTMLButtonElement = dom.window.HTMLButtonElement;
  g.HTMLInputElement = dom.window.HTMLInputElement;
  g.HTMLSelectElement = dom.window.HTMLSelectElement;
  g.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
  g.Element = dom.window.Element;
  g.Event = dom.window.Event;
  g.CustomEvent = dom.window.CustomEvent;
  g.MutationObserver = dom.window.MutationObserver;
  g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  if (typeof g.ResizeObserver !== "function") {
    g.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
  }
  return dom.window.document;
}

describe("shape more button and dialog", () => {
  let doc: Document;
  let openShapePickerDialog: typeof import("./shape-picker-dialog.js").openShapePickerDialog;
  let buildRibbon: typeof import("./ribbon.js").buildRibbon;

  before(async () => {
    doc = installDom();
    ({ openShapePickerDialog } = await import("./shape-picker-dialog.js"));
    ({ buildRibbon } = await import("./ribbon.js"));
  });

  it("opens a categorized dialog and returns the picked preset", async () => {
    const pending = openShapePickerDialog(doc);
    const dialog = doc.querySelector<HTMLElement>("[data-ppt-dialog]");
    assert.ok(dialog);
    assert.equal(doc.querySelector("[data-ppt-shape-picker]"), null);
    assert.match(dialog.textContent ?? "", /Lines/);
    assert.match(dialog.textContent ?? "", /Callouts/);
    const rect = dialog.querySelector<HTMLButtonElement>('[data-ppt-shape-id="roundRect"]');
    assert.ok(rect);
    rect.click();
    assert.equal(await pending, "roundRect");
    assert.equal(doc.querySelector("[data-ppt-dialog]"), null);
  });

  it("places More after every shortcut in the shapes group", () => {
    const ribbon = buildRibbon(doc, {
      insertShape: () => {},
      insertImage: () => {},
      insertSlide: () => {},
      insertTable: () => {},
      setSlideAspect: () => {},
      setBackground: () => {},
      setZoom: () => {},
      toggleGrid: () => false,
      bringForward: () => {},
      sendBackward: () => {},
      bringFront: () => {},
      sendBack: () => {},
      undo: () => {},
      redo: () => {},
      duplicate: () => {},
      remove: () => {},
      applyTextStyle: () => {},
      applyAlign: () => {},
      getCurrentTextRun: () => undefined,
    } as RibbonActions);
    doc.body.appendChild(ribbon.el);
    const shapes = [...doc.querySelectorAll(".ppt-ribbon-group")].find(
      (g) => g.querySelector(".ppt-ribbon-group__label")?.textContent === "Shapes",
    );
    assert.ok(shapes);
    const buttons = [...shapes.querySelectorAll<HTMLButtonElement>(":scope > .ppt-ribbon-group__rows button")];
    assert.equal(buttons.at(-1)?.getAttribute("aria-label"), "More shapes — open category picker");
    assert.equal(buttons.at(-1)?.textContent?.trim(), "More");
    const labels = buttons.map((b) => b.getAttribute("aria-label"));
    assert.ok(labels.indexOf("Rounded Rectangle") < labels.length - 1);
    ribbon.destroy();
    ribbon.el.remove();
  });
});

describe("quick bar shape menu", () => {
  let doc: Document;
  let buildRibbon: typeof import("./ribbon.js").buildRibbon;

  before(async () => {
    doc = installDom();
    ({ buildRibbon } = await import("./ribbon.js"));
  });

  function mount(armed: string[], inserted: string[]) {
    const ribbon = buildRibbon(doc, {
      insertShape: (kind: string) => {
        inserted.push(kind);
      },
      armShapeDraw: (kind: string) => {
        armed.push(kind);
      },
      insertImage: () => {},
      setSlideAspect: () => {},
      setBackground: () => {},
      setZoom: () => {},
      toggleGrid: () => false,
      bringForward: () => {},
      sendBackward: () => {},
      bringFront: () => {},
      sendBack: () => {},
      undo: () => {},
      redo: () => {},
      duplicate: () => {},
      remove: () => {},
      applyTextStyle: () => {},
      applyAlign: () => {},
      getCurrentTextRun: () => undefined,
    } as RibbonActions);
    doc.body.append(ribbon.el, ribbon.commandBar);
    const button = doc.querySelector<HTMLButtonElement>('[data-quick-id="shape"]');
    assert.ok(button);
    return { ribbon, button };
  }

  it("opens the six common shapes plus More, and draws the picked shape", async () => {
    const armed: string[] = [];
    const inserted: string[] = [];
    const { ribbon, button } = mount(armed, inserted);
    assert.equal(button.getAttribute("aria-label"), "Choose a shape");
    assert.equal(button.querySelector("span > span")?.textContent, "Shape");
    button.click();
    assert.deepEqual(armed, []);
    assert.deepEqual(inserted, []);
    const menu = doc.querySelector<HTMLElement>("[data-ppt-quick-shapes]");
    assert.ok(menu);
    assert.equal(button.getAttribute("aria-expanded"), "true");
    const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    assert.deepEqual(
      items.map((item) => item.textContent),
      ["Rectangle", "Ellipse", "Triangle", "Star", "Line", "Arrow", "More"],
    );
    assert.equal(items.filter((item) => item.querySelector("svg")).length, items.length);
    items[1]!.click();
    assert.deepEqual(armed, ["ellipse"]);
    assert.deepEqual(inserted, []);
    assert.equal(doc.querySelector("[data-ppt-quick-shapes]"), null);
    assert.equal(button.getAttribute("aria-expanded"), "false");

    button.click();
    const again = doc.querySelector<HTMLElement>("[data-ppt-quick-shapes]");
    assert.ok(again);
    again.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[6]!.click();
    assert.equal(doc.querySelector("[data-ppt-quick-shapes]"), null);
    const dialog = doc.querySelector<HTMLElement>("[data-ppt-dialog]");
    assert.ok(dialog);
    dialog.querySelector<HTMLButtonElement>('[data-ppt-shape-id="roundRect"]')!.click();
    await Promise.resolve();
    assert.deepEqual(armed, ["ellipse", "roundRect"]);
    ribbon.destroy();
    ribbon.el.remove();
    ribbon.commandBar.remove();
  });

  it("closes the menu when the shape button is clicked again", () => {
    const { ribbon, button } = mount([], []);
    button.click();
    assert.ok(doc.querySelector("[data-ppt-quick-shapes]"));
    button.click();
    assert.equal(doc.querySelector("[data-ppt-quick-shapes]"), null);
    assert.equal(button.getAttribute("aria-expanded"), "false");
    ribbon.destroy();
    ribbon.el.remove();
    ribbon.commandBar.remove();
  });
});
