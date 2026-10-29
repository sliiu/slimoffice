import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compileCanvasDeck } from "./pipeline.js";
import { resolveVisualSystem, typeRole } from "./visual-system.js";
import { paletteOf, seedColorTheme, themeFromAuthoredLook } from "./color-theme.js";
import { contrastRatio, parseHex } from "../generate/qa/color.js";
import { MAX_FLOATING_PER_PAGE, canvasTypeRamp, clipText, contentTitleSize, fitTextSize, isContentPage, isTitleSlot, snapCanvas, snapCanvasReport } from "./snap.js";
import { CANVAS_SYSTEM_IDS, VISUAL_SYSTEM_IDS } from "./ids.js";
import { reflectCanvas } from "./reflect-canvas.js";
import { applyColorTheme } from "./apply-theme.js";
import type { FilledSlide } from "./ir.js";
import { CANVAS_ICON_IDS } from "./vocab.js";
import { absolutizeLeadingMove, iconPathShape } from "./icons.js";

const PHOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("canvas IR — photo field, native chart, brand accent", () => {
  it("emits image background, overlay, chart, and table without empty PNG frames", () => {
    const system = resolveVisualSystem("editorial");
    const theme = seedColorTheme("editorial", "ink", "#E11D48");
    const slides: FilledSlide[] = [
      {
        layout: "cover",
        variant: "canvas",
        background: { kind: "image", src: PHOTO, overlay: 0.5, overlayRole: "ink" },
        elements: [
          {
            slot: "title",
            kind: "text",
            name: "slot:title",
            bbox: { x: 64, y: 200, w: 700, h: 120 },
            paintRole: "bg",
            text: "Brand night",
            fontSize: 64,
          },
        ],
      },
      {
        layout: "data",
        variant: "canvas",
        elements: [
          {
            slot: "title",
            kind: "text",
            name: "slot:title",
            bbox: { x: 64, y: 48, w: 400, h: 40 },
            paintRole: "ink",
            text: "Hold mix",
            fontSize: 36,
          },
          {
            slot: "chart",
            kind: "chart",
            name: "slot:chart",
            bbox: { x: 64, y: 120, w: 520, h: 520 },
            paintRole: "accent",
            chart: {
              type: "column",
              categories: ["Q1", "Q2", "Q3"],
              series: [{ name: "Share", values: [12, 18, 9] }],
            },
          },
          {
            slot: "table",
            kind: "table",
            name: "slot:table",
            bbox: { x: 620, y: 120, w: 560, h: 400 },
            paintRole: "surface",
            table: {
              headers: ["Region", "Hold"],
              rows: [
                ["APAC", "41%"],
                ["EU", "33%"],
              ],
            },
          },
        ],
      },
    ];
    const snapped = snapCanvas(slides, system);
    const painted = applyColorTheme(snapped, theme);
    const reflect = reflectCanvas(painted, system, theme);
    assert.equal(reflect.passed, true, reflect.findings.map((f) => f.issue).join("; "));
    const result = compileCanvasDeck({ system, theme, slides, title: "Brand night" });
    const cover = result.presentation.slides[0]!;
    assert.equal(cover.background?.kind, "image");
    if (cover.background?.kind === "image") assert.equal(cover.background.src, PHOTO);
    assert.equal(cover.showMasterSp, false);
    assert.ok(cover.layoutRef?.layoutId.endsWith("__cover"));
    assert.ok(cover.layers[0]!.shapes.some((s) => s.name === "BG overlay"));
    assert.equal(theme.palette?.accent, "#E11D48");
    const data = result.presentation.slides[1]!;
    assert.ok(!data.background, "solid pages inherit master.background");
    assert.ok(data.layoutRef?.layoutId.endsWith("__data"));
    assert.ok(data.showMasterSp !== false);
    const master = result.presentation.masters?.[0];
    assert.ok(master);
    assert.equal(master.background?.kind, "solid");
    assert.ok(master.layouts?.some((l) => l.id.endsWith("__data")));
    assert.ok(master.layouts?.some((l) => l.type === "blank"));
    assert.ok(!master.shapes.some((s) => s.id.startsWith("dec_")));
    assert.ok(data.layers[0]!.shapes.some((s) => s.kind === "chart"));
    assert.ok(data.layers[0]!.shapes.some((s) => s.kind === "group" && s.tableMeta));
    assert.ok(!JSON.stringify(result.presentation).includes("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==") || cover.background?.kind === "image");
  });

  it("drops image elements without a real src", () => {
    const system = resolveVisualSystem("swiss");
    const theme = seedColorTheme("swiss", "ikb");
    const snapped = snapCanvas(
      [
        {
          layout: "figure",
          variant: "canvas",
          elements: [
            {
              slot: "title",
              kind: "text",
              name: "slot:title",
              bbox: { x: 80, y: 80, w: 400, h: 48 },
              paintRole: "ink",
              text: "No fake frame",
              fontSize: 32,
            },
            {
              slot: "photo",
              kind: "image",
              name: "slot:photo",
              bbox: { x: 600, y: 80, w: 500, h: 500 },
              paintRole: "surface",
              src: "placeholder.png",
            },
          ],
        },
      ],
      system,
    );
    assert.equal(snapped[0]!.elements.some((e) => e.kind === "image"), false);
  });
});

/** Absolute extent of an SVG path (enough of the grammar for lucide + our rewrites). */
function pathExtent(d: string): { minX: number; minY: number; maxX: number; maxY: number } {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const arity: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
  let cmd = "";
  let x = 0, y = 0, sx = 0, sy = 0;
  const ext = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const nums: number[] = [];
  const flush = (): void => {
    const lo = cmd.toLowerCase();
    const abs = cmd !== lo;
    const ar = arity[lo] ?? 2;
    if (lo === "z") { x = sx; y = sy; nums.length = 0; return; }
    while (ar > 0 && nums.length >= ar) {
      const a = nums.splice(0, ar);
      if (lo === "h") x = abs ? a[0]! : x + a[0]!;
      else if (lo === "v") y = abs ? a[0]! : y + a[0]!;
      else { x = abs ? a[ar - 2]! : x + a[ar - 2]!; y = abs ? a[ar - 1]! : y + a[ar - 1]!; }
      if (lo === "m") { sx = x; sy = y; cmd = abs ? "L" : "l"; }
      ext.minX = Math.min(ext.minX, x); ext.minY = Math.min(ext.minY, y);
      ext.maxX = Math.max(ext.maxX, x); ext.maxY = Math.max(ext.maxY, y);
    }
  };
  for (const t of toks) {
    if (/[a-zA-Z]/.test(t)) { flush(); cmd = t; if (t.toLowerCase() === "z") flush(); }
    else nums.push(Number(t));
  }
  flush();
  return ext;
}

