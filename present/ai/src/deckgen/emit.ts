/**
 * Emit an editable SlimPPT Presentation IR (same object model tools mutate).
 */

import {
  buildSmartArtShapes,
  identityTransform,
  type ChartDef,
  type ChartShape,
  type EllipseShape,
  type GroupShape,
  type ImageShape,
  type LineShape,
  type Paint,
  type Presentation,
  type RectShape,
  type ShadowEffect,
  type Shape,
  type ShapeEffect,
  type Slide,
  type Stroke,
  type TextRun,
  type TextShape,
} from "@ppt/core";
import { createShapeFromPreset } from "@ppt/editor/commands";
import type { ColorTheme } from "./color-theme.js";
import { onRoleText, paletteOf, type ColorPalette } from "./color-theme.js";
import type { VisualSystem } from "./visual-system.js";
import { CANVAS, typeRole } from "./visual-system.js";
import type { PaintedEl, PaintedSlide } from "./apply-theme.js";
import { deckgenFontLinks, injectDeckgenFonts } from "./fonts.js";
import { realImageSrc } from "./snap.js";
import { iconPathShape } from "./icons.js";
import type { CanvasScrim } from "./ir.js";
import { contrastRatio, ensureContrast, mixRgb, parseHex, relativeLuminance, toHex } from "../generate/qa/color.js";
import { buildDeckgenMasters, deckgenLayoutId } from "./masters.js";

function base() {
  return {
    zIndex: 0,
    visible: true,
    locked: false,
    opacity: 1,
    transform: identityTransform(),
  };
}

/** Shadows are cast in the darker palette token — `ink` is near-white on dark-paper systems. */
function shadowTone(pal: ColorPalette): string {
  const ink = parseHex(pal.ink);
  const bg = parseHex(pal.bg);
  if (!ink || !bg) return pal.ink;
  return relativeLuminance(ink) <= relativeLuminance(bg) ? pal.ink : pal.bg;
}

function shadowOf(el: PaintedEl, pal: ColorPalette): ShadowEffect | undefined {
  if (!el.shadow) return undefined;
  return {
    kind: "outer",
    blur: el.shadow.blur,
    dx: el.shadow.dx,
    dy: el.shadow.dy,
    color: shadowTone(pal),
    alpha: el.shadow.alpha,
  };
}

function effectsOf(el: PaintedEl): { effects: ShapeEffect[] } | Record<string, never> {
  if (!el.glow) return {};
  return { effects: [{ kind: "glow", radius: 18, color: el.color, alpha: 0.45 }] };
}

/** Directional scrim over a photo canvas: darkest on the type side, clear on the far side. */
function scrimPaint(scrim: CanvasScrim, color: string): Paint {
  const s = scrim.strength;
  // Type on a "left" scrim runs to ~55% of the width, so hold the scrim near full strength
  // through the first 40% and let it fall off past the copy — a straight fade left the far
  // end of a lede sitting on a half-strength veil over a bright photograph. `floor` keeps a
  // veil on the clear side when small type (kicker, folio) sits there.
  const floor = Math.min(s, scrim.floor ?? 0);
  const stops = (dark: number, clear: number) => [
    { offset: dark, color, alpha: s },
    { offset: dark + (clear - dark) * 0.4, color, alpha: s * 0.9 },
    { offset: dark + (clear - dark) * 0.7, color, alpha: Math.max(s * 0.4, floor) },
    { offset: clear, color, alpha: floor },
  ];
  switch (scrim.direction) {
    case "left":
      return { kind: "linear", angle: 0, stops: stops(0, 1) };
    case "right":
      return { kind: "linear", angle: 180, stops: stops(0, 1) };
    case "top":
      return { kind: "linear", angle: 90, stops: stops(0, 1) };
    case "bottom":
      return { kind: "linear", angle: 270, stops: stops(0, 1) };
    case "radial":
      return {
        kind: "radial",
        path: "circle",
        fillToRect: { l: 0.5, t: 0.5, r: 0.5, b: 0.5 },
        stops: [
          { offset: 0, color, alpha: s },
          { offset: 0.55, color, alpha: s * 0.5 },
          { offset: 1, color, alpha: 0.05 },
        ],
      };
    default:
      return { kind: "solid", color, alpha: s * 0.65 };
  }
}

