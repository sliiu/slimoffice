import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error jsdom ships without types in this repo; tests run via tsx.
import { JSDOM } from "jsdom";
import { openAnchoredCommentDialog, placeCommentPopover } from "./comment-composer.js";

function installDom(): Document {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const g = globalThis as unknown as {
    HTMLElement: typeof HTMLElement;
    HTMLTextAreaElement: typeof HTMLTextAreaElement;
    HTMLButtonElement: typeof HTMLButtonElement;
    Node: typeof Node;
    Element: typeof Element;
    Event: typeof Event;
    KeyboardEvent: typeof KeyboardEvent;
  };
  g.HTMLElement = dom.window.HTMLElement;
  g.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
  g.HTMLButtonElement = dom.window.HTMLButtonElement;
  g.Node = dom.window.Node;
  g.Element = dom.window.Element;
  g.Event = dom.window.Event;
  g.KeyboardEvent = dom.window.KeyboardEvent;
  return dom.window.document;
}

describe("placeCommentPopover", () => {
  const size = { width: 280, height: 160 };
  const viewport = { width: 1200, height: 800 };

  it("sits to the right of the click", () => {
    assert.deepEqual(placeCommentPopover({ x: 100, y: 200 }, size, viewport), { left: 112, top: 192 });
  });

  it("flips to the left when the right side would leave the viewport", () => {
    assert.deepEqual(placeCommentPopover({ x: 1000, y: 200 }, size, viewport), { left: 708, top: 192 });
  });

  it("keeps the panel inside the viewport", () => {
    const pos = placeCommentPopover({ x: 4, y: 4 }, size, { width: 300, height: 200 });
    assert.equal(pos.left, 8);
    assert.equal(pos.top, 8);
  });
});

describe("openAnchoredCommentDialog", () => {
  it("shows the hit element and returns the submitted text", async () => {
    const doc = installDom();
    const pending = openAnchoredCommentDialog(doc, {
      anchor: { x: 40, y: 80 },
      targetLabel: "Rectangle · target",
    });
    const panel = doc.querySelector("[data-comment-composer]");
    assert.ok(panel);
    assert.match(panel!.textContent ?? "", /Rectangle · target/);
    assert.equal((panel as HTMLElement).style.visibility, "visible");
    const area = doc.querySelector("textarea")!;
    area.value = "  @ai look  ";
    area.dispatchEvent(new doc.defaultView!.Event("input", { bubbles: true }));
    const ok = [...doc.querySelectorAll("button")].find((b) => b.textContent === "OK");
    assert.equal(ok?.disabled, false);
    ok!.click();
    assert.equal(await pending, "@ai look");
    assert.equal(doc.querySelector("[data-comment-composer]"), null);
  });

  it("returns null when cancelled", async () => {
    const doc = installDom();
    const pending = openAnchoredCommentDialog(doc, { anchor: { x: 20, y: 20 } });
    assert.equal(doc.querySelector(".ppt-comment-target"), null);
    const cancel = [...doc.querySelectorAll("button")].find((b) => b.textContent === "Cancel");
    cancel!.click();
    assert.equal(await pending, null);
  });
});
