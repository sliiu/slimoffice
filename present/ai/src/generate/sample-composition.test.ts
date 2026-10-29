import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Presentation, Template } from "@ppt/core";
import { compositionDigest, sampleDensityRule, SampleDeckError, withPageComposition } from "./sample-composition";

function deck(): Presentation {
  return {
    id: "p",
    size: { width: 1280, height: 720 },
    slides: [
      {
        id: "s0",
        name: "s",
        notes: "SPEAKER SECRET",
        background: { kind: "solid", color: "#112233" },
        layers: [
          {
            id: "l0",
            name: "l",
            visible: true,
            locked: false,
            shapes: [
              {
                id: "t0",
                kind: "text",
                name: "title",
                bbox: { x: 64, y: 72, w: 640, h: 80 },
                placeholder: { type: "title" },
                paragraphs: [{ runs: [{ text: "SECRET WORDS", fontSize: 36 }] }],
              },
              {
                id: "c0",
                kind: "chart",
                name: "chart",
                bbox: { x: 640, y: 200, w: 500, h: 400 },
                chart: { type: "pie", categories: ["SECRET-CAT"], series: [{ name: "SECRET-SERIES", values: [9] }] },
              },
              {
                id: "i0",
                kind: "image",
                name: "photo",
                bbox: { x: 0, y: 0, w: 1280, h: 720 },
                src: "data:image/png;base64,SECRET-IMAGE",
              },
            ],
          },
        ],
      },
    ],
  } as Presentation;
}

describe("sample composition", () => {
  it("keeps placement and drops words, notes, and chart labels", () => {
    const digest = compositionDigest(deck());
    assert.match(digest, /canvas 1280x720/);
    assert.match(digest, /bg solid #112233/);
    assert.match(digest, /title/);
    assert.match(digest, /36px/);
    assert.match(digest, /chart pie/);
    assert.match(digest, /at 0,0 100x100/);
    assert.doesNotMatch(digest, /SECRET/);
    assert.doesNotMatch(digest, /SPEAKER/);
  });

  it("stops on an empty deck", () => {
    assert.throws(
      () => compositionDigest({ id: "p", size: { width: 100, height: 100 }, slides: [] }),
      (e: unknown) => e instanceof SampleDeckError && e.code === "empty",
    );
  });

  it("keeps an empty deck as a layout template without a page layer", () => {
    const template: Template = { id: "user:empty", name: "Empty", source: "user", masters: [] };
    const saved = withPageComposition(template, { id: "p", size: { width: 100, height: 100 }, slides: [] });
    assert.equal(saved.composition, undefined);
    assert.equal(saved, template);
  });

  it("stores the page layer on the template and drops the words", () => {
    const template: Template = { id: "user:deck", name: "Deck", source: "user", masters: [] };
    const saved = withPageComposition(template, deck());
    assert.match(saved.composition ?? "", /36px/);
    assert.doesNotMatch(saved.composition ?? "", /SECRET/);
  });

  it("uses density only when placeholders already place the page", () => {
    const rule = sampleDensityRule("page 1 density text=1 cover=10%");
    assert.match(rule, /PAGE DENSITY/);
    assert.match(rule, /Do not add shapes/);
    assert.doesNotMatch(rule, /only visual source/);
  });
});