function runsOf(el: PaintedEl, pal: ColorPalette, sys: VisualSystem, tr: { fontFamily: string; fontWeight: number; letterSpacing?: number; caps?: "all" }): TextRun[] {
  const common = {
    fontSize: el.fontSize,
    fontFamily: el.fontFamily ?? tr.fontFamily,
    ...(el.italic ? { italic: true } : {}),
    ...(el.letterSpacing != null
      ? { letterSpacing: el.letterSpacing }
      : tr.letterSpacing != null
        ? { letterSpacing: tr.letterSpacing }
        : {}),
    ...(el.caps ? { caps: el.caps } : tr.caps ? { caps: tr.caps } : {}),
  };
  const weight = el.fontWeight ?? tr.fontWeight;
  if (!el.runs?.length) {
    return [{ text: el.text ?? "", fontWeight: weight, color: el.color, ...common }];
  }
  return el.runs.map((r) => {
    switch (r.emphasis) {
      case "bold":
        return { text: r.text, fontWeight: Math.max(weight, 700), color: el.color, ...common };
      case "accent":
        return { text: r.text, fontWeight: Math.max(weight, 600), color: pal.accent, ...common };
      case "mono":
        return { text: r.text, fontWeight: weight, color: el.color, ...common, fontFamily: sys.fonts.mono };
      default:
        return { text: r.text, fontWeight: weight, color: el.color, ...common };
    }
  });
}

/**
 * Art type. `outline` = hollow glyphs stroked in the type colour (the serializer writes
 * `<a:noFill/>` + `<a:ln>`; the renderer paints stroke-then-fill). `gradient` = linear fill
 * from the type colour toward the accent, kept close enough to the type colour that the far
 * end still clears 3:1 on the paper. Shadow / glow were folded into flags by snap.
 */
function dressRuns(runs: TextRun[], el: PaintedEl, pal: ColorPalette): TextRun[] {
  if (el.treatment === "outline") {
    const width = Math.max(1.25, Math.round(((el.fontSize ?? 32) / 30) * 4) / 4);
    return runs.map((r) => ({
      ...r,
      color: "transparent",
      textOutline: { paint: { kind: "solid", color: r.color ?? el.color }, width },
    }));
  }
  if (el.treatment === "gradient") {
    const text = parseHex(el.color);
    const accent = parseHex(pal.accent);
    // The far end is checked against what the text actually sits on — on an accent band the
    // accent-tinted end would otherwise dissolve into the band.
    const paper = parseHex(el.backdrop ?? pal.bg);
    if (!text || !accent || !paper) return runs;
    // On an accent-coloured band the treatment has nothing to fade toward: keep the type solid.
    if (contrastRatio(accent, paper) < 3) return runs;
    const far = mixRgb(accent, text, 0.3);
    const to = toHex(ensureContrast(far, paper, text, 3));
    const fill: Paint = { kind: "linear", angle: 20, stops: [{ offset: 0, color: el.color }, { offset: 1, color: to }] };
    return runs.map((r) => (r.color && r.color !== el.color ? r : { ...r, fill }));
  }
  return runs;
}

/** Recolor SmartArt children onto the deck palette (core builds them in stock pastels). */
/** Layouts whose first item is a hub / root the others hang off; only those paint item 0 in the accent. */
const HUB_LAYOUTS = new Set<string>(["radial", "target", "hierarchy", "orgChart", "relationship"]);

