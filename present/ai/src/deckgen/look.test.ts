import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TextShape } from "@ppt/core";
import { harmonizePalette, mergeAuthoredPalette, onRoleText, paletteOf, seedColorTheme, themeFromAuthoredLook } from "./color-theme.js";
import { contrastRatio, parseHex } from "../generate/qa/color.js";
import { applyColorTheme } from "./apply-theme.js";
import { normalizeTreatment, resolveTreatment, snapCanvas } from "./snap.js";
import { resolveVisualSystem } from "./visual-system.js";
import { compileCanvasDeck } from "./pipeline.js";
import type { FilledSlide } from "./ir.js";
import { effectiveRunColor } from "../generate/qa/validate.js";

const cr = (a: string, b: string): number => contrastRatio(parseHex(a)!, parseHex(b)!);

describe("palette harmonization", () => {
  it("lifts a careless authored palette to its floors without changing the family", () => {
    // Model wrote: surface = bg, faint muted, a yellow accent on white, no line.
    const pal = harmonizePalette({
      bg: "#FFFFFF",
      surface: "#FFFFFF",
      ink: "#9CA3AF",
      muted: "#D1D5DB",
      line: "#FFFFFF",
      accent: "#FDE047",
      accentSoft: "#FFFFFF",
    });
    assert.ok(cr(pal.ink, pal.bg) >= 7, `ink ${pal.ink} on bg`);
    assert.ok(cr(pal.muted, pal.bg) >= 4.5, `muted ${pal.muted} on bg`);
    assert.ok(cr(pal.accent, pal.bg) >= 1.5, `accent ${pal.accent} on bg`);
    assert.ok(cr(pal.surface, pal.bg) >= 1.05, `surface ${pal.surface} separated from bg`);
    assert.ok(cr(pal.ink, pal.surface) >= 4.5, "ink on surface");
    assert.ok(cr(pal.ink, pal.accentSoft) >= 4.5, "ink on accentSoft");
    assert.notEqual(pal.accentSoft.toLowerCase(), pal.bg.toLowerCase(), "accentSoft is a tint, not the paper");
    assert.ok(cr(pal.line, pal.bg) >= 1.2, "line exists");
    // The accent stays yellow, just deep enough to read.
    const a = parseHex(pal.accent)!;
    assert.ok(a.r > a.b && a.g > a.b, `accent hue preserved: ${pal.accent}`);
  });

  it("keeps an already-good palette byte-for-byte", () => {
    const good = { bg: "#0B1020", surface: "#141B33", ink: "#F1F5F9", muted: "#A5B4CF", line: "#243055", accent: "#38BDF8", accentSoft: "#1A2E4A" };
    const pal = harmonizePalette(good);
    assert.deepEqual(pal, good);
  });

  it("derives the missing roles from bg / ink / accent instead of an unrelated seed", () => {
    const seed = seedColorTheme("dark-tech");
    const theme = mergeAuthoredPalette(seed, { bg: "#101418", ink: "#F5F7FA", accent: "#22D3EE" });
    const pal = paletteOf(theme);
    const bg = parseHex(pal.bg)!;
    const surface = parseHex(pal.surface)!;
    assert.ok(surface.r >= bg.r && surface.g >= bg.g && surface.b >= bg.b, "dark paper: surface a step lighter");
    assert.ok(cr(pal.muted, pal.bg) >= 4.5);
    const soft = parseHex(pal.accentSoft)!;
    assert.ok(soft.b > soft.r, "accentSoft carries the cyan accent");
    assert.equal(theme.onPhoto, "#F8FAFC");
  });

  it("picks type colour on a filled role by contrast, never muted", () => {
    const pal = paletteOf(themeFromAuthoredLook({ systemId: "swiss", palette: { bg: "#FFFFFF", ink: "#111111", accent: "#0044CC" } }));
    const onAccent = onRoleText(pal, "accent");
    assert.ok(cr(onAccent, pal.accent) >= 4.5, `${onAccent} on ${pal.accent}`);
    assert.notEqual(onAccent, pal.muted);
  });
});

describe("text reads on its backdrop", () => {
  it("swaps a text token that fails AA on its panel or on a linear field", () => {
    const theme = seedColorTheme("dark-tech");
    const pal = paletteOf(theme);
    const slides: FilledSlide[] = [
      {
        layout: "data",
        variant: "canvas",
        background: { kind: "linear", paintRole: "bg", toRole: "accent", angle: 90 },
        elements: [
          { slot: "band", kind: "surface", name: "band", bbox: { x: 64, y: 100, w: 600, h: 120 }, paintRole: "accent" },
          // muted on an accent band: unreadable in most palettes
          { slot: "bandText", kind: "text", name: "slot:bandText", bbox: { x: 80, y: 120, w: 560, h: 60 }, paintRole: "muted", text: "Roadmap", fontSize: 24 },
          // ink token on the accent end of a bg→accent sweep
          { slot: "foot", kind: "text", name: "slot:foot", bbox: { x: 80, y: 640, w: 560, h: 40 }, paintRole: "muted", text: "Footer", fontSize: 16 },
        ],
      },
    ];
    const painted = applyColorTheme(slides, theme);
    const band = painted[0]!.elements.find((e) => e.slot === "bandText")!;
    assert.ok(cr(band.color, pal.accent) >= 4.5, `${band.color} on accent band (was ${band.recoloredFrom ?? "kept"})`);
    for (const el of painted[0]!.elements) {
      if (el.kind !== "text") continue;
      if (el.recoloredFrom) assert.notEqual(el.recoloredFrom, el.color);
    }
  });
});

