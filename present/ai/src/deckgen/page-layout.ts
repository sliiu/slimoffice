/**
 * Slot layout: the model picks a composition and fills slots (eyebrow, title, lede, one carrier,
 * an optional side element, a takeaway, a footnote); this module decides every coordinate.
 *
 * Why: a flash-tier model writing raw bboxes produced half-empty pages, titles split from their
 * copy, and cards stretched to 400px around two lines of text. Here geometry comes from the
 * composition's regions, and each carrier is sized to what it holds (`fitHeight`) and then placed
 * in its region, so the page reads as one block instead of a header and a void.
 *
 * Output is ordinary canvas elements (text / surface / device / chart / table / diagram), so snap,
 * reflect, paint and emit treat a slot page exactly like an authored one.
 */

import type { Composition } from "./brief.js";
import type { FilledEl } from "./ir.js";
import { expandDevice } from "./devices.js";
import { wrapText } from "./layout-gates.js";
import { CANVAS, MIN_READABLE_PX, type VisualSystem } from "./visual-system.js";
import { textUnits } from "./snap.js";

type Box = FilledEl["bbox"];

/** Compositions the slot layout handles; anchor pages (statement / full-bleed) stay authored. */
export const SLOT_COMPOSITIONS = ["header-stack", "split", "sidebar", "band", "grid"] as const satisfies readonly Composition[];
export type SlotComposition = (typeof SLOT_COMPOSITIONS)[number];

export function isSlotComposition(c: unknown): c is SlotComposition {
  return typeof c === "string" && (SLOT_COMPOSITIONS as readonly string[]).includes(c);
}

export interface PageSlots {
  composition: SlotComposition;
  eyebrow?: string;
  title: string;
  lede?: string;
  /** The page's one carrier (device / chart / table / diagram / image); its bbox is ignored. */
  carrier?: FilledEl;
  /** split / sidebar: a second, smaller element under the lede (calloutNote, a 1–2 item kpiRow, a short text). */
  side?: FilledEl;
  /** One-sentence conclusion, set as a takeaway band under the carrier. */
  takeaway?: string;
  /** Source / method line at the foot of the page. */
  footnote?: string;
}

const TEXT_INSET_X = 19.2;
const TEXT_INSET_Y = 9.6;

/**
 * Column width that sets `title` on one line at h1 by snap's measure (1 unit per CJK glyph), with
 * a glyph of slack. Narrow type columns (split / sidebar) widen to this within their cap, because a
 * title that wraps with one glyph left over is stepped down to h2 by snap and then breaks the
 * deck's single title size.
 */
function oneLineTitleWidth(title: string, sys: VisualSystem): number {
  return Math.ceil((textUnits(title.trim()) + 1) * sys.typeScale.h1 + TEXT_INSET_X + 4);
}

function textHeight(value: string, size: number, w: number, lineHeight: number): number {
  return wrapText(value, size, Math.max(1, w - TEXT_INSET_X)).length * size * lineHeight + TEXT_INSET_Y;
}

function textEl(slot: string, bbox: Box, value: string, size: number, extra: Partial<FilledEl> = {}): FilledEl {
  return { slot, kind: "text", name: `slot:${slot}`, bbox, paintRole: "ink", text: value, fontSize: size, ...extra };
}

/** Eyebrow / title / lede stacked from `y` in a `w`-wide column. Returns the elements and the bottom edge. */
function headerBlock(slots: PageSlots, sys: VisualSystem, x: number, y: number, w: number, ledeW = w): { els: FilledEl[]; bottom: number } {
  const els: FilledEl[] = [];
  const ts = sys.typeScale;
  let cy = y;
  if (slots.eyebrow?.trim()) {
    const size = Math.max(ts.caption, 11);
    const h = textHeight(slots.eyebrow, size, w, 1.3);
    els.push(textEl("eyebrow", { x, y: cy, w, h }, slots.eyebrow.trim(), size, { paintRole: "accent", fontWeight: 600, lineHeight: 1.3 }));
    cy += h + 6;
  }
  // snap forces the `title` slot to h1 (or h2 when two lines of h1 do not fit the column).
  const titleH = textHeight(slots.title, ts.h1, w, 1.2);
  els.push(textEl("title", { x, y: cy, w, h: titleH }, slots.title.trim(), ts.h1, { fontWeight: 600, lineHeight: 1.2 }));
  cy += titleH;
  if (slots.lede?.trim()) {
    cy += 10;
    const size = Math.max(ts.body, MIN_READABLE_PX);
    const h = textHeight(slots.lede, size, ledeW, 1.5);
    els.push(textEl("lede", { x, y: cy, w: ledeW, h }, slots.lede.trim(), size, { paintRole: "muted", lineHeight: 1.5 }));
    cy += h;
  }
  return { els, bottom: cy };
}

