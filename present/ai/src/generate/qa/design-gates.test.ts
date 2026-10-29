// Design P1 unit fixtures (no LLM). Mirror content-gate harness style.

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import type { Layer, Presentation, Shape, Slide, TextShape, RectShape } from "@ppt/core";
import { LAYOUT_KINDS } from "../compile/layouts";
import {
  runDesignGates,
  ensureDesignTitleLines,
  ensureDesignSpacing,
  ensureDesignLayoutCatalog,
  isInDesignCatalog,
  type DesignGateKind,
} from "./design-gates";
import { ensureNoTextOverlap } from "./gates";
import { summarizeDeck } from "./art-director";

const identityTransform = { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 };

function mockLayer(shapes: Shape[]): Layer {
  return { id: "layer-0", name: "Content", visible: true, locked: false, shapes };
}

function mockRect(props: Partial<RectShape> & { id: string }): RectShape {
  return {
    kind: "rect",
    name: props.name ?? "Rectangle",
    bbox: props.bbox ?? { x: 0, y: 0, w: 100, h: 100 },
    visible: true,
    transform: identityTransform,
    zIndex: 0,
    locked: false,
    opacity: 1,
    fill: props.fill ?? { kind: "solid", color: "#d4af37" },
    ...props,
  } as RectShape;
}

function mockText(props: {
  id: string;
  name: string;
  bbox: { x: number; y: number; w: number; h: number };
  text: string;
  fontSize: number;
  color?: string;
}): TextShape {
  return {
    kind: "text",
    id: props.id,
    name: props.name,
    bbox: props.bbox,
    visible: true,
    transform: identityTransform,
    zIndex: 0,
    locked: false,
    opacity: 1,
    paragraphs: [
      {
        runs: [{ text: props.text, fontSize: props.fontSize, color: props.color ?? "#ffffff" }],
      },
    ],
  } as TextShape;
}

function makePres(slides: Partial<Slide>[], bgDefault: string): Presentation {
  return {
    id: "design-fixture",
    size: { width: 1280, height: 720 },
    slides: slides.map((s, i) => ({
      id: `slide-${i}`,
      index: i,
      name: s.name ?? `Slide ${i + 1}`,
      layers: s.layers ?? [mockLayer([])],
      background: s.background ?? { kind: "solid", color: bgDefault },
      notes: s.notes ?? "Speaker notes for this slide go here.",
      visible: true,
      ...s,
    })) as Slide[],
    theme: { id: "default", name: "default", colors: { bg1: bgDefault } },
    masters: [],
  } as Presentation;
}

/** Balanced content bbox ~50% of canvas. */
function bodyBlock(y: number, text: string, size: number, color: string): TextShape {
  return mockText({
    id: `b-${y}`,
    name: "Body",
    bbox: { x: 80, y, w: 1120, h: 80 },
    text,
    fontSize: size,
    color,
  });
}

