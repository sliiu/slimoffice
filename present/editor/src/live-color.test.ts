import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
// @ts-expect-error jsdom ships without types in this repo; tests run via tsx.
import { JSDOM } from "jsdom";
import type { Paint, Presentation, Shape, TextRun } from "@ppt/core";
import { identityTransform } from "@ppt/core";
import { fillTargetsFor, SetTextStyleCmd, textShapesForColor } from "./commands.js";
import {
  captureFills,
  captureRunColors,
  paintedTextColor,
  patchSolidFill,
  patchTextColor,
  restoreFills,
  restoreRunColors,
  solidHex,
  syncLiveColorInputs,
  writeFills,
  writeRunColors,
} from "./live-color.js";

function rect(id: string, fill?: Paint): Shape {
  return {
    id,
    name: id,
    zIndex: 0,
    visible: true,
    locked: false,
    opacity: 1,
    kind: "rect",
    bbox: { x: 0, y: 0, w: 40, h: 20 },
    transform: identityTransform(),
    fill,
  };
}

describe("live color model", () => {
  it("restores the fill captured before the drag", () => {
    const shape = rect("a", { kind: "solid", color: "#112233" });
    const snaps = captureFills([shape]);
    writeFills(snaps, { kind: "solid", color: "#ff0000" });
    assert.equal(shape.fill?.kind === "solid" && shape.fill.color, "#ff0000");
    restoreFills(snaps);
    assert.equal(shape.fill?.kind === "solid" && shape.fill.color, "#112233");
  });

  it("restores run colors captured before the drag", () => {
    const run: TextRun = { text: "Hi", color: "#111111" };
    const snaps = captureRunColors([run]);
    writeRunColors(snaps, "#00ff00");
    assert.equal(run.color, "#00ff00");
    restoreRunColors(snaps);
    assert.equal(run.color, "#111111");
  });

  it("paints and restores a solid text fill with the dragged color", () => {
    const run: TextRun = { text: "70+", color: "#1a2233", fill: { kind: "solid", color: "#0071e3", alpha: 0.8 } };
    assert.equal(paintedTextColor(run), "#0071e3");
    const snaps = captureRunColors([run]);
    writeRunColors(snaps, "#112233");
    assert.equal(run.color, "#112233");
    assert.equal(run.fill?.kind === "solid" && run.fill.color, "#112233");
    assert.equal(run.fill?.kind === "solid" && run.fill.alpha, 0.8);
    restoreRunColors(snaps);
    assert.equal(run.color, "#1a2233");
    assert.equal(run.fill?.kind === "solid" && run.fill.color, "#0071e3");
    assert.equal(run.fill?.kind === "solid" && run.fill.alpha, 0.8);
  });

  it("leaves a gradient text fill alone while the color changes", () => {
    const run: TextRun = {
      text: "A",
      color: "#111111",
      fill: { kind: "linear", angle: 20, stops: [{ offset: 0, color: "#111111" }, { offset: 1, color: "#0071e3" }] },
    };
    const snaps = captureRunColors([run]);
    writeRunColors(snaps, "#00ff00");
    assert.equal(run.fill?.kind, "linear");
    restoreRunColors(snaps);
    assert.equal(run.color, "#111111");
    assert.equal(run.fill?.kind, "linear");
  });

  it("text style color updates the solid fill and undo restores both", () => {
    const run: TextRun = { text: "70+", color: "#1a2233", fill: { kind: "solid", color: "#0071e3" } };
    const shape: Shape = {
      ...rect("t"),
      kind: "text",
      paragraphs: [{ runs: [run] }],
    };
    const pres = {
      id: "p",
      size: { width: 1280, height: 720 },
      slides: [{ id: "s", layers: [{ id: "content", visible: true, locked: false, shapes: [shape] }] }],
    } as unknown as Presentation;
    const cmd = new SetTextStyleCmd(0, "t", { color: "#112233" });
    cmd.apply(pres);
    assert.equal(run.color, "#112233");
    assert.equal(run.fill?.kind === "solid" && run.fill.color, "#112233");
    cmd.revert(pres);
    assert.equal(run.color, "#1a2233");
    assert.equal(run.fill?.kind === "solid" && run.fill.color, "#0071e3");
  });

  it("expands short hex for color inputs", () => {
    assert.equal(solidHex("#abc"), "#aabbcc");
    assert.equal(solidHex("#AABBCC"), "#aabbcc");
    assert.equal(solidHex("red"), null);
  });

  it("fill targets follow the command: one rect, or every visible table cell", () => {
    const box = rect("box", { kind: "solid", color: "#ffffff" });
    const hidden = {
      ...rect("hid"),
      kind: "text" as const,
      cellMeta: { hidden: true },
      paragraphs: [],
    };
    const cell = {
      ...rect("cell"),
      kind: "text" as const,
      cellMeta: {},
      paragraphs: [{ runs: [{ text: "A", color: "#000000" }] }],
    };
    const table: Shape = {
      ...rect("table"),
      kind: "group",
      tableMeta: { rows: 1, cols: 1 },
      children: [hidden, cell],
    } as unknown as Shape;
    const pres = {
      slides: [{ id: "s", layers: [{ id: "content", visible: true, locked: false, shapes: [box, table] }] }],
    } as unknown as Presentation;
    assert.deepEqual(fillTargetsFor(pres, 0, "box").map((s) => s.id), ["box"]);
    assert.deepEqual(fillTargetsFor(pres, 0, "table").map((s) => s.id), ["cell"]);
    assert.deepEqual(textShapesForColor(pres, 0, "table").map((s) => s.id), ["cell"]);
  });
});

