import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error jsdom ships without types in this repo; tests run via tsx.
import { JSDOM } from "jsdom";
import { clearPinnedCharSelection, paintPinnedCharSelection } from "./text-edit-overlay.js";

function editorWith(text: string): { dom: JSDOM; editor: HTMLElement; run: HTMLElement } {
  const dom = new JSDOM(
    `<!doctype html><html><body><div id="ed"><div><span id="run">${text}</span></div></div></body></html>`,
  );
  const g = globalThis as unknown as {
    Element: typeof Element;
    HTMLElement: typeof HTMLElement;
    Node: typeof Node;
    document: Document;
  };
  g.Element = dom.window.Element;
  g.HTMLElement = dom.window.HTMLElement;
  g.Node = dom.window.Node;
  g.document = dom.window.document;
  const editor = dom.window.document.getElementById("ed") as HTMLElement;
  const run = dom.window.document.getElementById("run") as HTMLElement;
  return { dom, editor, run };
}

describe("pinned character selection", () => {
  it("paints the pinned slice with a highlight that does not follow focus", () => {
    const { dom, editor } = editorWith("SlimPPT");
    const seen: { ranges: Range[] }[] = [];
    class FakeHighlight {
      ranges: Range[];
      constructor(...ranges: Range[]) {
        this.ranges = ranges;
        seen.push(this);
      }
    }
    const store = new Map<string, FakeHighlight>();
    (dom.window as unknown as { Highlight: typeof FakeHighlight }).Highlight = FakeHighlight;
    Object.defineProperty(dom.window.CSS, "highlights", {
      configurable: true,
      value: {
        set: (name: string, highlight: FakeHighlight) => store.set(name, highlight),
        delete: (name: string) => store.delete(name),
      },
    });

    paintPinnedCharSelection(editor, [{ paragraph: 0, start: 4, end: 7 }]);
    const highlight = store.get("ppt-char-selection");
    assert.ok(highlight);
    assert.equal(highlight.ranges.length, 1);
    assert.equal(highlight.ranges[0]!.toString(), "PPT");
    assert.equal(dom.window.document.getElementById("ppt-char-selection-style")?.textContent?.includes("::highlight(ppt-char-selection)"), true);
    assert.equal(editor.querySelector("[data-ppt-char-sel]"), null);

    clearPinnedCharSelection(dom.window.document);
    assert.equal(store.has("ppt-char-selection"), false);
  });

  it("falls back to a span background and restores the run color", () => {
    const { dom, editor, run } = editorWith("SlimPPT");
    run.style.backgroundColor = "rgb(255, 0, 0)";
    run.style.color = "rgb(0, 0, 0)";
    (dom.window as unknown as { Highlight?: unknown }).Highlight = undefined;

    paintPinnedCharSelection(editor, [{ paragraph: 0, start: 4, end: 7 }]);
    const marked = Array.from(editor.querySelectorAll("[data-ppt-char-sel]"));
    assert.equal(marked.length, 1);
    assert.equal(marked[0]!.textContent, "PPT");
    assert.equal((marked[0] as HTMLElement).style.backgroundColor, "rgba(10, 132, 255, 0.35)");

    clearPinnedCharSelection(dom.window.document);
    assert.equal(editor.querySelector("[data-ppt-char-sel]"), null);
    const restored = Array.from(editor.querySelectorAll("span")).find((span) => span.textContent === "PPT");
    assert.ok(restored);
    assert.equal(restored.style.backgroundColor, "rgb(255, 0, 0)");
    assert.equal(restored.style.color, "rgb(0, 0, 0)");
  });
});