/**
 * Header where the lede sits in a right-hand column beside the title instead of under it.
 *
 * A short title ("三个环节里 AI 具体做了什么" at h1 is ≈ 400px of a 1152px column) leaves the whole
 * right half of the header band empty, and the page then reads as a block of type in the top-left
 * corner with a hole next to it — exactly the 768×224 dead rectangle the gate reports on this
 * shape. Two columns use the width the title does not, and the carrier starts higher.
 */
function twoColumnHeader(slots: PageSlots, sys: VisualSystem, x: number, y: number, w: number): { els: FilledEl[]; bottom: number } | undefined {
  const lede = slots.lede?.trim();
  if (!lede) return undefined;
  const ts = sys.typeScale;
  const titleW = Math.min(w, Math.ceil((textUnits(slots.title.trim()) + 1) * ts.h1 + TEXT_INSET_X + 4));
  // Only when the title genuinely leaves a column: a third of the width is the floor for a
  // readable lede column (≈ 30 CJK characters at body size over two lines).
  const gap = 48;
  const restW = w - titleW - gap;
  if (restW < Math.max(w * 0.3, 300)) return undefined;
  const rightX = x + w - restW;
  const size = Math.max(ts.body, MIN_READABLE_PX);
  const els: FilledEl[] = [];
  let cy = y;
  if (slots.eyebrow?.trim()) {
    const eyeSize = Math.max(ts.caption, 11);
    const h = textHeight(slots.eyebrow, eyeSize, titleW, 1.3);
    els.push(textEl("eyebrow", { x, y: cy, w: titleW, h }, slots.eyebrow.trim(), eyeSize, { paintRole: "accent", fontWeight: 600, lineHeight: 1.3 }));
    cy += h + 6;
  }
  const titleH = textHeight(slots.title, ts.h1, titleW, 1.2);
  els.push(textEl("title", { x, y: cy, w: titleW, h: titleH }, slots.title.trim(), ts.h1, { fontWeight: 600, lineHeight: 1.2 }));
  const ledeH = textHeight(lede, size, restW, 1.5);
  els.push(textEl("lede", { x: rightX, y: cy, w: restW, h: ledeH }, lede, size, { paintRole: "muted", lineHeight: 1.5 }));
  // The lede hangs beside the title, not below it: the block ends where the taller column ends.
  return { els, bottom: cy + Math.max(titleH, ledeH) };
}

/** Does every part of an expanded device stay inside the `h`-tall box, with every text fitting its own box (no overflow, no new clipping)? */
function partsFit(parts: FilledEl[], baseline: Set<string>, h: number): boolean {
  for (const p of parts) {
    if (p.bbox.y + p.bbox.h > h + 2 && p.kind !== "line") return false;
    if (p.kind !== "text" || !p.text) continue;
    if (/…$/.test(p.text) && !baseline.has(p.slot)) return false;
    const size = p.fontSize ?? 14;
    const need = wrapText(p.text, size, Math.max(1, p.bbox.w - TEXT_INSET_X)).length * size * (p.lineHeight ?? 1.4);
    if (need > p.bbox.h + 2) return false;
  }
  return true;
}

/** Natural height of a table: header row plus body rows at a readable row height. */
function tableHeight(el: FilledEl, w: number, sys: VisualSystem): number {
  const t = el.table;
  if (!t) return 0;
  const cols = Math.max(1, t.headers.length);
  const colW = w / cols;
  const size = Math.max(sys.typeScale.body, MIN_READABLE_PX);
  const rowH = (row: string[]) => Math.max(44, ...row.map((c) => textHeight(c, size, colW, 1.35) + 14));
  return rowH(t.headers) + t.rows.reduce((a, r) => a + rowH(r), 0);
}

/**
 * Height an element wants inside a `w`-wide region at most `maxH` tall. Devices are expanded at
 * shrinking heights until a text part would overflow or be clipped; charts and diagrams take a
 * comfortable share; tables take their rows.
 */
