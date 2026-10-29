import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error jsdom ships without types in this repo; tests run via tsx.
import { JSDOM } from "jsdom";
import { showContextMenu } from "./context-menu.js";

function installDom(): { doc: Document; MouseEvent: typeof MouseEvent } {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  return { doc: dom.window.document, MouseEvent: dom.window.MouseEvent };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("stage context menu dismiss", () => {
  it("stays open through the pointerdown that opened it, then closes on a later outside pointerdown", async () => {
    const { doc, MouseEvent } = installDom();
    const stage = doc.createElement("div");
    doc.body.appendChild(stage);
    stage.addEventListener("pointerdown", (e) => {
      e.preventDefault();
    });

    showContextMenu(doc, [{ label: "Paste", onClick: () => {} }], 8, 8);
    stage.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 2 }));
    assert.ok(doc.querySelector("[data-ppt-ctx-menu]"));

    await flush();
    stage.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
    assert.equal(doc.querySelector("[data-ppt-ctx-menu]"), null);
  });

  it("runs the item command when the press starts on the row", async () => {
    const { doc, MouseEvent } = installDom();
    let clicked = 0;
    const handle = showContextMenu(
      doc,
      [{ label: "Copy", onClick: () => { clicked += 1; } }],
      8,
      8,
    );
    await flush();
    const row = handle.el.firstElementChild;
    assert.ok(row);
    row.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
    assert.equal(clicked, 0);
    assert.ok(doc.body.contains(handle.el));
    row.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    assert.equal(clicked, 1);
    assert.equal(doc.querySelector("[data-ppt-ctx-menu]"), null);
  });
});