describe("display type treatments", () => {
  it("normalizes aliases and gates by system bans", () => {
    assert.equal(normalizeTreatment("Drop Shadow"), "shadow");
    assert.equal(normalizeTreatment("hollow"), "outline");
    assert.equal(normalizeTreatment("neon"), "glow");
    assert.equal(normalizeTreatment("wordart"), undefined);
    const editorial = resolveVisualSystem("editorial");
    assert.equal(resolveTreatment(editorial, "gradient"), "outline", "gradient banned on editorial → system default");
    const dense = resolveVisualSystem("data-dense");
    assert.equal(resolveTreatment(dense, "gradient"), undefined, "data-dense draws none");
    const tech = resolveVisualSystem("dark-tech");
    assert.equal(resolveTreatment(tech, "gradient"), "gradient");
  });

  it("gives the anchor display line the system default and keeps body copy plain", () => {
    const sys = resolveVisualSystem("editorial");
    const slides = snapCanvas(
      [
        {
          layout: "cover",
          variant: "canvas",
          elements: [
            { slot: "title", kind: "text", name: "slot:title", bbox: { x: 64, y: 200, w: 900, h: 160 }, paintRole: "ink", text: "Annual review", fontSize: sys.typeScale.display },
            { slot: "sub", kind: "text", name: "slot:sub", bbox: { x: 64, y: 380, w: 900, h: 60 }, paintRole: "muted", text: "FY26", fontSize: sys.typeScale.body, treatment: "outline" },
          ],
        },
        {
          layout: "data",
          variant: "canvas",
          elements: [
            { slot: "title", kind: "text", name: "slot:title", bbox: { x: 64, y: 60, w: 900, h: 80 }, paintRole: "ink", text: "Results", fontSize: sys.typeScale.h1 },
            { slot: "body", kind: "text", name: "slot:body", bbox: { x: 64, y: 200, w: 900, h: 200 }, paintRole: "ink", text: "Copy", fontSize: sys.typeScale.body },
          ],
        },
      ],
      sys,
    );
    const cover = slides[0]!.elements;
    assert.equal(cover.find((e) => e.slot === "title")!.treatment, "outline");
    assert.equal(cover.find((e) => e.slot === "sub")!.treatment, undefined, "below h2: dropped");
    assert.ok(slides[1]!.elements.every((e) => !e.treatment), "content page gets no default");
  });

  it("emits outline as hollow stroked runs and gradient as a linear run fill", () => {
    const outlineSys = resolveVisualSystem("editorial");
    const outline = compileCanvasDeck({
      system: outlineSys,
      theme: seedColorTheme("editorial"),
      title: "t",
      slides: [
        {
          layout: "cover",
          variant: "canvas",
          elements: [{ slot: "title", kind: "text", name: "slot:title", bbox: { x: 64, y: 200, w: 900, h: 160 }, paintRole: "ink", text: "Annual review", fontSize: outlineSys.typeScale.display }],
        },
      ],
    });
    const hollow = outline.presentation.slides[0]!.layers[0]!.shapes.find((s) => s.kind === "text") as TextShape;
    const run = hollow.paragraphs[0]!.runs[0]!;
    assert.equal(run.color, "transparent");
    assert.equal(run.textOutline?.paint.kind, "solid");
    assert.ok((run.textOutline?.width ?? 0) >= 1.25);
    const strokeHex = (run.textOutline!.paint as { color: string }).color;
    assert.equal(effectiveRunColor(run), strokeHex, "QA reads the stroke colour, not 'missing colour'");

    const techSys = resolveVisualSystem("dark-tech");
    const techTheme = seedColorTheme("dark-tech");
    const grad = compileCanvasDeck({
      system: techSys,
      theme: techTheme,
      title: "t",
      slides: [
        {
          layout: "cover",
          variant: "canvas",
          elements: [{ slot: "title", kind: "text", name: "slot:title", bbox: { x: 64, y: 200, w: 900, h: 160 }, paintRole: "ink", text: "Edge compute", fontSize: techSys.typeScale.display }],
        },
      ],
    });
    const gshape = grad.presentation.slides[0]!.layers[0]!.shapes.find((s) => s.kind === "text") as TextShape;
    const grun = gshape.paragraphs[0]!.runs[0]!;
    assert.equal(grun.fill?.kind, "linear");
    if (grun.fill?.kind === "linear") {
      const pal = paletteOf(techTheme);
      const far = grun.fill.stops[1]!.color;
      assert.ok(cr(far, pal.bg) >= 3, `gradient far end ${far} still reads on paper`);
    }
    assert.equal(grad.reflect.passed, true, grad.reflect.findings.map((f) => f.issue).join("; "));

    // The same display line on an accent band: the accent-tinted far end would dissolve into the
    // band, so the treatment is dropped and the run stays a solid on-accent colour.
    const onBand = compileCanvasDeck({
      system: techSys,
      theme: techTheme,
      title: "t",
      slides: [
        {
          layout: "section",
          variant: "canvas",
          elements: [
            { slot: "band", kind: "surface", name: "band", bbox: { x: 0, y: 596, w: 1280, h: 124 }, paintRole: "accent" },
            { slot: "title", kind: "text", name: "slot:title", bbox: { x: 64, y: 614, w: 900, h: 70 }, paintRole: "bg", text: "Edge compute", fontSize: techSys.typeScale.display, treatment: "gradient" },
          ],
        },
      ],
    });
    const bshape = onBand.presentation.slides[0]!.layers[0]!.shapes.find((s) => s.kind === "text" && s.paragraphs[0]?.runs[0]?.text === "Edge compute") as TextShape;
    const brun = bshape.paragraphs[0]!.runs[0]!;
    assert.equal(brun.fill, undefined, "no gradient fill on an accent band");
    assert.ok(cr(brun.color!, paletteOf(techTheme).accent) >= 3, `solid ${brun.color} reads on the accent band`);
  });
});