export function fitHeight(el: FilledEl, w: number, maxH: number, sys: VisualSystem): number {
  if (el.kind === "table") return Math.min(maxH, tableHeight(el, w, sys));
  if (el.kind === "chart") return Math.min(maxH, Math.max(280, w * 0.5));
  if (el.kind === "diagram") return Math.min(maxH, Math.max(260, w * 0.42));
  if (el.kind === "image") return Math.min(maxH, w * 0.6);
  if (el.kind === "text") return Math.min(maxH, textHeight(el.text ?? "", el.fontSize ?? sys.typeScale.body, w, el.lineHeight ?? 1.5));
  if (el.kind !== "device" || !el.device) return maxH;
  const at = (h: number) => expandDevice({ ...el, bbox: { x: 0, y: 0, w, h } }, sys);
  const full = at(maxH);
  if (!full.length) return maxH;
  const baseline = new Set(full.filter((p) => p.kind === "text" && /…$/.test(p.text ?? "")).map((p) => p.slot));
  // Smallest height (16px steps) at which nothing overflows; a floor keeps nodes and cards legible.
  const floor = el.device.type === "takeawayBand" ? 52 : el.device.type === "calloutNote" ? 72 : 96;
  let best = maxH;
  for (let h = maxH; h >= floor; h -= 16) {
    if (partsFit(at(h), baseline, h)) best = h;
    else break;
  }
  // "Fits" is the tightest legal box — cards with no air, numerals squeezed. Give each device the
  // room it reads best at: tiles and KPI cards breathe, a step strip or a band stays compact.
  return Math.min(maxH, Math.round(best * (DEVICE_AIR[el.device.type] ?? 1.3)));
}

/** Height multiplier over the tightest fit, per device. */
const DEVICE_AIR: Record<string, number> = {
  kpiRow: 1.7,
  // 2× made 2×2 tiles 190px tall around three lines of type (eval 2026-11-05).
  iconLabelGrid: 1.5,
  numberedList: 1.5,
  agendaList: 1.5,
  comparePlanes: 1.35,
  stepStrip: 1.3,
  quoteBlock: 1.2,
  calloutNote: 1,
  takeawayBand: 1,
};

function place(el: FilledEl, slot: string, bbox: Box): FilledEl {
  return { ...el, slot, name: `slot:${slot}`, bbox };
}

/**
 * When a carrier's natural height leaves more than this share of its region empty, it grows into
 * the slack instead of sitting high with a void under it. Below the threshold the void is small
 * enough to read as margin, which is what `bias` is for.
 */
const CARRIER_GROW_AT = 0.28;
/** Ceiling on that growth: tables and charts get air, not a poster. */
const CARRIER_GROW_MAX = 1.6;