function goodDeckA(): Presentation {
  // midnight bg, champagne accent, white titles — system A
  return makePres(
    [
      {
        name: "hero-fullbleed",
        background: { kind: "solid", color: "#0b1220" },
        layers: [
          mockLayer([
            mockRect({ id: "acc", name: "Accent", bbox: { x: 80, y: 640, w: 200, h: 8 }, fill: { kind: "solid", color: "#d4af37" } }),
            mockText({ id: "t0", name: "Title", bbox: { x: 80, y: 240, w: 1120, h: 100 }, text: "Launch Night", fontSize: 44, color: "#ffffff" }),
            mockText({ id: "s0", name: "Subtitle", bbox: { x: 80, y: 360, w: 1120, h: 40 }, text: "Product keynote", fontSize: 22, color: "#e2e8f0" }),
          ]),
        ],
      },
      {
        name: "cards-3",
        background: { kind: "solid", color: "#0f172a" },
        layers: [
          mockLayer([
            mockText({ id: "t1", name: "Title", bbox: { x: 80, y: 60, w: 1120, h: 50 }, text: "Pillars", fontSize: 32, color: "#ffffff" }),
            bodyBlock(160, "Card one body copy here.", 18, "#e2e8f0"),
            bodyBlock(280, "Card two body copy here.", 18, "#e2e8f0"),
            bodyBlock(400, "Card three body copy here.", 18, "#e2e8f0"),
          ]),
        ],
      },
      {
        name: "process-h",
        background: { kind: "solid", color: "#0f172a" },
        layers: [
          mockLayer([
            mockText({ id: "t2", name: "Title", bbox: { x: 80, y: 60, w: 1120, h: 50 }, text: "How it works", fontSize: 32, color: "#ffffff" }),
            bodyBlock(180, "Step one detail.", 18, "#e2e8f0"),
            bodyBlock(300, "Step two detail.", 18, "#e2e8f0"),
            bodyBlock(420, "Step three detail.", 18, "#e2e8f0"),
          ]),
        ],
      },
      {
        name: "comparison",
        background: { kind: "solid", color: "#0f172a" },
        layers: [
          mockLayer([
            mockText({ id: "t3", name: "Title", bbox: { x: 80, y: 60, w: 1120, h: 50 }, text: "Before vs After", fontSize: 32, color: "#ffffff" }),
            bodyBlock(200, "Left column points.", 18, "#e2e8f0"),
            bodyBlock(360, "Right column points.", 18, "#e2e8f0"),
          ]),
        ],
      },
      {
        name: "two-column",
        background: { kind: "solid", color: "#0f172a" },
        layers: [
          mockLayer([
            mockText({ id: "t4", name: "Title", bbox: { x: 80, y: 60, w: 1120, h: 50 }, text: "Details", fontSize: 32, color: "#ffffff" }),
            bodyBlock(200, "Left facts.", 18, "#e2e8f0"),
            bodyBlock(360, "Right facts.", 18, "#e2e8f0"),
          ]),
        ],
      },
      {
        name: "closing-cta",
        background: { kind: "solid", color: "#0b1220" },
        layers: [
          mockLayer([
            mockText({ id: "t5", name: "Title", bbox: { x: 80, y: 280, w: 1120, h: 90 }, text: "Thank you", fontSize: 44, color: "#ffffff" }),
            mockText({ id: "s5", name: "Subtitle", bbox: { x: 80, y: 400, w: 1120, h: 40 }, text: "Let's talk", fontSize: 22, color: "#e2e8f0" }),
          ]),
        ],
      },
    ],
    "#0b1220",
  );
}

function goodDeckB(): Presentation {
  return makePres(
    [
      {
        name: "hero-fullbleed",
        background: { kind: "solid", color: "#ffffff" },
        layers: [
          mockLayer([
            mockRect({ id: "acc", name: "Accent", bbox: { x: 80, y: 640, w: 200, h: 8 }, fill: { kind: "solid", color: "#2563eb" } }),
            mockText({ id: "t0", name: "Title", bbox: { x: 80, y: 240, w: 1120, h: 100 }, text: "Magazine Open", fontSize: 44, color: "#0f172a" }),
            mockText({ id: "s0", name: "Subtitle", bbox: { x: 80, y: 360, w: 1120, h: 40 }, text: "Editorial story", fontSize: 22, color: "#1e293b" }),
          ]),
        ],
      },
      {
        name: "cards-2",
        background: { kind: "solid", color: "#f8fafc" },
        layers: [
          mockLayer([
            mockText({ id: "t1", name: "Title", bbox: { x: 80, y: 60, w: 1120, h: 50 }, text: "Features", fontSize: 32, color: "#0f172a" }),
            bodyBlock(180, "Feature A body.", 18, "#1e293b"),
            bodyBlock(340, "Feature B body.", 18, "#1e293b"),
          ]),
        ],
      },
      {
        name: "process-h",
        background: { kind: "solid", color: "#ffffff" },
        layers: [
          mockLayer([
            mockText({ id: "t2", name: "Title", bbox: { x: 80, y: 60, w: 1120, h: 50 }, text: "Process", fontSize: 32, color: "#0f172a" }),
            bodyBlock(180, "Step A.", 18, "#1e293b"),
            bodyBlock(320, "Step B.", 18, "#1e293b"),
            bodyBlock(460, "Step C.", 18, "#1e293b"),
          ]),
        ],
      },
      {
        name: "comparison",
        background: { kind: "solid", color: "#fafafa" },
        layers: [
          mockLayer([
            mockText({ id: "t3", name: "Title", bbox: { x: 80, y: 60, w: 1120, h: 50 }, text: "Compare", fontSize: 32, color: "#0f172a" }),
            bodyBlock(200, "Left.", 18, "#1e293b"),
            bodyBlock(360, "Right.", 18, "#1e293b"),
          ]),
        ],
      },
      {
        name: "two-column",
        background: { kind: "solid", color: "#ffffff" },
        layers: [
          mockLayer([
            mockText({ id: "t4", name: "Title", bbox: { x: 80, y: 60, w: 1120, h: 50 }, text: "Columns", fontSize: 32, color: "#0f172a" }),
            bodyBlock(200, "L.", 18, "#1e293b"),
            bodyBlock(360, "R.", 18, "#1e293b"),
          ]),
        ],
      },
      {
        name: "closing-cta",
        background: { kind: "solid", color: "#ffffff" },
        layers: [
          mockLayer([
            mockText({ id: "t5", name: "Title", bbox: { x: 80, y: 280, w: 1120, h: 90 }, text: "Call to action", fontSize: 44, color: "#0f172a" }),
            mockText({ id: "s5", name: "Subtitle", bbox: { x: 80, y: 400, w: 1120, h: 40 }, text: "Next step", fontSize: 22, color: "#1e293b" }),
          ]),
        ],
      },
    ],
    "#ffffff",
  );
}