function recolorDiagram(children: Shape[], pal: ColorPalette, sys: VisualSystem, layout: string): void {
  let fillIdx = 0;
  // Sequential layouts (process, chevron, timeline, cycle…) keep every node the same: an accent
  // first node read as "step 1 is done / current" — the same finding the step strip had.
  const hubLayout = HUB_LAYOUTS.has(layout);
  // Text ids sitting on the accent hub. Recolored after the loop: core emits the card's bg
  // before its text, so recoloring inline was immediately overwritten by the text pass.
  const onHub = new Set<string>();
  for (const ch of children) {
    if (ch.kind === "text") {
      // emitDiagram joins `title\nbody` → paragraph 0 is the node title, the rest is body copy.
      const hasBody = ch.paragraphs.length > 1;
      // Size to the node: a 150×80 chevron takes ~18/13, a 220×120 hierarchy card h2/body.
      const titleSize = Math.round(Math.min(sys.typeScale.h2, Math.max(sys.typeScale.body, ch.bbox.h * 0.22)));
      const bodySize = Math.round(Math.min(sys.typeScale.body, Math.max(sys.typeScale.caption, ch.bbox.h * 0.16)));
      ch.paragraphs.forEach((p, pi) => {
        const title = pi === 0 && hasBody;
        p.lineHeight = 1.15;
        for (const r of p.runs) {
          r.color = pal.ink;
          r.fontFamily = sys.fonts.body;
          if (hasBody) {
            r.fontSize = title ? titleSize : bodySize;
            r.fontWeight = title ? 600 : 400;
          } else if (r.fontSize && r.fontSize > sys.typeScale.h2) r.fontSize = sys.typeScale.h2;
        }
      });
      // Air inside the node: core's 10/6 insets are sized for its own small cards; at deck scale
      // copy sat on the node's edge.
      if (ch.bbox.w >= 120 && ch.bbox.h >= 60) ch.insets = { l: 14, t: 10, r: 14, b: 10 };
      delete ch.fill;
      delete ch.stroke;
      continue;
    }
    if (ch.kind === "line") {
      ch.stroke = { ...(ch.stroke ?? { paint: { kind: "solid", color: pal.line }, width: 1 }), paint: { kind: "solid", color: pal.muted } };
      continue;
    }
    if (ch.kind === "image") continue;
    if (ch.fill) {
      const hub = hubLayout && /hub|center|root|_0_/.test(ch.id) && fillIdx === 0;
      ch.fill = { kind: "solid", color: hub ? pal.accent : pal.accentSoft };
      if (hub) onHub.add(ch.id.replace(/_(bg|ring_hub|venn|accent)_/, "_text_"));
      fillIdx++;
    }
    ch.stroke = { paint: { kind: "solid", color: pal.accent }, width: sys.canvas.ruleWidth };
    if (ch.kind === "rect" && sys.canvas.radius > 0) {
      ch.rx = Math.min(sys.canvas.radius, 12);
      ch.ry = ch.rx;
    }
  }
  if (onHub.size) {
    const hubInk = onRoleText(pal, "accent");
    for (const t of children) {
      if (t.kind === "text" && onHub.has(t.id)) {
        for (const p of t.paragraphs) for (const r of p.runs) r.color = hubInk;
      }
    }
  }
}

function emitDiagram(el: PaintedEl, pal: ColorPalette, sys: VisualSystem, id: string): GroupShape | undefined {
  const d = el.diagram!;
  const items = d.items.map((it, i) => ({
    id: `${id}_i${i}`,
    text: it.body ? `${it.title}\n${it.body}` : it.title,
  }));
  const children = buildSmartArtShapes(d.layout, items, el.bbox);
  if (!children.length) return undefined;
  recolorDiagram(children, pal, sys, d.layout);
  return {
    ...base(),
    id,
    kind: "group",
    name: el.name,
    bbox: { ...el.bbox },
    children,
    smartArtMeta: { layout: d.layout },
  };
}