/** Elements for one slot page. Pure: same slots + system → same geometry. */
export function layoutPage(slots: PageSlots, sys: VisualSystem): FilledEl[] {
  const W = CANVAS.width;
  const H = CANVAS.height;
  const mx = Math.round(W * sys.grid.margin);
  const my = Math.round(H * sys.grid.margin);
  const left = mx;
  const right = W - mx;
  const contentW = right - left;
  const out: FilledEl[] = [];

  // Foot: footnote at the bottom margin, leaving the right corner for the folio.
  let footTop = H - my;
  if (slots.footnote?.trim()) {
    const size = Math.max(sys.typeScale.caption, 11);
    const h = textHeight(slots.footnote, size, contentW - 120, 1.35);
    footTop = H - my - h;
    out.push(textEl("footnote", { x: left, y: footTop, w: contentW - 120, h }, slots.footnote.trim(), size, { paintRole: "muted", lineHeight: 1.35 }));
  } else {
    footTop = H - my - 24; // folio row
  }

  /**
   * Carrier (+ takeaway band) as one group in `region`; `bias` < 0.5 sits above centre (optical
   * centre). `grow` = let a short carrier expand into the slack instead of leaving a void under
   * it — single-column compositions where the carrier owns the page width; a split page keeps its
   * columns on one top line and its carrier at its natural height.
   */
  const carrierGroup = (region: Box, bias = 0.35, grow = true, growBias = 0.5): { els: FilledEl[]; top: number; h: number } => {
    const els: FilledEl[] = [];
    const bandH = slots.takeaway?.trim() ? 56 : 0;
    const bandGap = bandH ? 24 : 0;
    const roomForCarrier = region.h - bandH - bandGap;
    // A carrier sized to its content (a 4-row table at 44px/row, a chart's comfortable share) can
    // leave a third of the region empty; `bias` then hands most of that gap to the bottom of the
    // page, which reads as "content piled at the top". Grow the carrier into the slack instead —
    // rows get air, the chart gets height — up to a cap so a 3-row table cannot become a poster.
    const natural = slots.carrier ? fitHeight(slots.carrier, region.w, roomForCarrier, sys) : 0;
    // A diagram places its nodes at fixed fractions of the box (core's process layout draws cards at
    // 25–75 % of the height), so a taller box is a taller empty card around the same type — growth
    // there turns the carrier into blank space. Devices are different now that their rows centre
    // their own copy: a taller box only widens the air between rows, which is the point of growth.
    const selfCentring = slots.carrier?.kind === "diagram";
    // A chart's natural height is a fraction of its width, a table's is its rows, and a step strip's
    // is its node plus two lines — so each comes out short in a narrow column. A split page's right
    // column is ~half the page, and its carrier then stopped a third of the way down (live run
    // 2026-11-09: a chart, a table, and a four-step strip). All three fill the box they are given — a
    // taller chart is a taller plot, a taller table is air between rows, a taller strip spreads its
    // steps — so they grow on any real gap, without the 1.6× cap that keeps a card grid from becoming
    // a poster.
    const fillsItsBox = slots.carrier?.kind === "chart" || slots.carrier?.kind === "table" || slots.carrier?.device?.type === "stepStrip";
    const trigger = fillsItsBox ? 48 : region.h * CARRIER_GROW_AT;
    const growable = grow && !selfCentring && natural > 0 && roomForCarrier - natural > trigger;
    const cap = fillsItsBox ? roomForCarrier : natural * CARRIER_GROW_MAX;
    const cH = growable ? Math.min(roomForCarrier, cap) : natural;
    const groupH = cH + (cH && bandH ? bandGap : 0) + bandH;
    // After growing, centre the block: the remaining slack is small and splits evenly, so the page
    // reads as one composition rather than a header and a footnote with a hole between them. A
    // split page passes `growBias` 0 instead: its two columns must start on one line, so the grown
    // carrier still begins at the region top and takes the height downward.
    const biasUsed = growable || (grow && selfCentring) ? growBias : bias;
    const top = region.y + Math.max(0, (region.h - groupH) * biasUsed);
    if (slots.carrier) els.push(place(slots.carrier, "carrier", { x: region.x, y: top, w: region.w, h: cH }));
    if (bandH) {
      els.push({
        slot: "takeaway",
        kind: "device",
        name: "slot:takeaway",
        bbox: { x: region.x, y: top + cH + (cH ? bandGap : 0), w: region.w, h: bandH },
        paintRole: "accent",
        device: { type: "takeawayBand", text: slots.takeaway!.trim() },
      });
    }
    return { els, top, h: groupH };
  };

  switch (slots.composition) {
    case "header-stack": {
      // A short title leaves half the header band empty; the lede moves beside it when there is a
      // column for it (see `twoColumnHeader`).
      const head = twoColumnHeader(slots, sys, left, my + 24, contentW) ?? headerBlock(slots, sys, left, my + 24, contentW, Math.min(contentW, 900));
      out.push(...head.els);
      const regionTop = head.bottom + 32;
      out.push(...carrierGroup({ x: left, y: regionTop, w: contentW, h: footTop - 24 - regionTop }).els);
      if (slots.side) {
        // header-stack has no side column: a side element goes under the carrier group as a note.
        const last = out.filter((e) => e.slot === "carrier" || e.slot === "takeaway").reduce((a, e) => Math.max(a, e.bbox.y + e.bbox.h), regionTop);
        const room = footTop - 16 - (last + 20);
        if (room >= 64) {
          const h = fitHeight(slots.side, contentW, Math.min(room, 140), sys);
          out.push(place(slots.side, "side", { x: left, y: last + 20, w: contentW, h }));
        }
      }
      break;
    }
    case "grid": {
      // Same header rule as header-stack: a short title leaves the top-right corner empty, so the
      // lede moves beside it when there is room for the column.
      const head = twoColumnHeader(slots, sys, left, my + 24, contentW) ?? headerBlock(slots, sys, left, my + 24, contentW, Math.min(contentW, 900));
      out.push(...head.els);
      const regionTop = head.bottom + 32;
      out.push(...carrierGroup({ x: left, y: regionTop, w: contentW, h: footTop - 24 - regionTop }).els);
      if (slots.side) {
        // header-stack has no side column: a side element goes under the carrier group as a note.
        const last = out.filter((e) => e.slot === "carrier" || e.slot === "takeaway").reduce((a, e) => Math.max(a, e.bbox.y + e.bbox.h), regionTop);
        const room = footTop - 16 - (last + 20);
        if (room >= 64) {
          const h = fitHeight(slots.side, contentW, Math.min(room, 140), sys);
          out.push(place(slots.side, "side", { x: left, y: last + 20, w: contentW, h }));
        }
      }
      break;
    }
    case "band": {
      // Header set inside a full-width surface band; the carrier sits on the paper below.
      const head = headerBlock(slots, sys, left, my + 20, contentW, Math.min(contentW, 900));
      const bandBottom = head.bottom + 28;
      out.push({ slot: "band", kind: "surface", name: "slot:band", bbox: { x: 0, y: 0, w: W, h: bandBottom }, paintRole: "surface" });
      out.push(...head.els);
      const regionTop = bandBottom + 36;
      out.push(...carrierGroup({ x: left, y: regionTop, w: contentW, h: footTop - 24 - regionTop }).els);
      break;
    }
    case "split": {
      // Type column left (≈ 1/3), carrier right; both columns start on one line, and the pair is
      // placed as one block in the page height.
      const colW = Math.round(Math.min(contentW * 0.42, Math.max(contentW * 0.34, oneLineTitleWidth(slots.title, sys))));
      const gutter = 48;
      const rx = left + colW + gutter;
      const rw = right - rx;
      const regionTop = my + 24;
      const regionH = footTop - 24 - regionTop;
      const head = headerBlock(slots, sys, left, 0, colW);
      // `growBias` 0 keeps the grown carrier on the column's top line: a split page aligns its two
      // columns on one baseline, so growth must extend downward, not recentre.
      const right0 = carrierGroup({ x: rx, y: 0, w: rw, h: regionH }, 0, true, 0);
      let sideH = 0;
      if (slots.side) sideH = fitHeight(slots.side, colW, Math.max(80, regionH - head.bottom - 24), sys);
      const blockH = Math.max(head.bottom + (sideH ? 24 + sideH : 0), right0.h);
      // Start on the same top line as every other content page. Centring the pair dropped this
      // page's title ~70px below its neighbours, so the title jumped when the deck was flipped
      // (live review 2026-11-09). The carrier grows downward from this line, so the slack goes
      // under the content instead of above the title.
      const top = regionTop;
      for (const e of head.els) out.push({ ...e, bbox: { ...e.bbox, y: e.bbox.y + top } });
      if (slots.side) {
        // A ledger column over a tall carrier: pinning the note 24px under the lede left the whole
        // lower half of the column blank (review 2026-11-08: "左栏 40% 处就结束了"). Centre it in
        // the space the block leaves, which splits one big void into two margins.
        const room = blockH - head.bottom;
        const y = room > sideH + 48 ? head.bottom + (room - sideH) / 2 : head.bottom + 24;
        out.push(place(slots.side, "side", { x: left, y: top + y, w: colW, h: sideH }));
      }
      for (const e of right0.els) out.push({ ...e, bbox: { ...e.bbox, y: e.bbox.y + top } });
      // Hairline between the columns, as tall as the block.
      out.push({ slot: "divider", kind: "rule", name: "slot:divider", bbox: { x: left + colW + gutter / 2 - 0.5, y: top, w: 1, h: blockH }, paintRole: "line", hairline: true });
      break;
    }
    case "sidebar": {
      // A tinted panel owns the left quarter: eyebrow, title, lede, side element. Carrier right.
      // Wide enough for a ten-character CJK title at h1 on one line (snap would otherwise step it to h2).
      const panelW = Math.round(Math.min(mx + contentW * 0.38 + 24, Math.max(mx + contentW * 0.3 + 24, mx + oneLineTitleWidth(slots.title, sys) + 28)));
      out.push({ slot: "panel", kind: "surface", name: "slot:panel", bbox: { x: 0, y: 0, w: panelW, h: H }, paintRole: "surface" });
      const colW = panelW - mx - 28;
      // The title starts where every other content page's title starts. Centring the whole stack in
      // the full-height panel dropped this page's title a quarter of the page below its neighbours,
      // so flipping pages made the title jump (live review 2026-11-09, page 07). The note, not the
      // title, takes the slack: it sits in the room the panel leaves under the header.
      const headTop = my + 24;
      const head = headerBlock(slots, sys, left, headTop, colW);
      out.push(...head.els);
      if (slots.side) {
        const sideH = fitHeight(slots.side, colW, Math.min(H - my - (head.bottom + 28), 260), sys);
        const room = H - my - 24 - head.bottom;
        const y = room > sideH + 64 ? head.bottom + (room - sideH) / 2 : head.bottom + 28;
        out.push(place(slots.side, "side", { x: left, y, w: colW, h: sideH }));
      }
      const rx = panelW + 48;
      const regionTop = my + 24;
      // The footnote spans the content area; keep it out of the panel.
      for (const e of out) if (e.slot === "footnote") e.bbox = { ...e.bbox, x: rx, w: right - rx - 120 };
      out.push(...carrierGroup({ x: rx, y: regionTop, w: right - rx, h: footTop - 24 - regionTop }).els);
      break;
    }
  }
  return out;
}
