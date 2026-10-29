import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
// @ts-expect-error jsdom ships without types in this repo; tests run via tsx.
import { JSDOM } from "jsdom";
import { identityTransform, type RectShape, type Slide } from "@ppt/core";
import { createScene } from "./scene-node.js";
import { SvgBackend } from "./svg-backend.js";

function installDom(): Document {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const g = globalThis as unknown as {
    window: Window & typeof globalThis;
    document: Document;
    HTMLElement: typeof HTMLElement;
    Node: typeof Node;
    SVGElement: typeof SVGElement;
    requestAnimationFrame: typeof requestAnimationFrame;
    cancelAnimationFrame: typeof cancelAnimationFrame;
  };
  g.window = dom.window as unknown as Window & typeof globalThis;
  g.document = dom.window.document;
  g.HTMLElement = dom.window.HTMLElement;
  g.Node = dom.window.Node;
  g.SVGElement = dom.window.SVGElement;
  g.requestAnimationFrame = (() => 0) as typeof requestAnimationFrame;
  g.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
  return dom.window.document;
}

function slide(): Slide {
  const shape: RectShape = {
    id: "off",
    kind: "rect",
    name: "off",
    bbox: { x: -80, y: 20, w: 40, h: 40 },
    zIndex: 0,
    visible: true,
    locked: false,
    opacity: 1,
    transform: identityTransform(),
    fill: { kind: "solid", color: "#f00" },
  };
  return {
    id: "s0",
    name: "cover",
    index: 0,
    layers: [{ id: "layer_main", name: "Main", visible: true, locked: false, shapes: [shape] }],
  };
}

describe("svg off-slide paint", () => {
  let doc: Document;

  before(() => {
    doc = installDom();
  });

  it("clips to the slide unless the editor asks to paint the workspace", () => {
    const scene = createScene(slide(), { width: 320, height: 180 });
    const host = doc.createElement("div");
    doc.body.appendChild(host);
    const clipped = new SvgBackend(scene, host);
    assert.equal(clipped.root.style.overflow, "");
    assert.equal(clipped.root.getAttribute("overflow"), null);
    assert.equal(clipped.root.style.display, "block");
    clipped.destroy();

    const open = new SvgBackend(scene, host, { clipToSlide: false });
    assert.equal(open.root.style.overflow, "visible");
    assert.equal(open.root.getAttribute("overflow"), "visible");
    open.destroy();
    host.remove();
  });
});