function emitPreset(el: PaintedEl, pal: ColorPalette, sys: VisualSystem, id: string): Shape[] {
  const preset = el.preset!;
  const stroke: Stroke = { paint: { kind: "solid", color: el.color }, width: el.strokeOnly ? Math.max(1.5, sys.canvas.ruleWidth) : 0 };
  const shape = createShapeFromPreset(preset, el.bbox, {
    id,
    name: el.name,
    fill: el.strokeOnly ? { kind: "solid", color: el.color, alpha: 0 } : fillOf(el, pal),
    stroke: el.strokeOnly ? stroke : { paint: { kind: "solid", color: el.color }, width: 0 },
    themeStyle: false,
  });
  if (shape.kind === "rect" && el.rx) {
    shape.rx = el.rx;
    shape.ry = el.rx;
  }
  const shad = shadowOf(el, pal);
  if (shad) shape.shadow = shad;
  const fx = effectsOf(el);
  if ("effects" in fx) shape.effects = fx.effects;
  const out: Shape[] = [shape];
  if (el.text) {
    // label centered on the preset — whichever token reads on the fill; ink on outlines
    const size = el.fontSize ?? sys.typeScale.body;
    const tr = typeRole(sys, "h2", size, el.text);
    const labelColor = el.strokeOnly ? pal.ink : onRoleText(pal, el.paintRole);
    const label: TextShape = {
      ...base(),
      id: `${id}_label`,
      kind: "text",
      name: `${el.name}:label`,
      bbox: { x: el.bbox.x + el.bbox.w * 0.1, y: el.bbox.y + el.bbox.h * 0.1, w: el.bbox.w * 0.8, h: el.bbox.h * 0.8 },
      wrap: true,
      vAlign: "middle",
      paragraphs: [
        {
          align: "middle",
          lineHeight: 1.15,
          runs: [
            {
              text: el.text,
              fontSize: size,
              fontWeight: 600,
              fontFamily: tr.fontFamily,
              color: labelColor,
            },
          ],
        },
      ],
    };
    out.push(label);
  }
  return out;
}

function fillOf(el: PaintedEl, pal: ColorPalette): Paint {
  if (el.gradient) {
    const from = pal[el.paintRole] ?? el.color;
    const to = pal[el.gradient.toRole] ?? from;
    return {
      kind: "linear",
      angle: el.gradient.angle,
      stops: [
        { offset: 0, color: from, alpha: el.gradient.fromAlpha ?? 1 },
        { offset: 1, color: to, alpha: el.gradient.toAlpha ?? 0.15 },
      ],
    };
  }
  return {
    kind: "solid",
    color: el.color,
    ...(el.fillAlpha != null ? { alpha: el.fillAlpha } : {}),
  };
}

function chartDef(el: PaintedEl, pal: ColorPalette): ChartDef {
  const c = el.chart!;
  const colors = [pal.accent, pal.ink, pal.muted, pal.line];
  const pie = c.type === "pie" || c.type === "doughnut";
  const series = c.series.map((s, i) => ({
    name: s.name,
    values: s.values,
    color: colors[i % colors.length],
  }));
  // Chart text sits on the slide (transparent chart area), so it takes the page's ink / line
  // colours — the renderer's default greys vanish on a dark system.
  const look = { textColor: pal.ink, textSize: 13, lineColor: pal.line };
  if (pie) {
    return {
      type: c.type,
      categories: c.categories,
      series,
      legend: true,
      showValues: true,
      colors,
      varyColors: true,
      ...look,
      ...(c.type === "doughnut" ? { holeRatio: 0.52 } : {}),
    };
  }
  if (c.type === "line") {
    return { type: "line", categories: c.categories, series, legend: series.length > 1, colors, markers: true, ...look };
  }
  if (c.type === "area") {
    return { type: "area", categories: c.categories, series, legend: series.length > 1, colors, ...look };
  }
  return { type: c.type, categories: c.categories, series, legend: series.length > 1, showValues: true, colors, ...look };
}