describe("live color DOM patch", () => {
  let doc: Document;

  before(() => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    doc = dom.window.document;
  });

  it("paints a shape graphic and leaves text glyphs alone on a text frame", () => {
    const host = doc.createElement("div");
    host.innerHTML = `
      <svg>
        <g data-id="r1"><rect fill="#000000" fill-opacity="0.4"></rect></g>
        <g data-id="t1">
          <rect fill="#eeeeee"></rect>
          <text fill="#111111"><tspan fill="#111111">Hi</tspan></text>
        </g>
        <g data-id="t2"><g><rect fill="#dddddd"></rect><text fill="#222222">X</text></g></g>
      </svg>`;
    assert.equal(patchSolidFill(host, "r1", { kind: "solid", color: "#ff0000" }), true);
    const rect = host.querySelector("g[data-id='r1'] rect")!;
    assert.equal(rect.getAttribute("fill"), "#ff0000");
    assert.equal(rect.hasAttribute("fill-opacity"), false);

    assert.equal(patchSolidFill(host, "r1", { kind: "solid", color: "#ff0000", alpha: 0.5 }), true);
    assert.equal(rect.getAttribute("fill-opacity"), "0.5");

    assert.equal(patchSolidFill(host, "t1", { kind: "solid", color: "#00ff00" }), true);
    assert.equal(host.querySelector("g[data-id='t1'] > rect")!.getAttribute("fill"), "#00ff00");
    assert.equal(host.querySelector("g[data-id='t1'] text")!.getAttribute("fill"), "#111111");

    assert.equal(patchSolidFill(host, "t2", { kind: "solid", color: "#0000ff" }), true);
    assert.equal(host.querySelector("g[data-id='t2'] rect")!.getAttribute("fill"), "#0000ff");
    assert.equal(host.querySelector("g[data-id='t2'] text")!.getAttribute("fill"), "#222222");

    assert.equal(patchTextColor(host, "t1", "#abcdef"), true);
    assert.equal(host.querySelector("g[data-id='t1'] text")!.getAttribute("fill"), "#abcdef");
    assert.equal(host.querySelector("g[data-id='t1'] tspan")!.getAttribute("fill"), "#abcdef");
    assert.equal(host.querySelector("g[data-id='t1'] > rect")!.getAttribute("fill"), "#00ff00");
    assert.equal(patchSolidFill(host, "missing", { kind: "solid", color: "#ffffff" }), false);
    assert.equal(patchSolidFill(host, "r1", { kind: "linear", angle: 0, stops: [] }), false);
  });

  it("updates the other swatch and leaves the focused one alone", () => {
    const host = doc.createElement("div");
    const focused = doc.createElement("input");
    focused.type = "color";
    focused.dataset.liveColor = "fill";
    focused.value = "#000000";
    const other = doc.createElement("input");
    other.type = "color";
    other.dataset.liveColor = "fill";
    other.value = "#000000";
    host.append(focused, other);
    doc.body.append(host);
    focused.focus();
    syncLiveColorInputs(doc, "fill", "#123456");
    assert.equal(focused.value, "#000000");
    assert.equal(other.value, "#123456");
    host.remove();
  });
});