function assertFailsKind(kind: DesignGateKind, result: ReturnType<typeof runDesignGates>): void {
  assert.equal(result.passed, false);
  assert.ok(result.findings.some((f) => f.kind === kind), `expected ${kind}, got ${result.findings.map((f) => f.kind).join(",")}`);
}

describe("runDesignGates", () => {
  it("good-A → Design pass", () => {
    const r = runDesignGates(goodDeckA(), { visualSystem: "A" });
    assert.equal(r.passed, true, JSON.stringify(r.findings, null, 2));
  });

  it("good-B → Design pass", () => {
    const r = runDesignGates(goodDeckB(), { visualSystem: "B" });
    assert.equal(r.passed, true, JSON.stringify(r.findings, null, 2));
  });

  it("bad-type → FAIL type-floor", () => {
    const pres = goodDeckA();
    // Shrink cover title below 36pt floor
    const title = pres.slides[0]!.layers[0]!.shapes.find((s) => s.name === "Title") as TextShape;
    title.paragraphs[0]!.runs[0]!.fontSize = 18;
    assertFailsKind("type-floor", runDesignGates(pres, { visualSystem: "A" }));
  });

  it("bad-space → FAIL spacing", () => {
    const pres = goodDeckA();
    // Push body off margin + make content tiny
    const slide = pres.slides[1]!;
    slide.layers = [
      mockLayer([
        mockText({ id: "t", name: "Title", bbox: { x: 2, y: 10, w: 100, h: 30 }, text: "Tiny", fontSize: 32, color: "#ffffff" }),
      ]),
    ];
    assertFailsKind("spacing", runDesignGates(pres, { visualSystem: "A" }));
  });

  it("bad-layout → FAIL layout-catalog", () => {
    const pres = goodDeckA();
    pres.slides[1]!.name = "invented-mosaic";
    assertFailsKind("layout-catalog", runDesignGates(pres, { visualSystem: "A" }));
  });

  it("every compile layout kind is in the Design catalog", () => {
    for (const k of LAYOUT_KINDS) {
      assert.equal(isInDesignCatalog(k), true, k);
    }
  });

  it("image-text / chart / banner / table / timeline / agenda do not fail layout-not-in-catalog", () => {
    const kinds = ["image-text", "chart", "banner", "table", "timeline", "agenda"] as const;
    for (const kind of kinds) {
      const pres = goodDeckA();
      pres.slides[4]!.name = kind;
      const r = runDesignGates(pres, { visualSystem: "A" });
      assert.ok(
        !r.findings.some((f) => f.issue.includes("layout not in catalog")),
        `${kind}: ${r.findings.map((f) => f.issue).join("; ")}`,
      );
    }
  });

  it("ensureDesignLayoutCatalog keeps compile kinds and fills invented names", () => {
    const pres = goodDeckA();
    pres.slides[1]!.name = "cards";
    pres.slides[2]!.name = "Launch Night";
    ensureDesignLayoutCatalog(pres, ["cover", "image-text", "process"]);
    assert.equal(pres.slides[1]!.name, "cards");
    assert.equal(pres.slides[2]!.name, "process");
    const r = runDesignGates(pres, { visualSystem: "A" });
    assert.ok(
      !r.findings.some((f) => f.kind === "layout-catalog"),
      `layout-catalog after ensure: ${r.findings.map((f) => f.issue).join("; ")}`,
    );
  });

  it("bad-theme → FAIL visual-system (#4)", () => {
    const pres = goodDeckA();
    // Force light paper bg while claiming system A
    for (const s of pres.slides) s.background = { kind: "solid", color: "#ffffff" };
    assertFailsKind("visual-system", runDesignGates(pres, { visualSystem: "A" }));
  });
});


