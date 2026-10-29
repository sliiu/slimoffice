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
    requestAnimationFrame: typeof requestAnimationFrame;
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
  g.requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  };
  if (typeof g.ResizeObserver !== "function") {
    g.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
  }
  return dom.window.document;
}

describe("command strip stays visible while the group list is open", () => {
  let doc: Document;
  let buildRibbon: typeof import("./ribbon.js").buildRibbon;

  before(async () => {
    doc = installDom();
    ({ buildRibbon } = await import("./ribbon.js"));
  });

  function mount(undos: { n: number }) {
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
      undo: () => {
        undos.n += 1;
      },
      canUndo: () => true,
      redo: () => {},
      duplicate: () => {},
      remove: () => {},
      applyTextStyle: () => {},
      applyAlign: () => {},
      getCurrentTextRun: () => undefined,
    } as RibbonActions);
    doc.body.append(ribbon.el, ribbon.commandBar);
    return ribbon;
  }

  it("keeps edit-and-text commands on the strip and still runs them from the list", () => {
    const undos = { n: 0 };
    const ribbon = mount(undos);
    doc.querySelector<HTMLButtonElement>(".ppt-group-pill")?.click();
    doc.querySelector<HTMLButtonElement>('[data-group="editText"]')?.click();

    const strip = doc.getElementById("ppt-command-strip");
    assert.ok(strip);
    const before = strip.querySelectorAll(".ppt-ribbon-btn").length;
    assert.ok(before > 0);

    doc.querySelector<HTMLButtonElement>("[data-ppt-command-list]")?.click();

    const pop = doc.querySelector<HTMLElement>(".ppt-topbar-popover.ppt-command-host");
    assert.ok(pop);
    assert.equal(pop.getAttribute("aria-label"), "Edit & text");
    const hold = strip.querySelector<HTMLElement>("[data-ppt-strip-hold]");
    assert.ok(hold);
    assert.equal(hold.getAttribute("inert"), "");
    assert.equal(strip.querySelectorAll(".ppt-ribbon-btn").length, before);
    assert.equal(pop.querySelector("[data-ppt-strip-hold]"), null);
    assert.ok(pop.querySelector(".ppt-ribbon-btn"));

    pop.querySelector<HTMLButtonElement>('[aria-label="Undo (⌘Z)"]')?.click();
    assert.equal(undos.n, 1);

    doc.querySelector<HTMLButtonElement>("[data-ppt-command-list]")?.click();
    assert.equal(doc.querySelector(".ppt-topbar-popover.ppt-command-host"), null);
    assert.equal(strip.querySelector("[data-ppt-strip-hold]"), null);
    assert.equal(strip.querySelectorAll(".ppt-ribbon-btn").length, before);
    strip.querySelector<HTMLButtonElement>('[aria-label="Undo (⌘Z)"]')?.click();
    assert.equal(undos.n, 2);

    ribbon.destroy();
    ribbon.el.remove();
    ribbon.commandBar.remove();
  });
});
