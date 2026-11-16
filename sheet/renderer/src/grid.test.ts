import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { mountWorkbook } from "./index";

test("shows the named sheet and its cells", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  mountWorkbook(host, {
    sheets: [
      { name: "销售", cells: [[{ value: "合计", bold: true }], [], [{ value: "第一" }]] },
      { name: "库存", cells: [[{ value: "3" }]] },
    ],
  });
  assert.equal(host.querySelectorAll(".sheet-tab").length, 2);
  assert.equal(host.querySelector(".sheet-tab.is-active")?.textContent, "销售");
  assert.match(host.querySelector(".sheet-grid")?.textContent ?? "", /合计/);
  (host.querySelectorAll(".sheet-tab")[1] as HTMLButtonElement).click();
  assert.equal(host.querySelector(".sheet-tab.is-active")?.textContent, "库存");
  assert.match(host.querySelector(".sheet-grid")?.textContent ?? "", /3/);
});
