// P0 门禁单元测试。

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import type { Presentation, Slide, Layer, Shape, TextShape, RectShape } from "@ppt/core";
import { runP0Gates, ensureCoverVisual, ensureNoTextOverlap } from "./gates";

// 辅助函数：创建带默认必需字段的 mock shape
const identityTransform = { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 };

function mockRect(props: Partial<RectShape>): RectShape {
  return {
    kind: "rect",
    id: props.id ?? "rect-1",
    name: props.name ?? "Rectangle",
    bbox: props.bbox ?? { x: 0, y: 0, w: 100, h: 100 },
    visible: props.visible ?? true,
    transform: identityTransform,
    zIndex: props.zIndex ?? 0,
    locked: false,
    opacity: 1,
    fill: props.fill ?? { kind: "solid", color: "#000000" },
    ...props,
  } as RectShape;
}

function mockText(props: Partial<TextShape>): TextShape {
  return {
    kind: "text",
    id: props.id ?? "text-1",
    name: props.name ?? "Text",
    bbox: props.bbox ?? { x: 0, y: 0, w: 200, h: 100 },
    visible: props.visible ?? true,
    transform: identityTransform,
    zIndex: props.zIndex ?? 0,
    locked: false,
    opacity: 1,
    paragraphs: props.paragraphs ?? [{ runs: [{ text: "Text" }] }],
    ...props,
  } as TextShape;
}

function mockImage(props: { id: string; name: string; bbox: { x: number; y: number; w: number; h: number }; src: string }): Shape {
  return {
    kind: "image",
    ...props,
    visible: true,
    transform: identityTransform,
    zIndex: 0,
    locked: false,
    opacity: 1,
  } as Shape;
}

function mockLayer(shapes: Shape[]): Layer {
  return {
    id: "layer-0",
    name: "Content",
    visible: true,
    locked: false,
    shapes,
  };
}

function makeMockPres(slides: Partial<Slide>[]): Presentation {
  return {
    id: "test-pres",
    size: { width: 1280, height: 720 },
    slides: slides.map((s, i) => ({
      id: `slide-${i}`,
      index: i,
      name: s.name ?? `Slide ${i + 1}`,
      layers: s.layers ?? [mockLayer([])],
      background: s.background,
      notes: s.notes,
      visible: true,
      layoutRef: undefined,
      ...s,
    })) as Slide[],
    theme: { id: "default", name: "default", colors: { bg1: "#ffffff" } },
    masters: [],
  } as Presentation;
}

