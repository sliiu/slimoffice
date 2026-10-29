import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error jsdom ships without types in this repo; tests run via tsx.
import { JSDOM } from "jsdom";
import { dismissAllModals } from "@ppt/ui";
import { openTextPromptDialog } from "./dialog.js";

function installDom(): { doc: Document; KeyboardEvent: typeof KeyboardEvent } {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const g = globalThis as unknown as {
    HTMLElement: typeof HTMLElement;
    HTMLInputElement: typeof HTMLInputElement;
    HTMLTextAreaElement: typeof HTMLTextAreaElement;
    HTMLButtonElement: typeof HTMLButtonElement;
    Node: typeof Node;
    Element: typeof Element;
    Event: typeof Event;
    CustomEvent: typeof CustomEvent;
    KeyboardEvent: typeof KeyboardEvent;
  };
  g.HTMLElement = dom.window.HTMLElement;
  g.HTMLInputElement = dom.window.HTMLInputElement;
  g.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
  g.HTMLButtonElement = dom.window.HTMLButtonElement;
  g.Node = dom.window.Node;
  g.Element = dom.window.Element;
  g.Event = dom.window.Event;
  g.CustomEvent = dom.window.CustomEvent;
  g.KeyboardEvent = dom.window.KeyboardEvent;
  return { doc: dom.window.document, KeyboardEvent: dom.window.KeyboardEvent };
}

describe("showDialog dismiss session", () => {
  it("cancels the previous dialog when another opens, then Enter submits the new one", async () => {
    const { doc, KeyboardEvent } = installDom();
    const first = openTextPromptDialog(doc, { title: "First", multiline: false, initial: "old" });
    const second = openTextPromptDialog(doc, { title: "Second", multiline: false, initial: "next" });
    assert.equal(await first, null);
    assert.equal(doc.querySelectorAll("[data-ppt-dialog]").length, 1);

    doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    assert.equal(await second, "next");
    assert.equal(doc.querySelector("[data-ppt-dialog]"), null);
    dismissAllModals(doc);
  });
});
