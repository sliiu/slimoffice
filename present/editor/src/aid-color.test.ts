import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error jsdom ships without types in this repo; tests run via tsx.
import { JSDOM } from "jsdom";
import {
  DEFAULT_AID_OPACITY,
  DEFAULT_GUIDE_AID_COLOR,
  GUIDE_AID_COLOR_KEY,
  GUIDE_AID_OPACITY_KEY,
  GUIDE_AID_WIDTH,
  appendAidLine,
  clearAidColor,
  normalizeAidColor,
  normalizeAidOpacity,
  openAidColorPopover,
  readAidColor,
  readAidOpacity,
  writeAidColor,
  writeAidOpacity,
} from "./aid-color.js";

function memoryStore(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe("aid colors", () => {
  it("keeps a 6-digit hex and drops anything else", () => {
    assert.equal(normalizeAidColor("  #22D3EE "), "#22d3ee");
    assert.equal(normalizeAidColor("#fff"), null);
    assert.equal(normalizeAidColor("red"), null);
  });

  it("reads the saved core color and falls back when the value is junk", () => {
    const store = memoryStore();
    assert.equal(readAidColor(store, GUIDE_AID_COLOR_KEY, DEFAULT_GUIDE_AID_COLOR), DEFAULT_GUIDE_AID_COLOR);
    assert.equal(writeAidColor(store, GUIDE_AID_COLOR_KEY, "#F97316"), true);
    assert.equal(readAidColor(store, GUIDE_AID_COLOR_KEY, DEFAULT_GUIDE_AID_COLOR), "#f97316");
    assert.equal(readAidOpacity(store, GUIDE_AID_OPACITY_KEY, DEFAULT_AID_OPACITY), DEFAULT_AID_OPACITY);
    assert.equal(normalizeAidOpacity("0.44"), 0.45);
    assert.equal(writeAidOpacity(store, GUIDE_AID_OPACITY_KEY, 0.44), true);
    assert.equal(readAidOpacity(store, GUIDE_AID_OPACITY_KEY, DEFAULT_AID_OPACITY), 0.45);
    assert.equal(normalizeAidOpacity("0"), 0.05);
    store.setItem(GUIDE_AID_COLOR_KEY, "nope");
    assert.equal(readAidColor(store, GUIDE_AID_COLOR_KEY, DEFAULT_GUIDE_AID_COLOR), DEFAULT_GUIDE_AID_COLOR);
    clearAidColor(store, GUIDE_AID_COLOR_KEY);
    assert.equal(store.getItem(GUIDE_AID_COLOR_KEY), null);
  });

  it("draws one solid line in the chosen color", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const doc = dom.window.document;
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    doc.body.appendChild(svg);
    appendAidLine(
      doc,
      svg,
      (ln) => {
        ln.setAttribute("x1", "0");
        ln.setAttribute("x2", "10");
        ln.setAttribute("y1", "1");
        ln.setAttribute("y2", "1");
      },
      "#111111",
      GUIDE_AID_WIDTH,
      0.4,
    );
    const lines = [...svg.querySelectorAll("line")];
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.getAttribute("stroke"), "#111111");
    assert.equal(lines[0]?.getAttribute("stroke-width"), String(GUIDE_AID_WIDTH));
    assert.equal(lines[0]?.getAttribute("stroke-opacity"), "0.4");
    assert.equal(lines[0]?.getAttribute("vector-effect"), "non-scaling-stroke");
  });

  it("right-click popover sets a color and reset restores the fallback", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const doc = dom.window.document;
    const anchor = doc.createElement("button");
    doc.body.appendChild(anchor);
    const seen: string[] = [];
    const opacities: number[] = [];
    let resets = 0;
    openAidColorPopover(doc, {
      anchor,
      label: "Guide color",
      resetLabel: "Reset",
      value: "#22d3ee",
      fallback: DEFAULT_GUIDE_AID_COLOR,
      onColor: (color) => seen.push(color),
      opacityLabel: "Opacity",
      opacity: 0.8,
      opacityFallback: DEFAULT_AID_OPACITY,
      onOpacity: (opacity) => opacities.push(opacity),
      onReset: () => {
        resets += 1;
      },
    });
    const input = doc.querySelector<HTMLInputElement>("input[type=color]");
    assert.ok(input);
    input.value = "#abcdef";
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    assert.deepEqual(seen, ["#abcdef"]);
    const range = doc.querySelector<HTMLInputElement>("input[type=range]");
    assert.equal(range?.value, "0.8");
    assert.equal(doc.querySelector(".ppt-aid-color-opacity-value")?.textContent, "80%");
    if (range) {
      range.value = "0.25";
      range.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    }
    assert.deepEqual(opacities, [0.25]);
    doc.querySelector<HTMLButtonElement>(".ppt-aid-color-reset")?.click();
    assert.equal(resets, 1);
    assert.equal(input.value, DEFAULT_GUIDE_AID_COLOR);
    assert.equal(range?.value, String(DEFAULT_AID_OPACITY));
  });
});
