import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error jsdom ships without types in this repo; tests run via tsx.
import { JSDOM } from "jsdom";
import { dismissToast, showToast } from "./primitives.js";

function doc(): Document {
  return new JSDOM("<!doctype html><html><body></body></html>").window.document;
}

function toast(document: Document): HTMLDivElement {
  const el = document.getElementById("ppt-ui-toast");
  assert.ok(el);
  return el as HTMLDivElement;
}

describe("showToast", () => {
  it("keeps a zero-duration toast with an action until that token is dismissed", () => {
    const document = doc();
    let opened = 0;
    showToast("没有完成", {
      doc: document,
      kind: "err",
      durationMs: 0,
      token: "assistant-closed-run",
      action: { label: "打开助手", onClick: () => { opened += 1; } },
    });
    const el = toast(document);
    assert.equal(el.classList.contains("ui-toast--visible"), true);
    assert.equal(el.dataset.token, "assistant-closed-run");
    assert.equal(el.querySelector(".ui-toast__text")?.textContent, "没有完成");
    el.querySelector("button")?.dispatchEvent(new document.defaultView!.MouseEvent("click", { bubbles: true }));
    assert.equal(opened, 1);
    assert.equal(el.classList.contains("ui-toast--visible"), false);
  });

  it("does not dismiss a replacement toast that no longer has the token", () => {
    const document = doc();
    showToast("没有完成", {
      doc: document,
      kind: "err",
      durationMs: 0,
      token: "assistant-closed-run",
      action: { label: "打开助手", onClick: () => {} },
    });
    showToast("已保存", { doc: document, kind: "ok", durationMs: 0 });
    dismissToast("assistant-closed-run", document);
    const el = toast(document);
    assert.equal(el.classList.contains("ui-toast--visible"), true);
    assert.equal(el.querySelector(".ui-toast__text")?.textContent, "已保存");
    assert.equal(el.dataset.token, undefined);
  });
});