describe("canvas IR — P0 vocabulary (shape · icon · diagram · device · runs · scrim)", () => {
  const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

  it("every whitelisted icon stays inside its bbox (leading relative `m` is absolute per SVG)", () => {
    // Regression: lucide children like `m9 12 2 2 4-4` were concatenated and scaled as
    // deltas, so the first point landed near the slide origin → stray hairlines from the
    // top-left corner to each icon on the page.
    const bbox = box(600, 300, 40, 40);
    const tol = 1;
    for (const id of CANVAS_ICON_IDS) {
      const sh = iconPathShape(id, bbox, { id: "sp_i", name: "icon", color: "#000" });
      assert.ok(sh, `unknown icon ${id}`);
      const e = pathExtent(sh!.d);
      assert.ok(
        e.minX >= bbox.x - tol && e.minY >= bbox.y - tol && e.maxX <= bbox.x + bbox.w + tol && e.maxY <= bbox.y + bbox.h + tol,
        `icon ${id} escapes bbox: ${JSON.stringify(e)} d=${sh!.d}`,
      );
    }
    // The rewrite must keep the implicit follow-up pairs relative.
    assert.equal(absolutizeLeadingMove("m9 12 2 2 4-4"), "M9 12l2 2 4-4");
    assert.equal(absolutizeLeadingMove("m14 12 4 4 4-4 M18 16V7"), "M14 12l4 4 4-4 M18 16V7");
    assert.equal(absolutizeLeadingMove("m2 16a1 1 0 0 1 2 0"), "M2 16a1 1 0 0 1 2 0");
    assert.equal(absolutizeLeadingMove("M3 3h18"), "M3 3h18");
  });

  it("clamps a box by its far edge, so a bleeding sidebar shape does not slide into the title column", () => {
    const system = resolveVisualSystem("soft-rounded");
    const mx = 1280 * system.grid.margin;
    const slides: FilledSlide[] = [
      {
        layout: "evidence",
        variant: "canvas",
        elements: [
          { slot: "side", kind: "shape", name: "s", bbox: box(-18, -18, 222, 756), paintRole: "accent", preset: "roundRect" },
          { slot: "bar", kind: "bar", name: "b", bbox: box(-18, 0, 222, 720), paintRole: "accent" },
          { slot: "gone", kind: "shape", name: "g", bbox: box(-200, 200, 50, 40), paintRole: "accent", preset: "roundRect" },
          { slot: "title", kind: "text", name: "t", bbox: box(264, 52, 700, 54), paintRole: "ink", text: "今天讲什么", fontSize: 40 },
        ],
      },
    ];
    const els = snapCanvasReport(slides, system).slides[0]!.elements;
    const side = els.find((e) => e.slot === "side")!;
    assert.equal(side.bbox.x, mx);
    assert.equal(side.bbox.x + side.bbox.w, 204, "right edge stays where the author put it");
    const bar = els.find((e) => e.slot === "bar")!;
    assert.deepEqual([bar.bbox.x, bar.bbox.x + bar.bbox.w], [0, 204], "bleed kinds clamp to the page edge, same rule");
    const gone = els.find((e) => e.slot === "gone")!;
    assert.deepEqual([gone.bbox.x, gone.bbox.w], [mx, 50], "a box wholly outside keeps its size at the near edge");
  });

  it("steps a wrapped display sentence down the ramp until it fits its box; single lines and body copy are left alone", () => {
    const system = resolveVisualSystem("soft-rounded");
    const ramp = canvasTypeRamp(system);
    // 30 Latin chars at 84px in 700×220: three lines, 290px tall → 64px sets it on two lines.
    const fitted = fitTextSize("Masters and layouts come along", 84, { w: 700, h: 220 }, ramp, undefined, system);
    assert.ok(fitted < 84 && fitted >= system.typeScale.h2, `fitted=${fitted}`);
    assert.ok(Math.ceil((30 * 0.58 * fitted) / (700 - 19.2)) * fitted * 1.15 <= 220 * 1.1, "two lines fit the box");
    assert.equal(fitTextSize("SlimPPT", 84, { w: 700, h: 84 }, ramp, undefined, system), 84, "a one-line title in a font-size-tall box is fine");
    assert.equal(fitTextSize("a long paragraph ".repeat(8), 18, { w: 300, h: 20 }, ramp, undefined, system), 18, "body copy is not resized");
    // Through snap: the same element on a statement page.
    const slides: FilledSlide[] = [
      {
        layout: "statement",
        variant: "canvas",
        elements: [{ slot: "display", kind: "text", name: "t", bbox: box(64, 318, 700, 220), paintRole: "ink", text: "Masters and layouts come along", fontSize: 84 }],
      },
    ];
    const el = snapCanvasReport(slides, system, { briefs: [{ relationships: "none", rhythm: "anchor", composition: "statement" }] }).slides[0]!.elements[0]!;
    assert.equal(el.fontSize, fitted);
  });

  it("lifts an eyebrow drawn 4px above its title so leading and descenders do not land on the cap line", () => {
    const system = resolveVisualSystem("soft-rounded");
    const slides: FilledSlide[] = [
      {
        layout: "evidence",
        variant: "canvas",
        elements: [
          { slot: "eyebrow", kind: "text", name: "e", bbox: box(64, 36, 420, 20), paintRole: "muted", text: "Coverage", fontSize: 13 },
          { slot: "title", kind: "text", name: "t", bbox: box(64, 60, 880, 56), paintRole: "ink", text: "A few numbers", fontSize: 40 },
          { slot: "aside", kind: "text", name: "a", bbox: box(1000, 40, 200, 20), paintRole: "muted", text: "Current release", fontSize: 13 },
          { slot: "body", kind: "text", name: "b", bbox: box(64, 160, 880, 40), paintRole: "ink", text: "Counts from the current build.", fontSize: 18 },
        ],
      },
    ];
    const els = snapCanvasReport(slides, system).slides[0]!.elements;
    const eyebrow = els.find((e) => e.slot === "eyebrow")!;
    const title = els.find((e) => e.slot === "title")!;
    // The eyebrow already sits on the top margin, so the title gives the few px instead.
    assert.equal(eyebrow.bbox.y, 36);
    assert.ok(title.bbox.y > 60 && title.bbox.y <= 68, `title y=${title.bbox.y}`);
    assert.ok(title.bbox.y - (eyebrow.bbox.y + eyebrow.bbox.h) >= 6, `gap ${title.bbox.y - (eyebrow.bbox.y + eyebrow.bbox.h)}`);
    // With room above, the smaller box is the one that moves.
    const roomy = snapCanvasReport(
      [{ ...slides[0]!, elements: slides[0]!.elements.map((e) => (e.slot === "eyebrow" ? { ...e, bbox: box(64, 76, 420, 20) } : e.slot === "title" ? { ...e, bbox: box(64, 100, 880, 56) } : e)) }],
      system,
    ).slides[0]!.elements;
    assert.equal(roomy.find((e) => e.slot === "title")!.bbox.y, 100);
    assert.ok(roomy.find((e) => e.slot === "eyebrow")!.bbox.y < 76);
    assert.equal(els.find((e) => e.slot === "aside")!.bbox.y, 40, "text in another column is untouched");
    assert.equal(els.find((e) => e.slot === "body")!.bbox.y, 160, "already-spaced text is untouched");
  });

  it("a diagram drawn on a card grows only inside the card", () => {
    const system = resolveVisualSystem("soft-rounded");
    const slides: FilledSlide[] = [
      {
        layout: "evidence",
        variant: "canvas",
        elements: [
          { slot: "title", kind: "text", name: "t", bbox: box(64, 318, 700, 90), paintRole: "ink", text: "Masters and layouts", fontSize: 64 },
          { slot: "card", kind: "surface", name: "c", bbox: box(800, 300, 416, 280), paintRole: "surface" },
          {
            slot: "dg",
            kind: "diagram",
            name: "d",
            bbox: box(824, 336, 368, 208),
            paintRole: "accent",
            diagram: { layout: "hierarchy", items: [{ title: "Master" }, { title: "Layout" }, { title: "Slide" }] },
          },
        ],
      },
    ];
    const dg = snapCanvasReport(slides, system).slides[0]!.elements.find((e) => e.kind === "diagram")!;
    assert.ok(dg.bbox.y >= 300 + 36 - 1 && dg.bbox.y + dg.bbox.h <= 580 - 36 + 1, `diagram ${JSON.stringify(dg.bbox)} stays inside the card`);
  });

  it("emits presets as prstGeom paths, icons as stroke paths, diagrams as SmartArt groups", () => {
    const system = resolveVisualSystem("soft-rounded");
    const theme = seedColorTheme("soft-rounded");
    assert.equal(theme.id, "custom");
    const slides: FilledSlide[] = [
      {
        layout: "evidence",
        variant: "canvas",
        elements: [
          { slot: "title", kind: "text", name: "t", bbox: box(64, 48, 800, 48), paintRole: "ink", text: "Three moves", fontSize: 34 },
          { slot: "chev", kind: "shape", name: "s", bbox: box(64, 140, 220, 80), paintRole: "accent", preset: "chevron", text: "Plan" },
          { slot: "bad", kind: "shape", name: "s2", bbox: box(300, 140, 220, 80), paintRole: "accent", preset: "notAPreset" },
          { slot: "ico", kind: "icon", name: "i", bbox: box(64, 260, 40, 40), paintRole: "accent", icon: "rocket" },
          { slot: "ico-bad", kind: "icon", name: "i2", bbox: box(120, 260, 40, 40), paintRole: "accent", icon: "definitely-not-an-icon" },
          {
            slot: "dg",
            kind: "diagram",
            name: "d",
            bbox: box(64, 320, 1100, 320),
            paintRole: "accent",
            diagram: { layout: "process", items: [{ title: "Discover" }, { title: "Design", body: "two weeks" }, { title: "Deliver" }] },
          },
        ],
      },
    ];
    const snapped = snapCanvasReport(slides, system);
    assert.equal(snapped.drops.length, 2, JSON.stringify(snapped.drops));
    assert.match(snapped.drops[0]!.reason, /notAPreset/);
    assert.match(snapped.drops[1]!.reason, /definitely-not-an-icon/);
    const result = compileCanvasDeck({ system, theme, slides, title: "Vocab" });
    const shapes = result.presentation.slides[0]!.layers[0]!.shapes;
    const chevron = shapes.find((s) => s.kind === "path" && s.presetType === "chevron");
    assert.ok(chevron, "chevron preset should land as PathShape with presetType");
    assert.ok(shapes.some((s) => s.kind === "text" && s.name.endsWith(":label")), "preset label text");
    const icon = shapes.find((s) => s.kind === "path" && s.name === "i");
    assert.ok(icon && icon.kind === "path" && icon.stroke && !icon.fill, "icon is a stroke-only path");
    assert.equal(icon!.bbox.w, icon!.bbox.h);
    const smart = shapes.find((s) => s.kind === "group" && s.smartArtMeta?.layout === "process");
    assert.ok(smart && smart.kind === "group" && smart.children.length >= 3, "diagram → SmartArt group");
    const pal = theme.palette!;
    const fills = (smart!.kind === "group" ? smart!.children : [])
      .map((c) => (c.fill?.kind === "solid" ? c.fill.color : undefined))
      .filter(Boolean);
    assert.ok(fills.length > 0);
    for (const f of fills) assert.ok([pal.accent, pal.accentSoft].includes(f!), `diagram fill ${f} recolored to palette`);
    assert.ok(!result.presentation.slides[0]!.layers[0]!.shapes.some((s) => s.id.startsWith("dec_")));
  });

  it("expands devices into primitives inside their bbox and caps floating objects", () => {
    const system = resolveVisualSystem("dark-tech");
    const theme = seedColorTheme("dark-tech");
    const slides: FilledSlide[] = [
      {
        layout: "data",
        variant: "canvas",
        elements: [
          { slot: "title", kind: "text", name: "t", bbox: box(64, 48, 800, 48), paintRole: "ink", text: "Numbers first", fontSize: 34 },
          {
            slot: "kpi",
            kind: "device",
            name: "k",
            bbox: box(64, 130, 1152, 200),
            paintRole: "accent",
            device: {
              type: "kpiRow",
              items: [
                { value: "41%", title: "Hold rate", note: "+6 pts QoQ" },
                { value: "3.2x", title: "Payback" },
                { value: "18", title: "Markets" },
              ],
            },
          },
          {
            slot: "steps",
            kind: "device",
            name: "s",
            bbox: box(64, 370, 1152, 200),
            paintRole: "accent",
            device: { type: "stepStrip", items: [{ title: "Pilot" }, { title: "Scale", body: "3 regions" }, { title: "Default on" }] },
          },
          { slot: "band", kind: "device", name: "b", bbox: box(64, 600, 1152, 64), paintRole: "accent", device: { type: "takeawayBand", text: "Ship the default in Q3" } },
          { slot: "nope", kind: "device", name: "n", bbox: box(64, 600, 100, 40), paintRole: "accent", device: { type: "kpiRow" } },
        ],
      },
    ];
    const snapped = snapCanvasReport(slides, system);
    assert.equal(snapped.drops.length, 1);
    assert.match(snapped.drops[0]!.reason, /device missing its data/);
    const els = snapped.slides[0]!.elements;
    assert.ok(!els.some((e) => e.kind === "device"), "no raw device survives snap");
    assert.ok(els.filter((e) => e.slot.startsWith("kpi.kpi")).length >= 8, "kpi cards + values + labels");
    assert.ok(els.some((e) => e.slot === "steps.line" && e.kind === "line" && e.arrow === "end"));
    assert.ok(els.filter((e) => e.slot.startsWith("steps.step") && e.kind === "ellipse").length === 3);
    assert.ok(els.some((e) => e.slot === "band.band" && e.kind === "bar"));
    assert.ok(els.some((e) => e.slot === "band.icon" && e.kind === "icon" && e.icon === "arrow-right"));
    for (const e of els) {
      const within = e.bbox.x >= 64 - 0.5 && e.bbox.x + e.bbox.w <= 1216 + 0.5;
      assert.ok(within, `${e.slot} inside device bbox`);
    }
    assert.ok(els.filter((e) => e.shadow || e.glow).length <= MAX_FLOATING_PER_PAGE, "≤ 2 floating objects");
    const result = compileCanvasDeck({ system, theme, slides, title: "Devices" });
    assert.equal(result.reflect.findings.filter((f) => !/dropped nope/.test(f.issue)).length, 0, result.reflect.findings.map((f) => f.issue).join("; "));
    const shapes = result.presentation.slides[0]!.layers[0]!.shapes;
    assert.ok(shapes.some((s) => s.kind === "line" && s.stroke?.tailEnd), "step connector exports an arrow head");
    assert.ok(shapes.some((s) => s.kind === "text" && s.effects?.some((fx) => fx.kind === "glow")), "dark-tech KPI value glows");
  });

  it("emits text runs with accent / bold / mono emphasis and a directional scrim on photo pages", () => {
    const system = resolveVisualSystem("photo-editorial");
    const theme = seedColorTheme("photo-editorial");
    const slides: FilledSlide[] = [
      {
        layout: "cover",
        variant: "canvas",
        background: { kind: "image", src: PHOTO, overlay: 0.5 },
        elements: [
          {
            slot: "title",
            kind: "text",
            name: "t",
            bbox: box(64, 380, 620, 200),
            paintRole: "ink",
            fontSize: 72,
            runs: [{ text: "Grow " }, { text: "3×", emphasis: "accent" }, { text: " faster" }, { text: " v2", emphasis: "mono" }, { text: " now", emphasis: "bold" }],
          },
        ],
      },
      {
        layout: "claim",
        variant: "canvas",
        background: { kind: "image", src: PHOTO, scrim: { direction: "right", strength: 0.8 } },
        elements: [{ slot: "claim", kind: "text", name: "c", bbox: box(700, 300, 500, 120), paintRole: "ink", text: "Right side", fontSize: 56 }],
      },
    ];
    const snapped = snapCanvas(slides, system);
    assert.equal(snapped[0]!.background?.scrim?.direction, "left", "derived from type on the left");
    assert.equal(snapped[0]!.background?.scrim?.floor, undefined, "all type on the dark side → clear far side");
    assert.equal(snapped[1]!.background?.scrim?.direction, "right");
    assert.equal(snapped[1]!.background?.scrim?.strength, 0.8);
    // A kicker in the far corner of a bottom-scrimmed close page keeps a veil under it.
    const closePage: FilledSlide = {
      layout: "close",
      variant: "canvas",
      background: { kind: "image", src: PHOTO, scrim: { direction: "bottom", strength: 0.8 } },
      elements: [
        { slot: "kicker", kind: "text", name: "k", bbox: box(100, 36, 300, 16), paintRole: "accent", text: "SLIMPPT", fontSize: 12 },
        { slot: "title", kind: "text", name: "t", bbox: box(100, 440, 900, 90), paintRole: "ink", text: "Open it and present.", fontSize: 64 },
      ],
    };
    const floored = snapCanvas([closePage], system)[0]!.background?.scrim;
    assert.equal(floored?.direction, "bottom");
    assert.equal(floored?.floor, 0.28);
    const closeShapes = compileCanvasDeck({ system, theme, slides: [closePage], title: "x" }).presentation.slides[0]!.layers[0]!.shapes;
    const veil = closeShapes.find((s) => s.name === "BG overlay")!.fill!;
    assert.equal(veil.kind === "linear" ? veil.stops.at(-1)!.alpha : -1, 0.28, "clear end keeps the floor");
    // No authored scrim: it is derived from where the ink is, not the box. Left-aligned copy in
    // full-width boxes gets a left scrim, not a radial one under the photo's subject.
    const leftCopy: FilledSlide = {
      layout: "quote",
      variant: "canvas",
      background: { kind: "image", src: PHOTO, overlay: 0.48 },
      elements: [
        { slot: "title", kind: "text", name: "t", bbox: box(64, 190, 1100, 96), paintRole: "ink", text: "密钥只留在这台浏览器", fontSize: 60 },
        { slot: "lead", kind: "text", name: "l", bbox: box(64, 318, 900, 28), paintRole: "ink", text: "BYOK：Key 由使用者自备。", fontSize: 18 },
        { slot: "quote", kind: "text", name: "q", bbox: box(120, 400, 700, 80), paintRole: "ink", text: "请求直连 OpenAI / Anthropic / Google，密钥与草稿都不离开这台浏览器。", fontSize: 26 },
      ],
    };
    const derived = snapCanvas([leftCopy], system)[0]!.background!;
    assert.equal(derived.kind === "image" ? derived.scrim?.direction : "", "left");
    // On a dark-paper system the scrim is the dark token, so light copy reads on it.
    const darkSys = resolveVisualSystem("dark-tech");
    const darkBg = snapCanvas([leftCopy], darkSys)[0]!.background!;
    assert.equal(darkBg.kind === "image" ? darkBg.overlayRole : "", "bg");
    const runs = snapped[0]!.elements[0]!.runs!;
    assert.equal(runs.filter((r) => r.emphasis).length, 2, "≤ 2 emphasised spans survive");
    assert.equal(snapped[0]!.elements[0]!.text, "Grow 3× faster v2 now");
    const painted = applyColorTheme(snapped, theme);
    assert.equal(reflectCanvas(painted, system, theme).passed, true);
    const result = compileCanvasDeck({ system, theme, slides, title: "Runs" });
    const cover = result.presentation.slides[0]!.layers[0]!.shapes;
    const scrim = cover.find((s) => s.name === "BG overlay");
    assert.ok(scrim && scrim.fill?.kind === "linear" && scrim.fill.angle === 0, "left scrim → linear angle 0");
    assert.equal(scrim!.fill!.kind === "linear" ? scrim!.fill!.stops[0]!.alpha! > scrim!.fill!.stops[2]!.alpha! : false, true);
    const title = cover.find((s) => s.kind === "text" && s.name === "t");
    assert.ok(title && title.kind === "text");
    const tr = title!.kind === "text" ? title!.paragraphs[0]!.runs : [];
    assert.equal(tr.length, 5);
    assert.equal(tr[1]!.color, theme.palette!.accent);
    assert.match(String(tr[3]!.fontFamily), /Mono/);
    assert.equal(tr[4]!.fontWeight, 700);
  });

  it("accepts an agendaList as the carrier for relationships=order on the agenda page", () => {
    const system = resolveVisualSystem("editorial");
    const theme = seedColorTheme("editorial", "ink");
    const agenda: FilledSlide = {
      layout: "agenda",
      variant: "canvas",
      elements: [
        { slot: "title", kind: "text", name: "t", bbox: box(64, 48, 800, 48), paintRole: "ink", text: "Contents", fontSize: 36 },
        { slot: "toc", kind: "device", name: "d", bbox: box(64, 140, 1152, 400), paintRole: "accent", device: { type: "agendaList", items: [{ title: "One", target: 3 }, { title: "Two", target: 4 }, { title: "Three", target: 5 }] } },
      ],
    };
    const r = compileCanvasDeck({ system, theme, slides: [agenda], title: "x", briefs: [{ relationships: "order", rhythm: "dense" }] });
    assert.equal(r.reflect.findings.filter((f) => /relationships=order/.test(f.issue)).length, 0, r.reflect.findings.map((f) => f.issue).join("; "));
  });

  it("keeps a long agenda title off the body line under it", () => {
    const system = resolveVisualSystem("swiss");
    const theme = seedColorTheme("swiss", "ikb");
    const rows = ["Four numbers that are not marketing", "Not another slide website", "One pipeline, no forks", "Editing is not gated by plan", "Export is still standard PPTX", "The master is a real master"];
    const agenda: FilledSlide = {
      layout: "agenda",
      variant: "canvas",
      elements: [
        { slot: "title", kind: "text", name: "t", bbox: box(260, 60, 700, 48), paintRole: "ink", text: "Contents", fontSize: 36 },
        { slot: "toc", kind: "device", name: "d", bbox: box(260, 200, 720, 300), paintRole: "accent", device: { type: "agendaList", items: rows.map((title, i) => ({ title, body: "Shipped counts of one build, not projections.", target: i + 3 })) } },
      ],
    };
    const r = compileCanvasDeck({ system, theme, slides: [agenda], title: "x" });
    const els = r.painted[0]!.elements;
    const rowH = 300 / 3;
    for (let i = 0; i < rows.length; i++) {
      const title = els.find((e) => e.slot === `toc.row${i}.title`)!;
      const body = els.find((e) => e.slot === `toc.row${i}.body`)!;
      const rowBottom = 200 + ((i % 3) + 1) * rowH;
      const bodyUnits = [...body.text!].reduce((acc, ch) => acc + (/[\u2e80-\u9fff]/.test(ch) ? 1 : 0.58), 0);
      const bodyLines = Math.ceil((bodyUnits * body.fontSize!) / body.bbox.w);
      assert.ok(body.bbox.y + bodyLines * body.fontSize! * 1.5 <= rowBottom + 0.5, `row ${i} body (${bodyLines} lines) runs past the row at ${rowBottom}`);
      // Estimated line count at the emitted size must fit the emitted box, and the box must end above the body.
      const units = [...title.text!].reduce((acc, ch) => acc + (/[\u2e80-\u9fff]/.test(ch) ? 1 : 0.58), 0);
      const lines = Math.ceil((units * title.fontSize!) / title.bbox.w);
      assert.ok(lines * title.fontSize! * 1.35 <= title.bbox.h + 0.5, `row ${i} “${title.text}” needs ${lines} lines at ${title.fontSize}px in a ${title.bbox.h}px box`);
      assert.ok(title.bbox.y + title.bbox.h <= body.bbox.y + 0.5, `row ${i} title ends at ${title.bbox.y + title.bbox.h}, body starts at ${body.bbox.y}`);
      assert.ok(title.fontSize! >= Math.round(system.typeScale.h2 * 0.85), `row ${i} stayed near h2 (${title.fontSize})`);
      assert.doesNotMatch(title.text!, /…$/, `row ${i} was not clipped`);
    }
  });

  it("flags free text drawn over other free text, and bare-number tile titles", () => {
    const system = resolveVisualSystem("editorial");
    const theme = seedColorTheme("editorial", "ink");
    const collide: FilledSlide = {
      layout: "section",
      variant: "canvas",
      elements: [
        { slot: "title", kind: "text", name: "t", bbox: box(64, 48, 800, 48), paintRole: "ink", text: "The master is a real master", fontSize: 36 },
        { slot: "foot", kind: "text", name: "f", bbox: box(64, 650, 1000, 22), paintRole: "muted", text: "Masters, layouts, charts and tables all round-trip.", fontSize: 16 },
        { slot: "back", kind: "text", name: "b", bbox: box(64, 660, 160, 16), paintRole: "accent", text: "↩ contents", fontSize: 11, link: 2 },
      ],
    };
    const r = compileCanvasDeck({ system, theme, slides: [collide], title: "x" });
    assert.match(r.reflect.findings.map((f) => f.issue).join(";"), /overlaps text/);

    const metrics: FilledSlide = {
      layout: "data",
      variant: "canvas",
      elements: [
        { slot: "title", kind: "text", name: "t", bbox: box(64, 48, 800, 48), paintRole: "ink", text: "Four numbers", fontSize: 36 },
        { slot: "grid", kind: "device", name: "g", bbox: box(64, 140, 1152, 400), paintRole: "accent", device: { type: "iconLabelGrid", items: [{ title: "70+", body: "transitions" }, { title: "200+", body: "animations" }, { title: "90+", body: "tools" }, { title: "100+", body: "shapes" }] } },
      ],
    };
    // Snap carries numeric-led tiles as a kpiRow by construction (the model kept re-authoring the
    // grid when only the gate asked), so the compiled page has kpi values and no finding.
    const m = compileCanvasDeck({ system, theme, slides: [metrics], title: "x" });
    assert.equal(m.reflect.findings.filter((f) => /kpiRow/.test(f.issue)).length, 0, m.reflect.findings.map((f) => f.issue).join("; "));
    const values = m.painted[0]!.elements.filter((e) => /\.kpi\d\.value$/.test(e.slot)).map((e) => e.text);
    assert.deepEqual(values, ["70+", "200+", "90+", "100+"]);
    assert.equal(m.painted[0]!.elements.find((e) => e.slot === "grid.kpi0.label")?.text, "transitions");
    // "70+ transitions" splits into value + label; the body becomes the note.
    const split = compileCanvasDeck({
      system,
      theme,
      title: "x",
      slides: [{ ...metrics, elements: [metrics.elements[0]!, { ...metrics.elements[1]!, device: { type: "iconLabelGrid", items: [{ title: "70+ transitions", body: "3D and morph" }, { title: "90+ AI tools", body: "Ctrl+Z on every step" }, { title: "100+ shapes" }] } }] }],
    });
    const el = (slot: string) => split.painted[0]!.elements.find((e) => e.slot === `grid.${slot}`)?.text;
    assert.equal(el("kpi0.value"), "70+");
    assert.equal(el("kpi0.label"), "transitions");
    assert.equal(el("kpi0.note"), "3D and morph");
    // The gate still names the rule when a grid of numbers reaches it another way (bypassing snap).
    const bypass = reflectCanvas(
      applyColorTheme(
        [
          {
            layout: "data",
            variant: "canvas",
            elements: [
              metrics.elements[0]!,
              ...[0, 1, 2].map((i) => ({ slot: `grid.tile${i}.title`, kind: "text" as const, name: "n", bbox: box(64 + i * 380, 200, 340, 40), paintRole: "ink" as const, text: `${(i + 1) * 30}+`, fontSize: 24 })),
            ],
          },
        ],
        theme,
      ),
      system,
      theme,
    );
    assert.match(bypass.findings.map((f) => f.issue).join(";"), /kpiRow/);
    const asKpi: FilledSlide = {
      ...metrics,
      elements: [
        metrics.elements[0]!,
        { slot: "kpi", kind: "device", name: "k", bbox: box(64, 140, 1152, 200), paintRole: "accent", device: { type: "kpiRow", items: [{ value: "70+", title: "transitions" }, { value: "200+", title: "animations" }, { value: "90+", title: "tools" }, { value: "100+", title: "shapes" }] } },
      ],
    };
    const k = compileCanvasDeck({ system, theme, slides: [asKpi], title: "x" });
    assert.equal(k.reflect.findings.filter((f) => /kpiRow/.test(f.issue)).length, 0);
  });

  it("clips over-long device copy at a word boundary with an ellipsis and asks for a shorter phrase", () => {
    assert.equal(clipText("Cuts, wipes, pushes and 3D flips, authored in the editor", 48), "Cuts, wipes, pushes and 3D flips, authored in…");
    assert.equal(clipText("short", 48), "short");
    assert.equal(clipText("解析渲染编辑导出四步全部在同一个浏览器标签页里完成不需要任何桌面插件或额外安装", 20), "解析渲染编辑导出四步全部在同一个浏览器标…");
    const system = resolveVisualSystem("editorial");
    const theme = seedColorTheme("editorial", "ink");
    const slide: FilledSlide = {
      layout: "data",
      variant: "canvas",
      elements: [
        { slot: "title", kind: "text", name: "t", bbox: box(64, 48, 800, 48), paintRole: "ink", text: "Four numbers", fontSize: 36 },
        { slot: "kpi", kind: "device", name: "k", bbox: box(64, 140, 1152, 220), paintRole: "accent", device: { type: "kpiRow", items: [{ value: "70+", title: "transitions", note: "Cuts, wipes, pushes and 3D flips, authored in the editor" }, { value: "200+", title: "animations", note: "short" }] } },
      ],
    };
    const r = compileCanvasDeck({ system, theme, slides: [slide], title: "x" });
    const clipped = r.reflect.findings.filter((f) => /device text was clipped/.test(f.issue));
    assert.equal(clipped.length, 1, r.reflect.findings.map((f) => f.issue).join("; "));
    assert.match(clipped[0]!.issue, /authored in…/);

    // Geometry clip: a two-line note in a short kpi card ends inside the card (smaller type first,
    // then a word-boundary cut) instead of running under its bottom edge.
    const tight: FilledSlide = {
      layout: "data",
      variant: "canvas",
      elements: [
        { slot: "title", kind: "text", name: "t", bbox: box(64, 48, 800, 48), paintRole: "ink", text: "Four numbers", fontSize: 36 },
        {
          slot: "kpi",
          kind: "device",
          name: "k",
          bbox: box(64, 240, 1152, 140),
          paintRole: "accent",
          device: { type: "kpiRow", items: [1, 2, 3, 4].map((n) => ({ value: `${n}0+`, title: "transitions", note: "3D, morph and film-style wipes shipped in the editor" })) },
        },
      ],
    };
    const t = compileCanvasDeck({ system, theme, slides: [tight], title: "x" });
    const note = t.painted[0]!.elements.find((e) => e.slot === "kpi.kpi0.note")!;
    assert.ok(note.bbox.y + note.bbox.h <= 240 + 140 + 0.5, `note ends at ${note.bbox.y + note.bbox.h}, device box at ${240 + 140}`);
    assert.ok((note.fontSize ?? 99) < system.typeScale.body || /…$/.test(note.text ?? ""), `note ${note.fontSize}px “${note.text}” was made to fit`);
  });

  it("keeps diagram hub text readable on the accent fill and sizes title/body to the node", () => {
    const system = resolveVisualSystem("dark-tech");
    const theme = seedColorTheme("dark-tech", "ink");
    const pal = paletteOf(theme);
    const slide: FilledSlide = {
      layout: "sequence",
      variant: "canvas",
      elements: [
        { slot: "title", kind: "text", name: "t", bbox: box(64, 48, 800, 48), paintRole: "ink", text: "One pipeline", fontSize: 36 },
        { slot: "flow", kind: "diagram", name: "d", bbox: box(64, 200, 1152, 400), paintRole: "accent", diagram: { layout: "radial", items: [{ title: "IR", body: "One model" }, { title: "Parse", body: "Read .pptx" }, { title: "Render", body: "SVG" }, { title: "Export", body: "OOXML" }] } },
      ],
    };
    const r = compileCanvasDeck({ system, theme, slides: [slide], title: "x" });
    const group = r.presentation.slides[0]!.layers[0]!.shapes.find((s) => s.kind === "group" && s.smartArtMeta);
    assert.ok(group && group.kind === "group");
    const texts = group!.kind === "group" ? group!.children.filter((c) => c.kind === "text") : [];
    assert.ok(texts.length >= 3);
    const hub = texts[0]!;
    const rest = texts[1]!;
    assert.ok(hub.kind === "text" && rest.kind === "text");
    const hubColor = hub.kind === "text" ? hub.paragraphs[0]!.runs[0]!.color : undefined;
    const hubFill = parseHex(pal.accent)!;
    assert.ok(contrastRatio(parseHex(hubColor!)!, hubFill) >= 3, `hub text ${hubColor} on accent ${pal.accent} must read`);
    assert.equal(rest.kind === "text" ? rest.paragraphs[0]!.runs[0]!.color : "", pal.ink);
    // title paragraph heavier and larger than the body paragraph
    const [tp, bp] = rest.kind === "text" ? rest.paragraphs : [];
    assert.equal(tp!.runs[0]!.fontWeight, 600);
    assert.ok((tp!.runs[0]!.fontSize ?? 0) > (bp!.runs[0]!.fontSize ?? 0));
  });

  it("stretches a shallow lone diagram / chart to the free band between its neighbours, never over them", () => {
    const system = resolveVisualSystem("editorial");
    const g = system.grid.gutter;
    const shallow: FilledSlide = {
      layout: "sequence",
      variant: "canvas",
      elements: [
        { slot: "title", kind: "text", name: "t", bbox: box(64, 96, 800, 52), paintRole: "ink", text: "One pipeline", fontSize: 40 },
        { slot: "under", kind: "rule", name: "r", bbox: box(64, 200, 1152, 1), paintRole: "line" },
        { slot: "flow", kind: "diagram", name: "d", bbox: box(64, 252, 1152, 220), paintRole: "accent", diagram: { layout: "process", items: [{ title: "Parse" }, { title: "Render" }, { title: "Export" }] } },
        { slot: "note", kind: "text", name: "n", bbox: box(64, 612, 900, 24), paintRole: "muted", text: "Same IR end to end.", fontSize: 14 },
      ],
    };
    const out = snapCanvasReport([shallow], system).slides[0]!;
    const d = out.elements.find((e) => e.kind === "diagram")!;
    const rule = out.elements.find((e) => e.slot === "under")!;
    const note = out.elements.find((e) => e.slot === "note")!;
    assert.equal(d.bbox.y, Math.round(rule.bbox.y + rule.bbox.h + g));
    assert.equal(d.bbox.y + d.bbox.h, Math.round(note.bbox.y - g));
    assert.ok(d.bbox.h > 300, `grew to the band (${d.bbox.h})`);
    // A carrier that already fills its band, or shares the page with a second carrier, is left alone.
    const tight: FilledSlide = { ...shallow, elements: shallow.elements.map((e) => (e.kind === "diagram" ? { ...e, bbox: box(64, 218, 1152, 376) } : e)) };
    assert.equal(snapCanvasReport([tight], system).slides[0]!.elements.find((e) => e.kind === "diagram")!.bbox.h, 376);
    const two: FilledSlide = { ...shallow, elements: [...shallow.elements, { slot: "trend", kind: "chart", name: "c", bbox: box(64, 500, 500, 90), paintRole: "accent", chart: { type: "bar", categories: ["a", "b"], series: [{ name: "s", values: [1, 2] }] } }] };
    assert.equal(snapCanvasReport([two], system).slides[0]!.elements.find((e) => e.kind === "diagram")!.bbox.h, 220);
  });

  it("paints every node of a sequential diagram alike — an accent first step read as 'current step'", () => {
    const system = resolveVisualSystem("dark-tech");
    const theme = seedColorTheme("dark-tech", "ink");
    const pal = paletteOf(theme);
    const slide: FilledSlide = {
      layout: "sequence",
      variant: "canvas",
      elements: [
        { slot: "title", kind: "text", name: "t", bbox: box(64, 48, 800, 48), paintRole: "ink", text: "One pipeline", fontSize: 36 },
        { slot: "flow", kind: "diagram", name: "d", bbox: box(64, 240, 1152, 170), paintRole: "accent", diagram: { layout: "process", items: [{ title: "Parse", body: "Read .pptx" }, { title: "Render", body: "SVG" }, { title: "Export", body: "OOXML" }] } },
      ],
    };
    const r = compileCanvasDeck({ system, theme, slides: [slide], title: "x" });
    const group = r.presentation.slides[0]!.layers[0]!.shapes.find((s) => s.kind === "group" && s.smartArtMeta);
    assert.ok(group && group.kind === "group");
    const fills = group!.kind === "group" ? group!.children.filter((c) => c.kind === "rect" && c.fill?.kind === "solid").map((c) => (c.kind === "rect" && c.fill?.kind === "solid" ? c.fill.color : "")) : [];
    assert.ok(fills.length >= 3);
    assert.ok(fills.every((f) => f === pal.accentSoft), `all nodes accentSoft, got ${fills.join(",")}`);
    const texts = group!.kind === "group" ? group!.children.filter((c) => c.kind === "text") : [];
    for (const t of texts) if (t.kind === "text") assert.equal(t.paragraphs[0]!.runs[0]!.color, pal.ink);
  });

  it("asks for geometry when the brief says relationships≠none and the page is type only", () => {
    const system = resolveVisualSystem("editorial");
    const theme = seedColorTheme("editorial", "ink");
    const typeOnly: FilledSlide = {
      layout: "sequence",
      variant: "canvas",
      elements: [
        { slot: "title", kind: "text", name: "t", bbox: box(64, 48, 800, 48), paintRole: "ink", text: "Three steps", fontSize: 36 },
        { slot: "body", kind: "text", name: "b", bbox: box(64, 120, 800, 300), paintRole: "ink", text: "First. Then. Finally.", fontSize: 17 },
      ],
    };
    const failing = compileCanvasDeck({ system, theme, slides: [typeOnly], title: "x", briefs: [{ relationships: "order", rhythm: "dense" }] });
    assert.equal(failing.reflect.passed, false);
    assert.match(failing.reflect.findings[0]!.issue, /relationships=order/);
    assert.match(failing.reflect.findings[0]!.issue, /stepStrip/);
    const carried: FilledSlide = {
      ...typeOnly,
      elements: [
        typeOnly.elements[0]!,
        { slot: "steps", kind: "device", name: "s", bbox: box(64, 140, 1152, 240), paintRole: "accent", device: { type: "numberedList", items: [{ title: "First" }, { title: "Then" }, { title: "Finally" }] } },
      ],
    };
    const passing = compileCanvasDeck({ system, theme, slides: [carried], title: "x", briefs: [{ relationships: "order", rhythm: "dense" }] });
    assert.equal(passing.reflect.passed, true, passing.reflect.findings.map((f) => f.issue).join("; "));
    const anchor = compileCanvasDeck({ system, theme, slides: [typeOnly], title: "x", briefs: [{ relationships: "none", rhythm: "anchor" }] });
    assert.match(anchor.reflect.findings.map((f) => f.issue).join(";"), /anchor page/);
    // A multi-column table carries contrast (live false positive: a 3×6 传统 vs AI table was "type only").
    const tabled: FilledSlide = {
      ...typeOnly,
      elements: [
        typeOnly.elements[0]!,
        { slot: "cmp", kind: "table", name: "tb", bbox: box(64, 140, 1152, 400), paintRole: "surface", table: { headers: ["维度", "传统", "AI 原生"], rows: [["组织", "目录树", "向量索引"], ["使用", "关键词", "对话"]] } },
      ],
    };
    const viaTable = compileCanvasDeck({ system, theme, slides: [tabled], title: "x", briefs: [{ relationships: "contrast", rhythm: "dense", carrier: "table" }] });
    assert.equal(viaTable.reflect.findings.filter((f) => /relationships=contrast/.test(f.issue)).length, 0, viaTable.reflect.findings.map((f) => f.issue).join("; "));
  });
});