function emitTable(el: PaintedEl, pal: ColorPalette, sys: VisualSystem, id: string): GroupShape {
  const table = el.table!;
  const headers = table.headers;
  const data = [headers, ...table.rows];
  const rows = data.length;
  const cols = Math.max(1, headers.length);
  const cellW = el.bbox.w / cols;
  const cellH = el.bbox.h / rows;
  const headerText = onRoleText(pal, "accent");
  // Caption-size type in a 48px-tall cell reads as a footnote; let rows that have the room step up
  // to body size, and only fall back to caption when the grid is dense or a cell holds a long string.
  const longest = Math.max(1, ...data.flatMap((row) => row.map((v) => [...(v ?? "")].reduce((acc, ch) => acc + (/[\u2e80-\u9fff]/.test(ch) ? 1 : 0.58), 0))));
  const fits = (size: number): boolean => {
    const lines = Math.ceil((longest * size) / Math.max(1, cellW - 16));
    return lines * size * 1.3 <= cellH - 8;
  };
  let cellFont = Math.min(sys.typeScale.body, Math.floor(cellH * 0.34));
  while (cellFont > sys.typeScale.caption && !fits(cellFont)) cellFont -= 1;
  cellFont = Math.max(sys.typeScale.caption, cellFont);
  const children: Shape[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isHeader = r === 0;
      children.push({
        ...base(),
        id: `${id}_r${r}c${c}`,
        name: `R${r + 1}C${c + 1}`,
        kind: "text",
        bbox: {
          x: el.bbox.x + c * cellW,
          y: el.bbox.y + r * cellH,
          w: cellW,
          h: cellH,
        },
        fill: { kind: "solid", color: isHeader ? pal.accent : pal.surface },
        stroke: { paint: { kind: "solid", color: pal.line }, width: 1 },
        wrap: true,
        vAlign: "middle",
        paragraphs: [
          {
            align: "middle",
            runs: [
              {
                text: data[r]?.[c] ?? "",
                fontFamily: sys.fonts.body,
                fontSize: cellFont,
                color: isHeader ? headerText : pal.ink,
                ...(isHeader ? { fontWeight: 600 } : {}),
              },
            ],
          },
        ],
        cellMeta: { gridSpan: 1, rowSpan: 1 },
      });
    }
  }
  return {
    ...base(),
    id,
    kind: "group",
    name: el.name,
    bbox: { ...el.bbox },
    children,
    tableMeta: { rows, cols, firstRow: true, bandRow: true },
  };
}

/**
 * Shape ids MUST start with `sp_`: the whole animation stack derives the OOXML
 * `spTgt.spid` by stripping that prefix (`@ppt/editor` insertEffect) and resolves
 * targets back as `sp_${spid}` (`computeInitialEntranceState`, the player runtime).
 * A `dg_…` id used to slip past that contract — effects were written, no shape
 * matched, so nothing was hidden at slide start and no entrance ever played.
 */
function shapeId(slide: PaintedSlide, slot: string, i: number | string): string {
  return `sp_dg_${slide.layout}_${slot}_${i}`;
}

/**
 * Animation unit for a device part. Device expanders name parts `<device>.<item>.<part>`
 * (`kpis.kpi0.value`) or `<device>.<part>` (`band.text`). Everything inside one item — card,
 * icon, title, body — enters together; a device without items (band / callout / quote) is one
 * unit. Author-laid cards (surface + texts) have plain slots and fall back to bbox grouping in
 * `autoAnimateSlide`; a title that overhangs its card by a few px used to split into its own
 * beat, which is how "some cards animate and some don't" looked on live decks.
 */
export function animUnitOf(slot: string): string | undefined {
  const parts = slot.split(".");
  if (parts.length < 2) return undefined;
  if (parts.length >= 3 && /^(?:kpi|step|row|tile)\d+$|^(?:left|right)$/.test(parts[1]!)) return `${parts[0]}.${parts[1]}`;
  return parts[0];
}