describe("ensureDesignTitleLines + spacing", () => {
  it("clears title-squeezed on tall title bbox (content slide)", () => {
    const short = 720;
    const size = 28;
    // round(h/(size*1.25)) with h=200 → ~6 lines → squeezed
    const title = mockText({
      id: "t1",
      name: "Title",
      bbox: { x: 80, y: 40, w: 1120, h: 200 },
      text: "One line title that was boxed too tall",
      fontSize: size,
    });
    const body = mockText({
      id: "b1",
      name: "Body",
      bbox: { x: 80, y: 280, w: 1120, h: 200 },
      text: "Body copy for the content slide.",
      fontSize: 16,
    });
    const before = makePres(
      [{ name: "title-bullets", layers: [mockLayer([title, body])] }],
      "#0b1220",
    );
    const fail = runDesignGates(before, { visualSystem: "A" });
    assert.ok(
      fail.findings.some((f) => f.issue.includes("title squeezed")),
      `expected title squeezed before ensure, got ${fail.findings.map((f) => f.issue).join("; ")}`,
    );
    ensureDesignTitleLines(before);
    const after = runDesignGates(before, { visualSystem: "A" });
    assert.ok(
      !after.findings.some((f) => f.issue.includes("title squeezed")),
      `title squeezed still present: ${after.findings.map((f) => f.issue).join("; ")}`,
    );
  });

  it("clears H-margin after ensureDesignSpacing on overflow text", () => {
    const title = mockText({
      id: "t1",
      name: "Title",
      bbox: { x: -20, y: 40, w: 1320, h: 40 },
      text: "Wide title",
      fontSize: 28,
    });
    const body = mockText({
      id: "b1",
      name: "Body",
      bbox: { x: 80, y: 120, w: 1120, h: 240 },
      text: "Body",
      fontSize: 16,
    });
    const pres = makePres(
      [{ name: "title-bullets", layers: [mockLayer([title, body])] }],
      "#0b1220",
    );
    ensureDesignSpacing(pres);
    ensureDesignTitleLines(pres);
    ensureDesignSpacing(pres);
    const r = runDesignGates(pres, { visualSystem: "A" });
    assert.ok(
      !r.findings.some((f) => f.issue.includes("H-margin")),
      `H-margin still present: ${r.findings.map((f) => f.issue).join("; ")}`,
    );
  });

  it("spacing scale then titleLines last still clears squeezed", () => {
    const title = mockText({
      id: "t1",
      name: "Title",
      bbox: { x: 80, y: 40, w: 400, h: 40 },
      text: "Short title",
      fontSize: 28,
    });
    // Sparse deck so ensureDesignSpacing grows from center (ratio < 0.35).
    const pres = makePres(
      [{ name: "title-bullets", layers: [mockLayer([title])] }],
      "#0b1220",
    );
    ensureDesignSpacing(pres);
    ensureDesignSpacing(pres);
    // After grow, title bbox is taller → would be squeezed without re-cap.
    ensureDesignTitleLines(pres);
    const r = runDesignGates(pres, { visualSystem: "A" });
    assert.ok(
      !r.findings.some((f) => f.issue.includes("title squeezed")),
      `title squeezed after order: ${r.findings.map((f) => f.issue).join("; ")}`,
    );
  });


  it("block gap survives ratio scale-down", () => {
    // Two stacked titles with tiny gap; large boxes so content ratio > 0.82 → scale-down.
    const a = mockText({
      id: "a",
      name: "Title",
      bbox: { x: 40, y: 40, w: 1200, h: 300 },
      text: "First block",
      fontSize: 28,
    });
    const b = mockText({
      id: "b",
      name: "Body",
      bbox: { x: 40, y: 350, w: 1200, h: 300 },
      text: "Second block almost touching",
      fontSize: 16,
    });
    // gap = 350 - (40+300) = 10; minGap on 720 short ≈ 0.6*16*1.3 ≈ 12.5 → too tight
    const pres = makePres(
      [{ name: "title-bullets", layers: [mockLayer([a, b])] }],
      "#0b1220",
    );
    ensureDesignSpacing(pres);
    const r = runDesignGates(pres, { visualSystem: "A" });
    assert.ok(
      !r.findings.some((f) => f.issue.includes("block gap")),
      `block gap still present: ${r.findings.map((f) => f.issue).join("; ")}`,
    );
  });


  it("noOverlap 8px gap then spacing clears Design block-gap", () => {
    const short = 720;
    const minGap = 0.6 * 16 * (short / 720) * 1.3;
    const a = mockText({
      id: "a",
      name: "Title",
      bbox: { x: 80, y: 40, w: 1000, h: 80 },
      text: "Title",
      fontSize: 28,
    });
    // Place B so after a fake 8px noOverlap-style gap it would still fail Design.
    const b = mockText({
      id: "b",
      name: "Body",
      bbox: { x: 80, y: 40 + 80 + 8, w: 1000, h: 100 },
      text: "Body under title",
      fontSize: 16,
    });
    const pres = makePres(
      [{ name: "process", layers: [mockLayer([a, b])] }],
      "#0b1220",
    );
    ensureNoTextOverlap(pres);
    // Simulate legacy 8px separation (in case noOverlap already uses minGap — still call spacing).
    ensureDesignSpacing(pres);
    const r = runDesignGates(pres, { visualSystem: "A" });
    assert.ok(
      !r.findings.some((f) => f.issue.includes("block gap")),
      `block gap after noOverlap+spacing: ${r.findings.map((f) => f.issue).join("; ")}`,
    );
  });


  it("titleLines must run after final spacing", () => {
    const title = mockText({
      id: "t1",
      name: "Title",
      bbox: { x: 80, y: 40, w: 400, h: 40 },
      text: "Short",
      fontSize: 28,
    });
    const body = mockText({
      id: "b1",
      name: "Body",
      bbox: { x: 80, y: 120, w: 400, h: 80 },
      text: "Body",
      fontSize: 16,
    });
    const pres = makePres(
      [{ name: "title-bullets", layers: [mockLayer([title, body])] }],
      "#0b1220",
    );
    ensureDesignTitleLines(pres);
    // Simulate final spacing scale-up on underfilled slide (grows title bbox.h).
    ensureDesignSpacing(pres);
    ensureDesignSpacing(pres);
    // Without re-cap, title may be squeezed again — re-run titleLines last.
    ensureDesignTitleLines(pres);
    const r = runDesignGates(pres, { visualSystem: "A" });
    assert.ok(
      !r.findings.some((f) => f.issue.includes("title squeezed")),
      `title squeezed after spacing→titleLines: ${r.findings.map((f) => f.issue).join("; ")}`,
    );
  });

});