describe("canvas composition + readability gates", () => {
  const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
  const system = resolveVisualSystem("editorial");
  const theme = seedColorTheme("editorial", "ink");
  const headerStack = (i: number, extra: FilledSlide["elements"] = []): FilledSlide => ({
    layout: "evidence",
    variant: "canvas",
    elements: [
      { slot: "eyebrow", kind: "text", name: "e", bbox: box(64, 48, 400, 20), paintRole: "accent", text: `0${i}`, fontSize: 12 },
      { slot: "title", kind: "text", name: "t", bbox: box(64, 80, 900, 56), paintRole: "ink", text: `Title ${i}`, fontSize: 40 },
      { slot: "deck", kind: "text", name: "d", bbox: box(64, 150, 900, 30), paintRole: "muted", text: `Deck line ${i}`, fontSize: 17 },
      { slot: "body", kind: "text", name: "b", bbox: box(64, 240, 1100, 380), paintRole: "ink", text: `Body ${i}`, fontSize: 17 },
      ...extra,
    ],
  });

  it("flags three consecutive pages with the same header stack and names the composition to switch to", () => {
    const slides = [headerStack(1), headerStack(2), headerStack(3), headerStack(4)];
    const briefs = slides.map((_, i) => ({ relationships: "none" as const, rhythm: "dense" as const, composition: (i === 2 ? "split" : "header-stack") as "split" | "header-stack" }));
    const res = compileCanvasDeck({ system, theme, slides, title: "x", briefs });
    const run = res.reflect.findings.filter((f) => /same header stack/.test(f.issue));
    assert.equal(run.length, 1, res.reflect.findings.map((f) => f.issue).join("; "));
    assert.equal(run[0]!.slideIdx, 2);
    assert.match(run[0]!.issue, /composition=split/);
    // Page 2 was told "split" and delivered a header stack with everything on one side → composition finding too.
    assert.ok(res.reflect.findings.some((f) => f.slideIdx === 2 && /composition=split/.test(f.issue) && /one side/.test(f.issue)));
  });

  it("passes when the third page breaks the run (statement) and does not fire below three", () => {
    const statement: FilledSlide = {
      layout: "claim",
      variant: "canvas",
      elements: [{ slot: "statement", kind: "text", name: "s", bbox: box(120, 260, 1040, 200), paintRole: "ink", text: "One sentence.", fontSize: 64 }],
    };
    const slides = [headerStack(1), headerStack(2), statement, headerStack(4), headerStack(5)];
    const res = compileCanvasDeck({ system, theme, slides, title: "x" });
    assert.equal(res.reflect.findings.filter((f) => /same header stack/.test(f.issue)).length, 0, res.reflect.findings.map((f) => f.issue).join("; "));
    const checked = compileCanvasDeck({ system, theme, slides: [statement], title: "x", briefs: [{ relationships: "none", rhythm: "anchor", composition: "statement" }] });
    assert.ok(!checked.reflect.findings.some((f) => /composition=statement/.test(f.issue)));
  });

  it("split accepts a type column facing a carrier, and dense pages must fill the field", () => {
    const split: FilledSlide = {
      layout: "compare",
      variant: "canvas",
      elements: [
        { slot: "eyebrow", kind: "text", name: "e", bbox: box(64, 80, 380, 20), paintRole: "accent", text: "03", fontSize: 12 },
        { slot: "title", kind: "text", name: "t", bbox: box(64, 110, 380, 120), paintRole: "ink", text: "Two paradigms", fontSize: 36 },
        { slot: "lede", kind: "text", name: "l", bbox: box(64, 250, 380, 120), paintRole: "muted", text: "Static library vs. living graph.", fontSize: 17 },
        { slot: "planes", kind: "device", name: "d", bbox: box(520, 110, 696, 520), paintRole: "accent", device: { type: "comparePlanes", items: [{ title: "Static", body: "a" }, { title: "Living", body: "b" }] } },
      ],
    };
    const ok = compileCanvasDeck({ system, theme, slides: [split], title: "x", briefs: [{ relationships: "contrast", rhythm: "dense", composition: "split" }] });
    assert.equal(ok.reflect.findings.filter((f) => /composition=split/.test(f.issue)).length, 0, ok.reflect.findings.map((f) => f.issue).join("; "));

    const thin: FilledSlide = {
      layout: "evidence",
      variant: "canvas",
      elements: [
        { slot: "title", kind: "text", name: "t", bbox: box(64, 60, 900, 56), paintRole: "ink", text: "Four layers", fontSize: 36 },
        { slot: "lede", kind: "text", name: "l", bbox: box(64, 130, 900, 40), paintRole: "muted", text: "Retrieval, generation, graph, governance.", fontSize: 17 },
        { slot: "note", kind: "device", name: "n", bbox: box(64, 300, 1152, 64), paintRole: "accent", device: { type: "calloutNote", items: [{ title: "Hallucination is the failure mode of the generation layer." }] } },
      ],
    };
    const under = compileCanvasDeck({ system, theme, slides: [thin], title: "x", briefs: [{ relationships: "none", rhythm: "dense", composition: "header-stack" }] });
    assert.ok(under.reflect.findings.some((f) => /covers only \d+% of the field/.test(f.issue)), under.reflect.findings.map((f) => f.issue).join("; "));
    // Same page as a breathing page is fine.
    const breathe = compileCanvasDeck({ system, theme, slides: [thin], title: "x", briefs: [{ relationships: "none", rhythm: "breathing", composition: "header-stack" }] });
    assert.equal(breathe.reflect.findings.filter((f) => /covers only/.test(f.issue)).length, 0);
  });

  it("keeps a tall narrow rule as a vertical divider instead of clamping it to a 1×4 dot", () => {
    const slide: FilledSlide = {
      layout: "compare",
      variant: "canvas",
      elements: [
        { slot: "title", kind: "text", name: "t", bbox: box(64, 96, 400, 56), paintRole: "ink", text: "Compare", fontSize: 40 },
        { slot: "divider", kind: "rule", name: "v", bbox: box(496, 120, 1, 480), paintRole: "line" },
        { slot: "under", kind: "rule", name: "h", bbox: box(64, 400, 400, 12), paintRole: "line" },
        { slot: "body", kind: "text", name: "b", bbox: box(544, 120, 600, 400), paintRole: "ink", text: "Body", fontSize: 17 },
      ],
    };
    const out = snapCanvasReport([slide], system).slides[0]!;
    const v = out.elements.find((e) => e.slot === "divider")!;
    assert.equal(v.bbox.h, 480);
    assert.ok(v.bbox.w <= 4);
    const h = out.elements.find((e) => e.slot === "under")!;
    assert.equal(h.bbox.w, 400);
    assert.ok(h.bbox.h <= 4);
  });

  it("darkens an accent panel until the light copy on it clears AA, leaving accent rules alone", () => {
    const orange = { ...theme, palette: { ...paletteOf(theme), accent: "#d9480f", bg: "#f8fafc" } };
    const slide: FilledSlide = {
      layout: "evidence",
      variant: "canvas",
      elements: [
        { slot: "panel", kind: "surface", name: "p", bbox: box(64, 400, 1152, 120), paintRole: "accent" },
        { slot: "panel.copy", kind: "text", name: "c", bbox: box(96, 430, 1088, 60), paintRole: "bg", text: "The two most quotable lines in the deck are its least legible.", fontSize: 20 },
        { slot: "hero", kind: "surface", name: "h", bbox: box(64, 200, 1152, 160), paintRole: "accent" },
        { slot: "hero.copy", kind: "text", name: "hc", bbox: box(96, 240, 1088, 80), paintRole: "bg", text: "Large display line", fontSize: 40 },
        { slot: "rule", kind: "rule", name: "r", bbox: box(64, 380, 200, 2), paintRole: "accent" },
      ],
    };
    const [p] = applyColorTheme([slide], orange);
    const byS = (s: string) => p!.elements.find((e) => e.slot === s)!;
    const ratio = (a: string, b: string) => contrastRatio(parseHex(a)!, parseHex(b)!);
    assert.ok(ratio(byS("panel.copy").color, byS("panel").color) >= 4.5, `body panel ${byS("panel").color}`);
    assert.notEqual(byS("panel").color.toLowerCase(), "#d9480f");
    // 40px display copy only needs 3:1 — the hero panel keeps the raw accent.
    assert.equal(byS("hero").color.toLowerCase(), "#d9480f");
    assert.equal(byS("rule").color.toLowerCase(), "#d9480f");
    assert.equal(byS("panel.copy").color.toLowerCase(), "#f8fafc");
    // Light copy on a light card is a wrong pairing, not a weak one: the card stays (QA flips the text).
    const cream = { ...theme, palette: { ...paletteOf(theme), surface: "#EFEBE3", bg: "#F8FAFC" } };
    const card: FilledSlide = {
      layout: "evidence",
      variant: "canvas",
      elements: [
        { slot: "card", kind: "surface", name: "c", bbox: box(64, 200, 500, 200), paintRole: "surface" },
        { slot: "card.copy", kind: "text", name: "cc", bbox: box(84, 220, 460, 60), paintRole: "bg", text: "Light copy on a cream card.", fontSize: 16 },
      ],
    };
    const [q] = applyColorTheme([card], cream);
    assert.equal(q!.elements[0]!.color.toLowerCase(), "#efebe3");
    assert.equal(q!.elements[0]!.liftedFrom, undefined);
  });

  it("caps the reading load: five long descriptions + subtitle + footnote + callout on a photo is too much", () => {
    const sentence = "从小场景切入、用真实问题验证效果，再逐步扩面到更多团队与场景。"; // 31 units
    const overloaded: FilledSlide = {
      layout: "sequence",
      variant: "canvas",
      background: { kind: "image", src: "data:image/png;base64,iVBORw0KGgo=", scrim: { direction: "left", strength: 0.75 } },
      elements: [
        { slot: "eyebrow", kind: "text", name: "e", bbox: box(64, 40, 300, 18), paintRole: "accent", text: "05 · 落地路径", fontSize: 12 },
        { slot: "title", kind: "text", name: "t", bbox: box(64, 70, 900, 56), paintRole: "ink", text: "五步落地路径", fontSize: 32 },
        { slot: "deck", kind: "text", name: "d", bbox: box(64, 136, 900, 40), paintRole: "muted", text: sentence, fontSize: 17 },
        ...Array.from({ length: 5 }, (_, i) => ({
          slot: `desc-${i}`,
          kind: "text" as const,
          name: `d${i}`,
          bbox: box(64 + i * 230, 300, 210, 120),
          paintRole: "ink" as const,
          text: sentence,
          fontSize: 17,
        })),
        { slot: "note", kind: "text", name: "n", bbox: box(64, 600, 900, 40), paintRole: "muted", text: sentence, fontSize: 13 },
        { slot: "call", kind: "text", name: "c", bbox: box(64, 650, 900, 30), paintRole: "accent", text: sentence, fontSize: 16 },
      ],
    };
    const res = compileCanvasDeck({ system, theme, slides: [overloaded], title: "x", briefs: [{ relationships: "order", rhythm: "dense", composition: "band" }] });
    const hit = res.reflect.findings.filter((f) => /characters of copy/.test(f.issue));
    assert.equal(hit.length, 1, res.reflect.findings.map((f) => f.issue).join("; "));
    assert.match(hit[0]!.issue, /~25\d characters of copy in 8 blocks \(cap 224/);
    // Same copy on plain paper as a dense page (cap 320) is within bounds.
    const { background: _bg, ...plain } = overloaded;
    const ok = compileCanvasDeck({ system, theme, slides: [plain], title: "x", briefs: [{ relationships: "order", rhythm: "dense", composition: "band" }] });
    assert.equal(ok.reflect.findings.filter((f) => /characters of copy/.test(f.issue)).length, 0);
  });

  it("flags a title that promises four when the page carries five tiles", () => {
    const page = (title: string, n: number): FilledSlide => ({
      layout: "evidence",
      variant: "canvas",
      elements: [
        { slot: "title", kind: "text", name: "t", bbox: box(64, 60, 900, 56), paintRole: "ink", text: title, fontSize: 36 },
        {
          slot: "grid",
          kind: "device",
          name: "g",
          bbox: box(64, 200, 1152, 400),
          paintRole: "accent",
          device: { type: "iconLabelGrid", items: Array.from({ length: n }, (_, i) => ({ title: `T${i}`, body: "body", icon: "rocket" })) },
        },
      ],
    });
    const off = compileCanvasDeck({ system, theme, slides: [page("知识管理的四个失血点", 5)], title: "x" });
    const hit = off.reflect.findings.filter((f) => /title promises 4/.test(f.issue));
    assert.equal(hit.length, 1, off.reflect.findings.map((f) => f.issue).join("; "));
    assert.match(hit[0]!.issue, /“四个”.*carries 5 items/);
    assert.equal(compileCanvasDeck({ system, theme, slides: [page("知识管理的四个失血点", 4)], title: "x" }).reflect.findings.filter((f) => /promises/.test(f.issue)).length, 0);
    assert.equal(compileCanvasDeck({ system, theme, slides: [page("Four pillars of trust", 5)], title: "x" }).reflect.findings.filter((f) => /promises 4/.test(f.issue)).length, 1);
    // Numbers that are not counts of the page's items are left alone.
    assert.equal(compileCanvasDeck({ system, theme, slides: [page("2024 results in 3 minutes", 5)], title: "x" }).reflect.findings.filter((f) => /promises/.test(f.issue)).length, 0);
    assert.equal(compileCanvasDeck({ system, theme, slides: [page("试点 6 个月的效果曲线", 3)], title: "x" }).reflect.findings.filter((f) => /promises/.test(f.issue)).length, 0);
  });

  it("flags unbalanced compare planes and page numerals that do not count up", () => {
    const planes = (right: string[]): FilledSlide => ({
      layout: "compare",
      variant: "canvas",
      elements: [
        { slot: "title", kind: "text", name: "t", bbox: box(64, 60, 900, 56), paintRole: "ink", text: "Old vs new", fontSize: 36 },
        { slot: "vs", kind: "device", name: "d", bbox: box(64, 160, 1152, 480), paintRole: "accent", device: { type: "comparePlanes", left: { title: "Old", points: ["a", "b", "c"] }, right: { title: "New", points: right } } },
      ],
    });
    const bad = compileCanvasDeck({ system, theme, slides: [planes([])], title: "x" });
    assert.ok(bad.reflect.findings.some((f) => /compare planes are unbalanced \(left 3 points, right 0\)/.test(f.issue)), bad.reflect.findings.map((f) => f.issue).join("; "));
    const good = compileCanvasDeck({ system, theme, slides: [planes(["x", "y", "z"])], title: "x" });
    assert.equal(good.reflect.findings.filter((f) => /unbalanced/.test(f.issue)).length, 0);
    // Sparse points: the planes keep the authored box, rows are capped, and both content blocks
    // start at the same y (centred on the taller one) so the headers align.
    const els = good.painted[0]!.elements;
    const leftPlane = els.find((e) => e.slot === "vs.left.plane")!;
    const rightPlane = els.find((e) => e.slot === "vs.right.plane")!;
    assert.equal(leftPlane.bbox.h, 480);
    assert.equal(rightPlane.bbox.h, 480);
    const lt = els.find((e) => e.slot === "vs.left.title")!;
    const rt = els.find((e) => e.slot === "vs.right.title")!;
    assert.equal(lt.bbox.y, rt.bbox.y);
    assert.ok(lt.bbox.y > 160 + 40, `content block is centred, not pinned to the top (${lt.bbox.y})`);
    const p0 = els.find((e) => e.slot === "vs.left.p0")!;
    const p1 = els.find((e) => e.slot === "vs.left.p1")!;
    assert.ok(p1.bbox.y - p0.bbox.y <= system.typeScale.body * 3 + 0.5, `rows are capped (${p1.bbox.y - p0.bbox.y})`);
    // A long plane header steps down rather than wrapping onto the rule.
    const longHead = compileCanvasDeck({
      system,
      theme,
      slides: [{ ...planes(["x", "y", "z"]), elements: [planes([]).elements[0]!, { slot: "vs", kind: "device", name: "d", bbox: box(64, 160, 700, 480), paintRole: "accent", device: { type: "comparePlanes", left: { title: "Rasterize & whiteboard & desktop-plugin routes", points: ["a"] }, right: { title: "New", points: ["x"] } } }] }],
      title: "x",
    });
    const head = longHead.painted[0]!.elements.find((e) => e.slot === "vs.left.title")!;
    assert.ok((head.fontSize ?? 99) < system.typeScale.h2, `header shrank to fit one line (${head.fontSize})`);

    const numbered = (i: number, label: string, size = 12): FilledSlide => ({
      layout: "evidence",
      variant: "canvas",
      elements: [
        { slot: `num-${i}`, kind: "text", name: "n", bbox: box(64, 40, 80, size * 1.6), paintRole: "accent", text: label, fontSize: size },
        { slot: `title-${i}`, kind: "text", name: "t", bbox: box(64, 80, 900, 56), paintRole: "ink", text: `Page ${i}`, fontSize: 36 },
        { slot: `body-${i}`, kind: "text", name: "b", bbox: box(64, 240, 1100, 380), paintRole: "ink", text: "Body", fontSize: 17 },
      ],
    });
    const broken = compileCanvasDeck({ system, theme, slides: [numbered(0, "01"), numbered(1, "02"), numbered(2, "02"), numbered(3, "05")], title: "x" });
    const seq = broken.reflect.findings.filter((f) => /page numerals do not count up/.test(f.issue));
    assert.equal(seq.length, 1, broken.reflect.findings.map((f) => f.issue).join("; "));
    assert.match(seq[0]!.issue, /page 2 shows 2 \(expected 3\); page 3 shows 5 \(expected 4\)/);
    const fine = compileCanvasDeck({ system, theme, slides: [numbered(0, "01"), numbered(1, "02"), numbered(2, "03")], title: "x" });
    assert.equal(fine.reflect.findings.filter((f) => /page numerals/.test(f.issue)).length, 0);
    // Zero-based folios are accepted too.
    const zero = compileCanvasDeck({ system, theme, slides: [numbered(0, "0"), numbered(1, "1"), numbered(2, "2")], title: "x" });
    assert.equal(zero.reflect.findings.filter((f) => /page numerals/.test(f.issue)).length, 0);
    // With the folio decision on, snap renumbers the author's numerals in place (keeping their
    // style) and drops a second numeral on the same page, so a page-scoped repair can't break the run.
    const renumbered = compileCanvasDeck({
      system,
      theme,
      folio: true,
      slides: [
        numbered(0, "01"),
        numbered(1, "02"),
        { ...numbered(2, "2"), elements: [...numbered(2, "2").elements, { slot: "num2b", kind: "text", name: "n2", bbox: box(1100, 660, 100, 20), paintRole: "muted", text: "03 / 05", fontSize: 12 }] },
        numbered(3, "07 / 14"),
        { ...numbered(4, "03"), elements: numbered(4, "03").elements.map((e) => (e.slot === "num-4" ? { ...e, runs: [{ text: "03", emphasis: "accent" as const }] } : e)) },
      ],
      title: "x",
    });
    assert.equal(renumbered.reflect.findings.filter((f) => /page numerals/.test(f.issue)).length, 0, renumbered.reflect.findings.map((f) => f.issue).join("; "));
    const nums = renumbered.painted.map((s) => s.elements.filter((e) => e.kind === "text" && /^\d{1,2}(\s*\/\s*\d{1,2})?$/.test(e.text ?? "")));
    assert.deepEqual(nums.map((es) => es.map((e) => e.text)), [["01"], ["02"], ["03"], ["04 / 05"], ["05"]]);
    // A numeral authored as styled runs (what the repair pass tends to emit) is rewritten in the runs too,
    // since emit paints runs over `text`.
    assert.deepEqual(nums[4]![0]!.runs, [{ text: "05", emphasis: "accent" }]);
    // A sidebar composition parks its numeral mid-height in the left column; that is the page's folio,
    // so a second numeral the author also drew in the bottom corner is the model numbering twice.
    const sidebarPage: FilledSlide = {
      layout: "agenda",
      variant: "canvas",
      elements: [
        { slot: "rail", kind: "surface", name: "s", bbox: box(0, 0, 256, 720), paintRole: "accentSoft" },
        { slot: "side-num", kind: "text", name: "n", bbox: box(48, 336, 170, 40), paintRole: "ink", text: "02", fontSize: 24 },
        { slot: "title", kind: "text", name: "t", bbox: box(320, 96, 720, 52), paintRole: "ink", text: "Agenda", fontSize: 40 },
        { slot: "body", kind: "text", name: "b", bbox: box(320, 240, 800, 380), paintRole: "ink", text: "Body", fontSize: 17 },
        { slot: "corner", kind: "text", name: "c", bbox: box(1150, 656, 66, 28), paintRole: "muted", text: "02", fontSize: 13 },
      ],
    };
    const side = compileCanvasDeck({ system, theme, folio: true, slides: [numbered(0, "01"), sidebarPage, numbered(2, "03")], title: "x" });
    const sideNums = side.painted[1]!.elements.filter((e) => e.kind === "text" && /^\d{2}$/.test(e.text ?? ""));
    assert.deepEqual(sideNums.map((e) => e.slot), ["side-num"]);
    assert.equal(sideNums[0]!.fontSize, system.typeScale.caption);
    // One folio at 24px among 12px eyebrows breaks the system.
    const sized = compileCanvasDeck({ system, theme, slides: [numbered(0, "01"), numbered(1, "02"), numbered(2, "03", 24), numbered(3, "04")], title: "x" });
    const sz = sized.reflect.findings.filter((f) => /page numerals change size/.test(f.issue));
    assert.equal(sz.length, 1, sized.reflect.findings.map((f) => f.issue).join("; "));
    assert.match(sz[0]!.issue, /page 2 at 24px; the rest at 12px/);
  });

  it("reports running copy below the 13px floor but lets short labels stay at caption size", () => {
    const slide: FilledSlide = {
      layout: "evidence",
      variant: "canvas",
      elements: [
        { slot: "title", kind: "text", name: "t", bbox: box(64, 48, 900, 56), paintRole: "ink", text: "Title", fontSize: 40 },
        { slot: "eyebrow", kind: "text", name: "e", bbox: box(64, 20, 300, 18), paintRole: "accent", text: "01 · Context", fontSize: 11 },
        { slot: "fine", kind: "text", name: "f", bbox: box(64, 300, 900, 60), paintRole: "muted", text: "This is a full sentence of explanation that nobody can read projected.", fontSize: 11 },
      ],
    };
    // Gate (bypassing snap): only the long sentence is reported.
    const res = reflectCanvas(applyColorTheme([slide], theme), system, theme);
    const floor = res.findings.filter((f) => /readability floor/.test(f.issue));
    assert.equal(floor.length, 1, res.findings.map((f) => f.issue).join("; "));
    assert.match(floor[0]!.issue, /fine/);
    // Snap fixes it by construction, so the compiled deck passes without a repair round.
    const snapped = snapCanvasReport([slide], system).slides[0]!;
    assert.equal(snapped.elements.find((e) => e.slot === "fine")!.fontSize, 13);
    assert.equal(snapped.elements.find((e) => e.slot === "eyebrow")!.fontSize, 11);
    assert.equal(compileCanvasDeck({ system, theme, slides: [slide], title: "x" }).reflect.findings.filter((f) => /readability floor/.test(f.issue)).length, 0);
  });

  it("device bodies and KPI labels come out at or above the readability floor", () => {
    for (const id of ["editorial", "swiss", "dark-tech", "data-dense"]) {
      const sys = resolveVisualSystem(id);
      const slide: FilledSlide = {
        layout: "evidence",
        variant: "canvas",
        elements: [
          { slot: "title", kind: "text", name: "t", bbox: box(64, 48, 900, 56), paintRole: "ink", text: "Title", fontSize: 40 },
          { slot: "kpis", kind: "device", name: "k", bbox: box(64, 140, 1152, 200), paintRole: "accent", device: { type: "kpiRow", items: [{ value: "41%", title: "Retention lift year over year" }, { value: "3.2x", title: "Payback" }] } },
          { slot: "steps", kind: "device", name: "s", bbox: box(64, 380, 1152, 280), paintRole: "accent", device: { type: "stepStrip", items: [{ title: "Pilot", body: "Two teams, six weeks, one workflow." }, { title: "Scale", body: "Roll to every region with the same template." }] } },
          { slot: "tiles", kind: "device", name: "g", bbox: box(64, 380, 1152, 280), paintRole: "accent", device: { type: "iconLabelGrid", items: [{ title: "Fast", body: "Answers in under a second." }, { title: "Safe", body: "Every source cited inline." }] } },
        ],
      };
      const snapped = snapCanvasReport([slide], sys);
      const small = snapped.slides[0]!.elements.filter((e) => e.kind === "text" && (e.fontSize ?? 0) < 13 && [...(e.text ?? "")].length > 24);
      assert.deepEqual(small.map((e) => `${e.slot}@${e.fontSize}`), [], `${id}: small running copy`);
      const bodies = snapped.slides[0]!.elements.filter((e) => /\.(body)$/.test(e.slot));
      assert.ok(bodies.length >= 4, `${id}: device bodies expanded`);
      for (const b of bodies) assert.ok((b.fontSize ?? 0) >= sys.typeScale.body, `${id}: ${b.slot} at ${b.fontSize} < body ${sys.typeScale.body}`);
    }
  });
});

describe("content-page title size — snap forces, reflect backstops", () => {
  const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
  const system = resolveVisualSystem("editorial"); // h1 36, h2 22, display 64
  const theme = seedColorTheme("editorial", "ink");
  const page = (layout: string, titleSlot: string, titleSize: number, title = "Section title"): FilledSlide => ({
    layout,
    variant: "canvas",
    elements: [
      { slot: titleSlot, kind: "text", name: "t", bbox: box(64, 60, 900, 60), paintRole: "ink", text: title, fontSize: titleSize },
      { slot: "body", kind: "text", name: "b", bbox: box(64, 240, 1100, 380), paintRole: "ink", text: "Body copy.", fontSize: 17 },
    ],
  });

  it("snaps the title slot on content pages to h1 whatever the author wrote, leaves anchor pages alone", () => {
    const slides = [page("cover", "title", 64), page("evidence", "title", 42), page("data", "title", 28), page("close", "title", 56)];
    const briefs = [
      { relationships: "none" as const, rhythm: "anchor" as const },
      { relationships: "none" as const, rhythm: "dense" as const },
      { relationships: "none" as const, rhythm: "dense" as const },
      { relationships: "none" as const, rhythm: "anchor" as const },
    ];
    const out = snapCanvasReport(slides, system, { briefs }).slides;
    const sizes = out.map((s) => s.elements.find((e) => e.slot === "title")!.fontSize);
    assert.deepEqual(sizes, [64, 36, 36, 56]);
    // Device-internal titles keep their own scale.
    const withDevice: FilledSlide = {
      ...page("evidence", "title", 42),
      elements: [
        ...page("evidence", "title", 42).elements,
        { slot: "steps", kind: "device", name: "s", bbox: box(64, 300, 1152, 300), paintRole: "accent", device: { type: "stepStrip", items: [{ title: "Pilot" }, { title: "Scale" }] } },
      ],
    };
    const dev = snapCanvasReport([withDevice], system, { briefs: [{ relationships: "order", rhythm: "dense" }] }).slides[0]!;
    assert.equal(dev.elements.find((e) => e.slot === "steps.step0.title")!.fontSize, system.typeScale.h2);
    // statement / full-bleed compositions are not content pages even when rhythm is dense.
    const stmt = snapCanvasReport([page("evidence", "title", 64)], system, { briefs: [{ relationships: "none", rhythm: "dense", composition: "statement" }] }).slides[0]!;
    assert.equal(stmt.elements[0]!.fontSize, 64);
  });

  it("drops to h2 only when the title cannot fit two lines of h1", () => {
    assert.equal(contentTitleSize(system, "Short", { w: 900, h: 60 }), 36);
    const long = "这是一个非常长的中文页面标题用来测试两行是否放得下的情况再补几个字凑够长度还不够再来一些";
    assert.equal(contentTitleSize(system, long, { w: 600, h: 60 }), 22);
    // Eight CJK glyphs in a box that holds seven at h1 would leave one orphaned glyph on line
    // two; h2 sets it on one line instead. Seven glyphs in the same box stay at h1.
    const h1 = system.typeScale.h1;
    const sevenWide = { w: 7 * h1 + 19.2 + 4, h: 120 };
    assert.equal(contentTitleSize(system, "和常见方案的区别", sevenWide), system.typeScale.h2);
    assert.equal(contentTitleSize(system, "和常见方案区别", sevenWide), h1);
    assert.equal(isTitleSlot("title"), true);
    assert.equal(isTitleSlot("pageTitle"), true);
    assert.equal(isTitleSlot("tile0.title"), false);
    assert.equal(isTitleSlot("chartTitle"), false);
    assert.equal(isContentPage("evidence"), true);
    assert.equal(isContentPage("section"), false);
  });

  it("also forces unnamed titles (largest word-text in the top third), skipping numerals and KPI values", () => {
    // Real models rarely name slots: the title arrives as an anonymous text-N.
    const slides = [page("cover", "text-1", 64), page("evidence", "text-3", 42), page("data", "text-2", 28), page("evidence", "text-9", 36)];
    const out = compileCanvasDeck({ system, theme, slides, title: "x" });
    assert.deepEqual(out.painted.map((s) => s.elements[0]!.fontSize), [64, 36, 36, 36]);
    assert.equal(out.reflect.findings.filter((x) => /content-page titles/.test(x.issue)).length, 0);
    // Sidebar numeral and KPI values in the top third are not mistaken for the title.
    const sidebar: FilledSlide = {
      ...page("data", "text-5", 42),
      elements: [
        { slot: "num", kind: "text", name: "n", bbox: box(64, 40, 150, 88), paintRole: "bg", text: "04", fontSize: 72 },
        { slot: "kpi", kind: "text", name: "k", bbox: box(400, 40, 200, 80), paintRole: "accent", text: "41%", fontSize: 64 },
        ...page("data", "text-5", 42).elements,
      ],
    };
    const sb = snapCanvasReport([sidebar], system).slides[0]!;
    assert.equal(sb.elements.find((e) => e.slot === "num")!.fontSize, 72);
    assert.equal(sb.elements.find((e) => e.slot === "kpi")!.fontSize, 64);
    assert.equal(sb.elements.find((e) => e.slot === "text-5")!.fontSize, 36);
  });

  it("reflect backstop reports one deck-level finding when snap did not run over the titles", () => {
    const slides = [page("cover", "text-1", 64), page("evidence", "text-3", 42), page("data", "text-2", 36), page("evidence", "text-9", 36)];
    const painted = applyColorTheme(slides, theme);
    const res = reflectCanvas(painted, system, theme);
    const f = res.findings.filter((x) => /content-page titles/.test(x.issue));
    assert.equal(f.length, 1, res.findings.map((x) => x.issue).join("; "));
    assert.equal(f[0]!.slideIdx, -1);
    assert.match(f[0]!.issue, /pages 1 \(42px\)/);
    assert.match(f[0]!.issue, /to 36px/);
    // A title snap stepped down to h2 because h1 cannot fit its narrow split column is the
    // compiler's call, not an off-size page: otherwise the repair loop chases a finding it cannot fix.
    const narrow: FilledSlide = {
      layout: "data",
      variant: "canvas",
      elements: [
        { slot: "title", kind: "text", name: "t", bbox: box(64, 150, 376, 120), paintRole: "ink", text: "Plans meter quota, not the editor, and the export", fontSize: 36 },
        { slot: "body", kind: "text", name: "b", bbox: box(544, 150, 600, 400), paintRole: "ink", text: "Body", fontSize: 17 },
      ],
    };
    const mixed = compileCanvasDeck({ system, theme, slides: [page("cover", "text-1", 64), page("evidence", "text-3", 36), narrow, page("evidence", "text-9", 36)], title: "x" });
    assert.equal(mixed.painted[2]!.elements[0]!.fontSize, system.typeScale.h2);
    assert.equal(mixed.reflect.findings.filter((x) => /content-page titles/.test(x.issue)).length, 0, mixed.reflect.findings.map((x) => x.issue).join("; "));
  });
});

describe("canvas type hierarchy", () => {
  const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
  it("infers the ramp role from the slot name when fontSize is missing, and gates flat pages", () => {
    const system = resolveVisualSystem("swiss");
    const theme = seedColorTheme("swiss");
    const t = system.typeScale;
    const noSizes: FilledSlide = {
      layout: "evidence",
      variant: "canvas",
      elements: [
        { slot: "eyebrow", kind: "text", name: "e", bbox: box(64, 40, 300, 20), paintRole: "muted", text: "01 · Benefits" },
        { slot: "title", kind: "text", name: "t", bbox: box(64, 70, 900, 48), paintRole: "ink", text: "Four benefits" },
        { slot: "deck", kind: "text", name: "d", bbox: box(64, 130, 900, 40), paintRole: "muted", text: "Why it matters" },
        { slot: "body", kind: "text", name: "b", bbox: box(64, 200, 900, 200), paintRole: "ink", text: "Copy." },
        { slot: "tile0.title", kind: "text", name: "tt", bbox: box(64, 420, 300, 30), paintRole: "ink", text: "Search" },
        { slot: "kpi.value", kind: "text", name: "kv", bbox: box(64, 500, 300, 80), paintRole: "accent", text: "41%" },
      ],
    };
    const snapped = snapCanvas([noSizes], system);
    const size = (slot: string) => snapped[0]!.elements.find((e) => e.slot === slot)!.fontSize;
    assert.equal(size("eyebrow"), t.caption);
    assert.equal(size("title"), t.h1);
    assert.equal(size("deck"), t.h2);
    assert.equal(size("body"), t.body);
    assert.notEqual(size("tile0.title"), t.h1, "tile titles are not the page title");
    assert.equal(size("kpi.value"), t.display);
    const ok = compileCanvasDeck({ system, theme, slides: [noSizes], title: "x" });
    assert.ok(!ok.reflect.findings.some((f) => /flat type hierarchy/.test(f.issue)));

    const flat: FilledSlide = {
      ...noSizes,
      elements: noSizes.elements.map((e) => ({ ...e, slot: `x${e.slot.replace(/[^0-9]/g, "")}`, fontSize: t.body })),
    };
    const bad = compileCanvasDeck({ system, theme, slides: [flat], title: "x" });
    const f = bad.reflect.findings.find((x) => /flat type hierarchy/.test(x.issue));
    assert.ok(f, bad.reflect.findings.map((x) => x.issue).join("; "));
    assert.match(f!.issue, new RegExp(`h1=${t.h1}px`));
  });
});

describe("canvas systems", () => {
  it("adds five canvas-only systems without touching the locked catalog whitelist", () => {
    assert.deepEqual([...VISUAL_SYSTEM_IDS], ["editorial", "swiss"]);
    assert.deepEqual([...CANVAS_SYSTEM_IDS], ["editorial", "swiss", "dark-tech", "soft-rounded", "photo-editorial", "data-dense", "brutalist"]);
    for (const id of CANVAS_SYSTEM_IDS) {
      const sys = resolveVisualSystem(id);
      assert.equal(sys.id, id);
      assert.ok(sys.canvas.character.length > 10);
      assert.ok(!/#[0-9a-f]{6}/i.test(JSON.stringify(sys)), `${id} carries no hex`);
      const theme = seedColorTheme(id);
      assert.ok(theme.palette?.bg && theme.palette.accent);
    }
    assert.equal(seedColorTheme("dark-tech").id, "custom");
    assert.equal(seedColorTheme("editorial").id, "ink");
    assert.throws(() => resolveVisualSystem("monograph"));
    assert.equal(typeRole(resolveVisualSystem("soft-rounded"), "display", 60).fontWeight, 700);
    assert.equal(typeRole(resolveVisualSystem("dark-tech"), "display", 68).fontWeight, 200);
  });
});

describe("themeFromAuthoredLook", () => {
  it("uses authored hex and custom id when no named seed is given", () => {
    const theme = themeFromAuthoredLook({
      systemId: "swiss",
      palette: { bg: "#111111", ink: "#FAFAFA", accent: "#FF5A1F" },
    });
    assert.equal(theme.id, "custom");
    assert.equal(theme.systemId, "swiss");
    assert.equal(theme.palette?.bg, "#111111");
    assert.equal(theme.palette?.accent, "#FF5A1F");
  });
});