describe("runP0Gates", () => {
  it("passes for a minimal valid deck", () => {
    const pres = makeMockPres([
      {
        name: "Cover",
        background: { kind: "image", src: "data:image/png;base64,xxx", fit: "cover" },
        layers: [
          mockLayer([
            mockRect({ id: "bgov_1", name: "BG overlay", bbox: { x: 0, y: 0, w: 1280, h: 720 }, fill: { kind: "solid", color: "#000000", alpha: 0.5 } }),
            mockText({ id: "t1", name: "Title", bbox: { x: 100, y: 200, w: 1080, h: 200 }, paragraphs: [{ runs: [{ text: "Hello" }] }] }),
          ]),
        ],
        notes: "Opening slide. Introduce the topic and set the stage.",
      },
      {
        name: "cards",
        layers: [mockLayer([mockText({ id: "t2", name: "Card 1", bbox: { x: 100, y: 200, w: 400, h: 150 }, paragraphs: [{ runs: [{ text: "Feature 1" }] }] })])],
        notes: "Highlight the key features with visual cards.",
      },
      {
        name: "process",
        layers: [mockLayer([mockText({ id: "t3", name: "Step 1", bbox: { x: 100, y: 200, w: 300, h: 100 }, paragraphs: [{ runs: [{ text: "Step 1" }] }] })])],
        notes: "Walk through the process step by step.",
      },
      {
        name: "comparison",
        layers: [mockLayer([mockText({ id: "t4", name: "Left", bbox: { x: 100, y: 200, w: 500, h: 300 }, paragraphs: [{ runs: [{ text: "Before" }] }] })])],
        notes: "Compare before and after states.",
      },
      {
        name: "metrics",
        layers: [mockLayer([mockText({ id: "t5", name: "Metric", bbox: { x: 100, y: 200, w: 400, h: 200 }, paragraphs: [{ runs: [{ text: "72%" }] }] })])],
        notes: "Show key metrics and success indicators.",
      },
      {
        name: "Closing",
        background: { kind: "image", src: "data:image/png;base64,yyy", fit: "cover" },
        layers: [
          mockLayer([
            mockRect({ id: "bgov_2", name: "BG overlay", bbox: { x: 0, y: 0, w: 1280, h: 720 }, fill: { kind: "solid", color: "#000000", alpha: 0.5 } }),
            mockText({ id: "t6", name: "Closing title", bbox: { x: 100, y: 300, w: 1080, h: 120 }, paragraphs: [{ runs: [{ text: "Thank you" }] }] }),
          ]),
        ],
        notes: "Wrap up and invite questions.",
      },
    ]);
    const result = runP0Gates(pres);
    assert.equal(result.passed, true);
    assert.equal(result.findings.length, 0);
  });

  it("fails when cover lacks background image", () => {
    const pres = makeMockPres([
      {
        name: "Cover",
        background: { kind: "solid", color: "#000000" },
        layers: [mockLayer([])],
        notes: "Opening slide",
      },
      { name: "Content", layers: [mockLayer([])], notes: "Main content" },
    ]);
    const result = runP0Gates(pres);
    assert.equal(result.passed, false);
    assert.equal(result.findings.some((f) => f.kind === "cover-visual"), true);
  });

  it("fails when cover bg image lacks overlay", () => {
    const pres = makeMockPres([
      {
        name: "Cover",
        background: { kind: "image", src: "data:image/png;base64,xxx", fit: "cover" },
        layers: [mockLayer([mockText({ id: "t1", name: "Title", bbox: { x: 100, y: 200, w: 1080, h: 200 }, paragraphs: [{ runs: [{ text: "Hello" }] }] })])],
        notes: "Opening",
      },
    ]);
    const result = runP0Gates(pres);
    assert.equal(result.passed, false);
    assert.equal(result.findings.some((f) => f.kind === "cover-visual" && f.issue.includes("overlay")), true);
  });

  it("fails when web layout contains bullets", () => {
    const pres = makeMockPres([
      {
        name: "Cover",
        background: { kind: "image", src: "data:image/png;base64,xxx", fit: "cover" },
        layers: [mockLayer([mockRect({ id: "bgov", name: "BG overlay", bbox: { x: 0, y: 0, w: 1280, h: 720 }, fill: { kind: "solid", color: "#000000", alpha: 0.5 } })])],
        notes: "Opening",
      },
      {
        name: "cards",
        layers: [
          mockLayer([
            mockText({
              id: "t1",
              name: "Body",
              bbox: { x: 100, y: 200, w: 1080, h: 400 },
              paragraphs: [
                { runs: [{ text: "Item 1" }], bullet: { kind: "char", char: "•" } },
                { runs: [{ text: "Item 2" }], bullet: { kind: "char", char: "•" } },
              ],
            }),
          ]),
        ],
        notes: "Features",
      },
    ]);
    const result = runP0Gates(pres);
    assert.equal(result.passed, false);
    assert.equal(result.findings.some((f) => f.kind === "no-bullets"), true);
  });

  it("fails when text shapes overlap", () => {
    const pres = makeMockPres([
      {
        name: "Cover",
        background: { kind: "image", src: "data:image/png;base64,xxx", fit: "cover" },
        layers: [mockLayer([mockRect({ id: "bgov", name: "BG overlay", bbox: { x: 0, y: 0, w: 1280, h: 720 }, fill: { kind: "solid", color: "#000000" } })])],
        notes: "Opening",
      },
      {
        name: "Content",
        layers: [
          mockLayer([
            mockText({ id: "t1", name: "Title", bbox: { x: 100, y: 200, w: 500, h: 100 }, paragraphs: [{ runs: [{ text: "Main Title" }] }] }),
            mockText({ id: "t2", name: "Subtitle", bbox: { x: 120, y: 220, w: 480, h: 80 }, paragraphs: [{ runs: [{ text: "Subtitle text" }] }] }),
          ]),
        ],
        notes: "Main content",
      },
    ]);
    const result = runP0Gates(pres);
    assert.equal(result.passed, false);
    assert.equal(result.findings.some((f) => f.kind === "text-overlap" && f.issue.includes("重叠")), true);
  });

  it("fails when text is clipped off canvas", () => {
    const pres = makeMockPres([
      {
        name: "Cover",
        background: { kind: "image", src: "data:image/png;base64,xxx", fit: "cover" },
        layers: [mockLayer([mockRect({ id: "bgov", name: "BG overlay", bbox: { x: 0, y: 0, w: 1280, h: 720 }, fill: { kind: "solid", color: "#000000" } })])],
        notes: "Opening",
      },
      {
        name: "Content",
        layers: [mockLayer([mockText({ id: "t1", name: "Off canvas", bbox: { x: -50, y: 200, w: 500, h: 100 }, paragraphs: [{ runs: [{ text: "Clipped text" }] }] })])],
        notes: "Main",
      },
    ]);
    const result = runP0Gates(pres);
    assert.equal(result.passed, false);
    assert.equal(result.findings.some((f) => f.kind === "text-overlap" && f.issue.includes("裁切")), true);
  });

  it("fails when web-exclusive layouts < 4 in a 6-slide deck", () => {
    const pres = makeMockPres([
      {
        name: "Cover",
        background: { kind: "image", src: "xxx", fit: "cover" },
        layers: [mockLayer([mockRect({ id: "bgov", name: "BG overlay", bbox: { x: 0, y: 0, w: 1280, h: 720 }, fill: { kind: "solid", color: "#000000" } })])],
        notes: "Opening",
      },
      { name: "bullets", layers: [mockLayer([])], notes: "Content" },
      { name: "bullets", layers: [mockLayer([])], notes: "More" },
      { name: "cards", layers: [mockLayer([])], notes: "Cards" },
      { name: "bullets", layers: [mockLayer([])], notes: "More bullets" },
      {
        name: "Closing",
        background: { kind: "image", src: "yyy", fit: "cover" },
        layers: [mockLayer([mockRect({ id: "bgov2", name: "BG overlay", bbox: { x: 0, y: 0, w: 1280, h: 720 }, fill: { kind: "solid", color: "#000000" } })])],
        notes: "End",
      },
    ]);
    const result = runP0Gates(pres);
    assert.equal(result.passed, false);
    assert.equal(result.findings.some((f) => f.kind === "web-exclusive"), true);
  });

  it("fails when speaker notes coverage < 90%", () => {
    const pres = makeMockPres([
      {
        name: "Cover",
        background: { kind: "image", src: "xxx", fit: "cover" },
        layers: [mockLayer([mockRect({ id: "bgov", name: "BG overlay", bbox: { x: 0, y: 0, w: 1280, h: 720 }, fill: { kind: "solid", color: "#000000" } })])],
        notes: "Opening slide",
      },
      { name: "cards", layers: [mockLayer([])], notes: "Feature highlights" },
      { name: "process", layers: [mockLayer([])], notes: "" },
      { name: "comparison", layers: [mockLayer([])], notes: "" },
      { name: "metrics", layers: [mockLayer([])], notes: "Key numbers" },
      {
        name: "Closing",
        background: { kind: "image", src: "yyy", fit: "cover" },
        layers: [mockLayer([mockRect({ id: "bgov2", name: "BG overlay", bbox: { x: 0, y: 0, w: 1280, h: 720 }, fill: { kind: "solid", color: "#000000" } })])],
        notes: "Wrap up",
      },
    ]);
    const result = runP0Gates(pres);
    assert.equal(result.passed, false);
    assert.equal(result.findings.some((f) => f.kind === "speaker-notes"), true);
  });

  it("fails when banned imagery keyword detected", () => {
    const pres = makeMockPres([
      {
        name: "Cover",
        background: { kind: "image", src: "xxx", fit: "cover" },
        layers: [mockLayer([mockRect({ id: "bgov", name: "BG overlay", bbox: { x: 0, y: 0, w: 1280, h: 720 }, fill: { kind: "solid", color: "#000000" } })])],
        notes: "Opening",
      },
      {
        name: "Content with weapon image",
        layers: [mockLayer([mockImage({ id: "img1", name: "gun illustration", bbox: { x: 100, y: 100, w: 400, h: 300 }, src: "xxx" })])],
        notes: "Content",
      },
    ]);
    const result = runP0Gates(pres);
    assert.equal(result.passed, false);
    assert.equal(result.findings.some((f) => f.kind === "banned-imagery"), true);
  });
});