describe("art-director summary sees what text sits on", () => {
  it("reports the band / sidebar fill behind white text and whether photo pages carry a scrim", () => {
    const band = mockRect({ id: "band", name: "band", bbox: { x: 0, y: 0, w: 1280, h: 118 }, fill: { kind: "solid", color: "#1F5BFF" } });
    const onBand = mockText({ id: "t1", name: "title", bbox: { x: 140, y: 44, w: 800, h: 48 }, text: "上线后的效率变化", fontSize: 36, color: "#F7F9FC" });
    const onField = mockText({ id: "t2", name: "caption", bbox: { x: 560, y: 166, w: 656, h: 20 }, text: "以传统模式 = 100 为基线", fontSize: 13, color: "#5B6B84" });
    const overlay = mockRect({ id: "ov", name: "BG overlay", bbox: { x: 0, y: 0, w: 1280, h: 720 }, fill: { kind: "solid", color: "#000000", alpha: 0.5 } });
    const onPhoto = mockText({ id: "t3", name: "title", bbox: { x: 64, y: 400, w: 800, h: 60 }, text: "Photo title", fontSize: 40, color: "#FFFFFF" });
    const pres = makePres(
      [
        { layers: [mockLayer([band, onBand, onField])] },
        { background: { kind: "image", src: "data:image/png;base64,AAAA", fit: "cover" }, layers: [mockLayer([overlay, onPhoto])] },
        { background: { kind: "image", src: "data:image/png;base64,AAAA", fit: "cover" }, layers: [mockLayer([onPhoto])] },
      ],
      "#F7F9FC",
    );
    const summary = summarizeDeck(pres) as { slides: Array<{ background: { scrim?: boolean }; texts: Array<{ shapeId: string; on?: string }> }> };
    const s0 = summary.slides[0]!;
    assert.equal(s0.texts.find((t) => t.shapeId === "t1")?.on, "#1f5bff");
    assert.equal(s0.texts.find((t) => t.shapeId === "t2")?.on, "#f7f9fc");
    assert.equal(summary.slides[1]!.background.scrim, true);
    assert.equal(summary.slides[1]!.texts[0]?.on, "#141414");
    assert.equal(summary.slides[2]!.background.scrim, false);
    assert.equal(summary.slides[2]!.texts[0]?.on, "image");
  });

  it("lists tables (headers + first column) and charts (series) so a carrier page is not read as empty", () => {
    const cell = (id: string, text: string) => mockText({ id, name: id, bbox: { x: 0, y: 0, w: 100, h: 30 }, text, fontSize: 13, color: "#0F172A" });
    const table = {
      ...mockRect({ id: "tbl", name: "table", bbox: { x: 64, y: 200, w: 1152, h: 300 } }),
      kind: "group" as const,
      children: [cell("h0", "维度"), cell("h1", "传统"), cell("h2", "AI 原生"), cell("r1c0", "组织方式"), cell("r1c1", "目录树"), cell("r1c2", "向量索引"), cell("r2c0", "使用方式"), cell("r2c1", "关键词"), cell("r2c2", "对话")],
      tableMeta: { rows: 3, cols: 3, firstRow: true, bandRow: true },
    };
    const chart = {
      ...mockRect({ id: "ch", name: "chart", bbox: { x: 64, y: 200, w: 600, h: 300 } }),
      kind: "chart" as const,
      chart: { type: "bar" as const, categories: ["A", "B"], series: [{ name: "分钟", values: [8, 3] }], showValues: true },
    };
    const pres = makePres([{ layers: [mockLayer([table as never, chart as never])] }], "#FFFFFF");
    const summary = summarizeDeck(pres) as { slides: Array<{ texts: unknown[]; tables?: Array<{ rows: number; cols: number; headers: string[]; firstColumn: string[] }>; charts?: Array<{ type: string; series: Array<{ name: string; values: number[] }> }> }> };
    const s = summary.slides[0]!;
    assert.equal(s.texts.length, 0, "cells are not repeated as loose texts");
    assert.equal(s.tables?.length, 1);
    assert.deepEqual(s.tables![0]!.headers, ["维度", "传统", "AI 原生"]);
    assert.deepEqual(s.tables![0]!.firstColumn, ["组织方式", "使用方式"]);
    assert.equal(s.tables![0]!.rows, 2);
    assert.equal(s.charts?.[0]?.type, "bar");
    assert.deepEqual(s.charts?.[0]?.series[0]?.values, [8, 3]);
  });
});

