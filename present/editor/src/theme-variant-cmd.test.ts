import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { identityTransform, type Presentation, type Shape } from "@ppt/core";
import { ApplyThemeVariantCmd } from "./theme-variant-cmd.js";
import { applyThemeVariant, variantPreviewSwatch } from "./theme-variants.js";

function text(id: string, color: string): Shape {
  return {
    id,
    name: id,
    zIndex: 0,
    visible: true,
    locked: false,
    opacity: 1,
    kind: "text",
    bbox: { x: 0, y: 0, w: 100, h: 40 },
    transform: identityTransform(),
    paragraphs: [{ runs: [{ text: "Hi", color }] }],
  };
}

function rect(id: string, color: string): Shape {
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
    fill: { kind: "solid", color },
  };
}

function deck(): Presentation {
  return {
    id: "p",
    size: { width: 1280, height: 720 },
    theme: {
      id: "tech",
      name: "Graphite",
      colors: {
        bg: "#141518",
        bg1: "#27282a",
        tx1: "#eef1ec",
        text: "#eef1ec",
        accent1: "#b4bd7d",
      },
    },
    masters: [
      {
        id: "m",
        name: "Master",
        background: {
          kind: "linear",
          angle: 150,
          stops: [
            { offset: 0, color: "#1b1d21" },
            { offset: 0.5, color: "#141518" },
            { offset: 1, color: "#0d0e10" },
          ],
        },
        shapes: [rect("dec_bar", "#b4bd7d")],
        layouts: [],
      },
    ],
    slides: [
      {
        id: "s",
        name: "s",
        index: 0,
        layers: [
          {
            id: "content",
            name: "content",
            visible: true,
            locked: false,
            shapes: [text("title", "#eef1ec"), rect("chart", "#0071e3")],
          },
        ],
      },
    ],
  };
}

function masterStops(pres: Presentation): string[] {
  const bg = pres.masters?.[0]?.background;
  if (bg?.kind !== "linear") return [];
  return bg.stops.map((s) => s.color);
}

function channel(hex: string, shift: number): number {
  return (parseInt(hex.slice(1), 16) >> shift) & 255;
}
function red(hex: string): number {
  return channel(hex, 16);
}
function blue(hex: string): number {
  return channel(hex, 0);
}
function luma(hex: string): number {
  return 0.299 * red(hex) + 0.587 * channel(hex, 8) + 0.114 * blue(hex);
}
function chroma(hex: string): number {
  const r = red(hex);
  const g = channel(hex, 8);
  const b = blue(hex);
  return Math.max(r, g, b) - Math.min(r, g, b);
}

describe("variant preview swatches", () => {
  it("softens by desaturating and lightening; vivid raises chroma without darkening", () => {
    const colors = { bg: "#4d4d63", accent1: "#8a9078", tx1: "#eef1ec" };
    const soft = applyThemeVariant(colors, "subtle");
    const vivid = applyThemeVariant(colors, "bold");
    assert.ok(luma(soft.bg!) > luma(colors.bg));
    assert.ok(chroma(soft.bg!) < chroma(colors.bg));
    assert.ok(chroma(soft.accent1!) < chroma(colors.accent1!));
    assert.ok(chroma(vivid.bg!) > chroma(colors.bg));
    assert.ok(chroma(vivid.accent1!) > chroma(colors.accent1!));
    assert.ok(luma(vivid.bg!) >= luma(colors.bg) - 1);
    const warm = variantPreviewSwatch(colors, "warm");
    const cool = variantPreviewSwatch(colors, "cool");
    assert.ok(red(warm) > red(colors.bg) && red(warm) > blue(warm));
    assert.ok(blue(cool) > blue(colors.bg) && blue(cool) > red(cool));
  });
});

describe("ApplyThemeVariantCmd", () => {
  it("shifts the theme canvas and leaves unmatched content colors", () => {
    const pres = deck();
    const cmd = new ApplyThemeVariantCmd("warm");
    cmd.apply(pres);
    const stops = masterStops(pres);
    assert.notEqual(stops[0], "#1b1d21");
    assert.equal(stops[1], pres.theme?.colors?.bg);
    assert.notEqual(stops[1], "#141518");
    const dec = pres.masters?.[0]?.shapes[0];
    assert.equal(dec?.fill?.kind, "solid");
    if (dec?.fill?.kind === "solid") assert.equal(dec.fill.color, pres.theme?.colors?.accent1);
    assert.notEqual(pres.theme?.colors?.accent1, "#b4bd7d");
    const title = pres.slides[0]?.layers[0]?.shapes[0];
    assert.equal(title?.kind, "text");
    if (title?.kind === "text") assert.equal(title.paragraphs[0]?.runs[0]?.color, "#eef1ec");
    const chart = pres.slides[0]?.layers[0]?.shapes[1];
    assert.equal(chart?.fill?.kind, "solid");
    if (chart?.fill?.kind === "solid") assert.equal(chart.fill.color, "#0071e3");
    assert.equal(pres.theme?.colors?.tx1, "#eef1ec");

    const once = [...stops];
    cmd.apply(pres);
    assert.deepEqual(masterStops(pres), once);

    cmd.revert(pres);
    assert.deepEqual(masterStops(pres), ["#1b1d21", "#141518", "#0d0e10"]);
    assert.equal(pres.theme?.colors?.accent1, "#b4bd7d");
    assert.equal(pres.theme?.colors?.bg, "#141518");
  });

  it("remaps a solid text fill that matches a theme slot and leaves other fills", () => {
    const pres = deck();
    const matched = text("kpi", "#b4bd7d");
    const other = text("num", "#111111");
    if (matched.kind === "text") matched.paragraphs[0]!.runs[0]!.fill = { kind: "solid", color: "#b4bd7d" };
    if (other.kind === "text") other.paragraphs[0]!.runs[0]!.fill = { kind: "solid", color: "#0071e3" };
    pres.slides[0]!.layers[0]!.shapes.push(matched, other);
    const cmd = new ApplyThemeVariantCmd("warm");
    cmd.apply(pres);
    const accent = pres.theme?.colors?.accent1;
    assert.notEqual(accent, "#b4bd7d");
    if (matched.kind === "text") {
      const run = matched.paragraphs[0]!.runs[0]!;
      assert.equal(run.color, accent);
      assert.equal(run.fill?.kind === "solid" && run.fill.color, accent);
    }
    if (other.kind === "text") {
      const run = other.paragraphs[0]!.runs[0]!;
      assert.equal(run.color, "#111111");
      assert.equal(run.fill?.kind === "solid" && run.fill.color, "#0071e3");
    }
    cmd.revert(pres);
    if (matched.kind === "text") {
      const run = matched.paragraphs[0]!.runs[0]!;
      assert.equal(run.color, "#b4bd7d");
      assert.equal(run.fill?.kind === "solid" && run.fill.color, "#b4bd7d");
    }
  });
});