/** Editor shapes for one canvas element (text / preset / icon / diagram / image / chart / table / ellipse / line / rect). */
function shapesOf(el: PaintedEl, id: string, pal: ColorPalette, sys: VisualSystem): Shape[] {
  const shad = shadowOf(el, pal);
  if (el.kind === "text") {
    const role = el.fontSize != null && el.fontSize >= sys.typeScale.h1 ? "display" : "body";
    const tr = typeRole(sys, el.caps === "all" ? "kicker" : role, el.fontSize ?? sys.typeScale.body, el.text ?? "");
    const sh: TextShape = {
      ...base(),
      id,
      kind: "text",
      name: el.name,
      bbox: { ...el.bbox },
      wrap: true,
      vAlign: "top",
      paragraphs: [
        {
          align: el.align ?? "start",
          lineHeight: el.lineHeight ?? tr.lineHeight,
          runs: dressRuns(runsOf(el, pal, sys, tr), el, pal),
        },
      ],
      ...(shad ? { shadow: shad } : {}),
      ...effectsOf(el),
    };
    return [sh];
  }
  if (el.kind === "shape" && el.preset) {
    return emitPreset(el, pal, sys, id);
  }
  if (el.kind === "icon" && el.icon) {
    const icon = iconPathShape(el.icon, el.bbox, { id, name: el.name, color: el.color });
    if (!icon) return [];
    const fx = effectsOf(el);
    if ("effects" in fx) icon.effects = fx.effects;
    return [icon];
  }
  if (el.kind === "diagram" && el.diagram) {
    const g = emitDiagram(el, pal, sys, id);
    return g ? [g] : [];
  }
  if (el.kind === "device") {
    // devices are expanded by snap; a raw one here has nothing to draw
    return [];
  }
  if (el.kind === "image") {
    const src = realImageSrc(el.src);
    if (!src) return [];
    const sh: ImageShape = {
      ...base(),
      id,
      kind: "image",
      name: el.name,
      bbox: { ...el.bbox },
      src,
      ...(shad ? { shadow: shad } : {}),
    };
    return [sh];
  }
  if (el.kind === "chart" && el.chart) {
    const sh: ChartShape = {
      ...base(),
      id,
      kind: "chart",
      name: el.name,
      bbox: { ...el.bbox },
      chart: chartDef(el, pal),
    };
    return [sh];
  }
  if (el.kind === "table" && el.table) {
    return [emitTable(el, pal, sys, id)];
  }
  if (el.kind === "ellipse") {
    const sh: EllipseShape = {
      ...base(),
      id,
      kind: "ellipse",
      name: el.name,
      bbox: { ...el.bbox },
      fill: fillOf(el, pal),
      ...(shad ? { shadow: shad } : {}),
    };
    return [sh];
  }
  if (el.kind === "line") {
    const sh: LineShape = {
      ...base(),
      id,
      kind: "line",
      name: el.name,
      bbox: { ...el.bbox },
      x1: el.bbox.x,
      y1: el.bbox.y,
      x2: el.x2 ?? el.bbox.x + el.bbox.w,
      y2: el.y2 ?? el.bbox.y,
      stroke: {
        paint: { kind: "solid", color: el.color },
        width: el.hairline ? Math.max(1, sys.canvas.ruleWidth) : 2,
        ...(el.dash === "dash" ? { dashPreset: "dash" } : el.dash === "dot" ? { dashPreset: "dot" } : {}),
        ...(el.arrow === "end" || el.arrow === "both" ? { tailEnd: { kind: "triangle", w: "med", len: "med" } } : {}),
        ...(el.arrow === "both" ? { headEnd: { kind: "triangle", w: "med", len: "med" } } : {}),
      },
    };
    return [sh];
  }
  const sh: RectShape = {
    ...base(),
    id,
    kind: "rect",
    name: el.name,
    bbox: { ...el.bbox },
    fill: fillOf(el, pal),
    ...(el.rx ? { rx: el.rx, ry: el.rx } : {}),
    ...(shad ? { shadow: shad } : {}),
    ...effectsOf(el),
  };
  return [sh];
}