describe("ensureCoverVisual + ensureNoTextOverlap", () => {
  it("ensureCoverVisual clears cover-visual on solid-bg cover", () => {
    const deck = makeMockPres([
      {
        name: "cover",
        background: { kind: "solid", color: "#111111" },
        layers: [mockLayer([mockText({ id: "t1", name: "Title", bbox: { x: 80, y: 200, w: 1000, h: 80 }, paragraphs: [{ runs: [{ text: "Hi" }] }] })])],
        notes: "Cover notes for the opening.",
      },
      {
        name: "cards",
        layers: [mockLayer([mockText({ id: "t2", name: "Card", bbox: { x: 80, y: 200, w: 400, h: 100 }, paragraphs: [{ runs: [{ text: "A" }] }] })])],
        notes: "Body notes.",
      },
      {
        name: "process",
        layers: [mockLayer([mockText({ id: "t3", name: "Step", bbox: { x: 80, y: 200, w: 400, h: 100 }, paragraphs: [{ runs: [{ text: "B" }] }] })])],
        notes: "Process notes.",
      },
      {
        name: "comparison",
        layers: [mockLayer([mockText({ id: "t4", name: "Cmp", bbox: { x: 80, y: 200, w: 400, h: 100 }, paragraphs: [{ runs: [{ text: "C" }] }] })])],
        notes: "Compare notes.",
      },
      {
        name: "metrics",
        layers: [mockLayer([mockText({ id: "t5", name: "Met", bbox: { x: 80, y: 200, w: 400, h: 100 }, paragraphs: [{ runs: [{ text: "D" }] }] })])],
        notes: "Metrics notes.",
      },
      {
        name: "closing",
        background: { kind: "solid", color: "#222222" },
        layers: [mockLayer([mockText({ id: "t6", name: "Bye", bbox: { x: 80, y: 200, w: 400, h: 100 }, paragraphs: [{ runs: [{ text: "E" }] }] })])],
        notes: "Closing notes.",
      },
    ]);
    const before = runP0Gates(deck);
    assert.equal(before.findings.some((f) => f.kind === "cover-visual"), true);
    ensureCoverVisual(deck);
    const after = runP0Gates(deck);
    assert.equal(
      after.findings.some((f) => f.kind === "cover-visual"),
      false,
      JSON.stringify(after.findings.filter((f) => f.kind === "cover-visual")),
    );
  });

  it("ensureNoTextOverlap clears text-overlap", () => {
    const deck = makeMockPres([
      {
        name: "title-bullets",
        layers: [
          mockLayer([
            mockText({ id: "a", name: "A", bbox: { x: 100, y: 100, w: 400, h: 120 }, paragraphs: [{ runs: [{ text: "One" }] }] }),
            mockText({ id: "b", name: "B", bbox: { x: 120, y: 140, w: 400, h: 120 }, paragraphs: [{ runs: [{ text: "Two" }] }] }),
          ]),
        ],
        notes: "Overlap notes here.",
      },
    ]);
    // Pad to 6 slides with notes so other gates don't dominate
    for (let i = 1; i < 6; i++) {
      deck.slides.push({
        id: `s${i}`,
        index: i,
        name: i === 5 ? "closing" : `cards-${i}`,
        layers: [mockLayer([mockText({ id: `t${i}`, name: "T", bbox: { x: 80, y: 200, w: 400, h: 80 }, paragraphs: [{ runs: [{ text: "x" }] }] })])],
        notes: "Speaker notes for padding slide.",
        visible: true,
      } as never);
    }
    ensureCoverVisual(deck);
    const before = runP0Gates(deck);
    assert.equal(before.findings.some((f) => f.kind === "text-overlap"), true);
    ensureNoTextOverlap(deck);
    const after = runP0Gates(deck);
    assert.equal(
      after.findings.some((f) => f.kind === "text-overlap"),
      false,
      JSON.stringify(after.findings.filter((f) => f.kind === "text-overlap")),
    );
  });

  it("ensureNoTextOverlap clears stacked overlap without clipping (Seed 11)", () => {
    // Three tall texts near the bottom — a single push-down pass would clip.
    const deck = makeMockPres([
      {
        name: "title-bullets",
        layers: [
          mockLayer([
            mockText({
              id: "t1",
              name: "T1",
              bbox: { x: 80, y: 280, w: 500, h: 160 },
              paragraphs: [{ runs: [{ text: "Alpha title that is long" }] }],
            }),
            mockText({
              id: "t2",
              name: "T2",
              bbox: { x: 90, y: 320, w: 500, h: 160 },
              paragraphs: [{ runs: [{ text: "Beta body overlaps alpha" }] }],
            }),
            mockText({
              id: "t3",
              name: "T3",
              bbox: { x: 100, y: 360, w: 500, h: 160 },
              paragraphs: [{ runs: [{ text: "Gamma near canvas floor" }] }],
            }),
          ]),
        ],
        notes: "Speaker notes for seed11 regression.",
      },
    ]);
    for (let i = 1; i < 6; i++) {
      deck.slides.push({
        id: `s${i}`,
        index: i,
        name: i === 5 ? "closing" : `cards-${i}`,
        layers: [
          mockLayer([
            mockText({
              id: `t${i}`,
              name: "T",
              bbox: { x: 80, y: 200, w: 400, h: 80 },
              paragraphs: [{ runs: [{ text: "x" }] }],
            }),
          ]),
        ],
        notes: "Speaker notes for padding slide.",
        visible: true,
      } as never);
    }
    // Default fixture canvas is 1280×720 — keep it; stack sits in lower half.
    const before = runP0Gates(deck);
    assert.equal(before.findings.some((f) => f.kind === "text-overlap"), true);
    ensureNoTextOverlap(deck);
    // Mimic lifecycle: spacing/title can run after first noOverlap — call ensure again as final.
    ensureNoTextOverlap(deck);
    const after = runP0Gates(deck);
    assert.equal(
      after.findings.some((f) => f.kind === "text-overlap"),
      false,
      JSON.stringify(after.findings.filter((f) => f.kind === "text-overlap")),
    );
  });
  it("ensureNoTextOverlap clears side-by-side cards without floor-pile (Seed 11 hole)", () => {
    // Old minGap path treated non-overlapping columns as "too close" vertically,
    // stacked them, then piled residual boxes at y=H-8 → many text-overlap findings.
    const deck = makeMockPres([
      {
        name: "cards",
        layers: [
          mockLayer([
            mockText({
              id: "c1",
              name: "Card1",
              bbox: { x: 40, y: 120, w: 280, h: 320 },
              paragraphs: [{ runs: [{ text: "Left card body" }] }],
            }),
            mockText({
              id: "c2",
              name: "Card2",
              bbox: { x: 360, y: 120, w: 280, h: 320 },
              paragraphs: [{ runs: [{ text: "Mid card body" }] }],
            }),
            mockText({
              id: "c3",
              name: "Card3",
              bbox: { x: 680, y: 120, w: 280, h: 320 },
              paragraphs: [{ runs: [{ text: "Right card body" }] }],
            }),
            // Slight real overlap on mid/right (detector would fire).
            mockText({
              id: "c3b",
              name: "Card3b",
              bbox: { x: 720, y: 200, w: 260, h: 200 },
              paragraphs: [{ runs: [{ text: "Overlap on right card" }] }],
            }),
          ]),
        ],
        notes: "Speaker notes for side-by-side regression.",
      },
    ]);
    for (let i = 1; i < 6; i++) {
      deck.slides.push({
        id: `s${i}`,
        index: i,
        name: i === 5 ? "closing" : `pad-${i}`,
        layers: [
          mockLayer([
            mockText({
              id: `t${i}`,
              name: "T",
              bbox: { x: 80, y: 200, w: 400, h: 80 },
              paragraphs: [{ runs: [{ text: "x" }] }],
            }),
          ]),
        ],
        notes: "Speaker notes for padding slide.",
        visible: true,
      } as never);
    }
    const before = runP0Gates(deck);
    assert.equal(before.findings.some((f) => f.kind === "text-overlap"), true);
    ensureNoTextOverlap(deck);
    ensureNoTextOverlap(deck);
    const after = runP0Gates(deck);
    assert.equal(
      after.findings.some((f) => f.kind === "text-overlap"),
      false,
      JSON.stringify(after.findings.filter((f) => f.kind === "text-overlap")),
    );
    // Side-by-side cards must not all be crushed to the canvas floor.
    const slide0 = deck.slides[0]!;
    const ys = slide0.layers[0]!.shapes
      .filter((s) => s.kind === "text")
      .map((s) => (s as { bbox: { y: number } }).bbox.y);
    assert.ok(ys.some((y) => y < 400), `expected a card still in upper half, got ys=${JSON.stringify(ys)}`);
  });
  it("ensureNoTextOverlap keeps Design H-margin after horizontal split", () => {
    // Near-edge overlap: old clamp used canvas edge (0/W) and left H-margin fails.
    const deck = makeMockPres([
      {
        name: "cards",
        layers: [
          mockLayer([
            mockText({
              id: "a",
              name: "A",
              bbox: { x: 900, y: 100, w: 300, h: 120 },
              paragraphs: [{ runs: [{ text: "Rightish" }] }],
            }),
            mockText({
              id: "b",
              name: "B",
              bbox: { x: 1000, y: 110, w: 300, h: 120 },
              paragraphs: [{ runs: [{ text: "Past edge overlap" }] }],
            }),
          ]),
        ],
        notes: "Speaker notes for H-margin regression.",
      },
    ]);
    for (let i = 1; i < 6; i++) {
      deck.slides.push({
        id: `s${i}`,
        index: i,
        name: i === 5 ? "closing" : `pad-${i}`,
        layers: [
          mockLayer([
            mockText({
              id: `t${i}`,
              name: "T",
              bbox: { x: 80, y: 200, w: 400, h: 80 },
              paragraphs: [{ runs: [{ text: "x" }] }],
            }),
          ]),
        ],
        notes: "Speaker notes for padding slide.",
        visible: true,
      } as never);
    }
    ensureNoTextOverlap(deck);
    const W = deck.size.width;
    const short = Math.min(W, deck.size.height);
    const minMargin = 0.04 * short;
    for (const sh of deck.slides[0]!.layers[0]!.shapes) {
      if (sh.kind !== "text") continue;
      const b = (sh as { bbox: { x: number; w: number } }).bbox;
      assert.ok(b.x >= minMargin - 1, `left H-margin: x=${b.x}`);
      assert.ok(b.x + b.w <= W - minMargin + 1, `right H-margin: right=${b.x + b.w}`);
    }
    const after = runP0Gates(deck);
    assert.equal(
      after.findings.some((f) => f.kind === "text-overlap"),
      false,
      JSON.stringify(after.findings.filter((f) => f.kind === "text-overlap")),
    );
  });


});

