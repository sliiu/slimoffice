import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
// @ts-expect-error jsdom ships without types in this repo; tests run via tsx.
import { JSDOM } from "jsdom";
import type { Presentation, Slide } from "@ppt/core";
import type { PresentationViewHost } from "./presentation-views.js";

function installDom(): Document {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const g = globalThis as unknown as {
    window: Window & typeof globalThis;
    document: Document;
    HTMLElement: typeof HTMLElement;
    Node: typeof Node;
    SVGElement: typeof SVGElement;
  };
  g.window = dom.window as unknown as Window & typeof globalThis;
  g.document = dom.window.document;
  g.HTMLElement = dom.window.HTMLElement;
  g.Node = dom.window.Node;
  g.SVGElement = dom.window.SVGElement;
  return dom.window.document;
}

function slide(id: string, name: string, notes?: string): Slide {
  return {
    id,
    name,
    index: 0,
    notes,
    layers: [{ id: "content", name: "Content", visible: true, locked: false, shapes: [] }],
  } as unknown as Slide;
}

describe("notes page slide switch", () => {
  let doc: Document;
  let mountNotesPageView: typeof import("./presentation-views.js").mountNotesPageView;

  before(async () => {
    doc = installDom();
    ({ mountNotesPageView } = await import("./presentation-views.js"));
  });

  it("follows the live slide index from the pager and from an external refresh", () => {
    const pres = {
      size: { width: 320, height: 180 },
      slides: [slide("a", "cover", "open"), slide("b", "middle", "talk"), slide("c", "end", "close")],
    } as unknown as Presentation;
    let index = 0;
    let view: PresentationViewHost | null = null;
    const host = doc.createElement("div");
    doc.body.appendChild(host);
    view = mountNotesPageView(host, {
      pres,
      getCurrentIndex: () => index,
      onSelect: (i) => {
        index = i;
        view?.refresh();
      },
      getNotes: (i) => pres.slides[i]?.notes ?? "",
      onNotesChange: () => {},
    });

    const header = () => host.querySelector(".ppt-scroll > div > div")!.textContent;
    const current = () =>
      [...host.querySelectorAll("button")].find((b) => b.getAttribute("aria-current") === "page")?.textContent;

    assert.equal(header(), "1. cover");
    assert.equal(current(), "1");

    const page3 = [...host.querySelectorAll("button")].find((b) => b.textContent === "3");
    assert.ok(page3);
    page3.click();
    assert.equal(index, 2);
    assert.equal(header(), "3. end");
    assert.equal(current(), "3");
    assert.equal(host.querySelector("textarea")!.value, "close");

    index = 1;
    view.refresh();
    assert.equal(header(), "2. middle");
    assert.equal(current(), "2");
    assert.equal(host.querySelector("textarea")!.value, "talk");

    view.destroy();
  });

  it("commits notes to the page being left, then shows the next page", () => {
    const pres = {
      size: { width: 320, height: 180 },
      slides: [slide("a", "cover", ""), slide("b", "end", "already")],
    } as unknown as Presentation;
    let index = 0;
    const writes: Array<{ idx: number; notes: string | undefined }> = [];
    let view: PresentationViewHost | null = null;
    const host = doc.createElement("div");
    doc.body.appendChild(host);
    view = mountNotesPageView(host, {
      pres,
      getCurrentIndex: () => index,
      onSelect: (i) => {
        index = i;
      },
      getNotes: (i) => pres.slides[i]?.notes ?? "",
      onNotesChange: (idx, notes) => {
        writes.push({ idx, notes });
        const slide = pres.slides[idx];
        if (slide) slide.notes = notes;
        view?.refresh();
      },
    });

    const area = host.querySelector("textarea")!;
    area.value = "spoken";
    area.dispatchEvent(new doc.defaultView!.Event("input", { bubbles: true }));
    assert.deepEqual(writes, [{ idx: 0, notes: "spoken" }]);
    assert.equal(area.value, "spoken");

    const page2 = [...host.querySelectorAll("button")].find((b) => b.textContent === "2");
    page2!.click();
    assert.equal(index, 1);
    assert.match(host.textContent ?? "", /2\. end/);
    assert.equal(host.querySelector("textarea")!.value, "already");

    view.destroy();
  });
});