function toShapes(slide: PaintedSlide, pal: ColorPalette, sys: VisualSystem): Shape[] {
  const out: Shape[] = [];
  const bg = slide.background;
  if (bg?.kind === "image" && ((bg.overlay ?? 0) > 0.001 || bg.scrim)) {
    const color = pal[bg.overlayRole ?? "ink"] ?? pal.ink;
    const overlay: RectShape = {
      ...base(),
      id: shapeId(slide, "photo_scrim", "bg"),
      kind: "rect",
      name: "BG overlay",
      bbox: { x: 0, y: 0, w: CANVAS.width, h: CANVAS.height },
      fill: bg.scrim ? scrimPaint(bg.scrim, color) : { kind: "solid", color, alpha: bg.overlay },
    };
    out.push(overlay);
  }

  for (const [i, el] of slide.elements.entries()) {
    const unit = animUnitOf(el.slot);
    // Slide jump (agenda rows, "see page N"): shape-level hlinkClick with ppaction://hlinksldjump,
    // which the player, serializer, and editor hyperlink dialog already understand.
    const link = el.link && el.link >= 1 ? { kind: "slide" as const, target: String(el.link) } : undefined;
    for (const sh of shapesOf(el, shapeId(slide, el.slot, i), pal, sys)) {
      if (unit) sh.animUnit = unit;
      if (link) sh.hyperlink = { ...link };
      out.push(sh);
    }
  }
  return out;
}

/** Image / linear stay on the slide; solid paper inherits `master.background`. */
function slideBackground(slide: PaintedSlide, pal: ColorPalette): Paint | undefined {
  const bg = slide.background;
  if (bg?.kind === "image") {
    const src = realImageSrc(bg.src);
    if (src) {
      return { kind: "image", src, fit: "cover", ...(bg.alpha != null && bg.alpha < 1 ? { alpha: bg.alpha } : {}) };
    }
    return undefined;
  }
  if (bg?.kind === "linear") {
    const from = pal[bg.paintRole ?? "bg"] ?? pal.bg;
    const to = pal[bg.toRole ?? "accent"] ?? pal.accent;
    return { kind: "linear", angle: bg.angle ?? 90, stops: [{ offset: 0, color: from }, { offset: 1, color: to }] };
  }
  return undefined;
}

export function emitPresentation(
  painted: PaintedSlide[],
  system: VisualSystem,
  theme: ColorTheme,
  title: string,
): Presentation {
  const pal = paletteOf(theme);
  const masters = buildDeckgenMasters(system, theme, painted.map((s) => s.layout));
  const master = masters[0]!;
  const slides: Slide[] = painted.map((s, i) => {
    const background = slideBackground(s, pal);
    const slide: Slide = {
      id: `slide_${i}`,
      name: s.layout,
      index: i,
      layers: [{ id: "layer_main", name: "Main", visible: true, locked: false, shapes: toShapes(s, pal, system) }],
      layoutRef: { masterId: master.id, layoutId: deckgenLayoutId(master.id, s.layout) },
      customData: {
        tags: {
          system: system.id,
          layout: s.layout,
          variant: s.variant,
          theme: theme.id,
          quad: `${system.id}/${s.layout}/${s.variant}/${theme.id}`,
        },
      },
    };
    if (background) slide.background = background;
    if (background?.kind === "image") slide.showMasterSp = false;
    return slide;
  });

  injectDeckgenFonts(system);
  const fontCssLinks = deckgenFontLinks(system);
  const colors = {
    ...pal,
    bg1: pal.bg,
    tx1: pal.ink,
    ...(theme.brand ? { accent: theme.brand } : {}),
    ...(theme.onPhoto ? { onPhoto: theme.onPhoto } : {}),
  };
  return {
    id: `deckgen_${system.id}_${theme.id}`,
    size: { width: CANVAS.width, height: CANVAS.height },
    slides,
    masters,
    theme: {
      id: theme.id,
      name: `${system.id}/${theme.id}`,
      colors,
      fonts: { major: system.fonts.display, minor: system.fonts.body },
    },
    meta: { title, deckgen: { system: system.id, theme: theme.id }, fontCssLinks },
  };
}
