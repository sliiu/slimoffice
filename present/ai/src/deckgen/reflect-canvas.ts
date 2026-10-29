/**
 * Canvas-path completeness check. Invented jobs, radius, shadow, gradient,
 * and brand hex are allowed. Empty photo frames are not.
 *
 * With a Design Brief the check also asks the ppt-master question —
 * "you said these points are ordered: where is the geometry?" — so the
 * repair pass has a reason, not just a rule.
 */

import type { ColorTheme } from "./color-theme.js";
import { paletteOf } from "./color-theme.js";
import { CANVAS, MAX_CAPTION_CHARS, MIN_READABLE_PX, type VisualSystem } from "./visual-system.js";
import { NUMERIC_VALUE, canvasTypeRamp, contentTitleSize, findContentTitle, isContentPage, pageNumeralOf as pageNumeral, realImageSrc, textUnits } from "./snap.js";
import type { PaintedEl, PaintedSlide } from "./apply-theme.js";
import { structureOf } from "./compare.js";
import type { ReflectFinding, ReflectResult } from "./reflect.js";
import { COMPOSITION_HINTS, RELATIONSHIP_CARRIERS, type Composition, type PageBrief } from "./brief.js";
import { formatCopyVoiceHits, lintCopyVoice } from "../generate/copy-voice.js";

/** Element kinds that carry a relationship in geometry (not just type). */
const GEOMETRY_KINDS = new Set(["shape", "line", "diagram", "chart", "ellipse"]);
/** Share of the smaller text box that another free text box may cover before it counts as a collision. */
const TEXT_COLLISION_RATIO = 0.25;

function hasText(e: PaintedEl): boolean {
  return e.kind === "text" && Boolean((e.text ?? "").trim());
}

/** Device expanders name parts `<slot>.<part>`; several parts → geometry was carried. */
function deviceParts(s: PaintedSlide): number {
  // `.num` covers the numeral-led rows of agendaList (no badge surface — the numeral is the marker),
  // which the finding text itself names as the carrier for order on an agenda page.
  return s.elements.filter((e) => /\.(node|badge|card|band|plane|num|tile\d+\.card|kpi\d+\.card)$/.test(e.slot)).length;
}

function carriesRelationship(s: PaintedSlide): boolean {
  if (s.elements.some((e) => GEOMETRY_KINDS.has(e.kind))) return true;
  // A multi-column table with rows is structure (contrast across columns, membership down rows).
  if (s.elements.some((e) => e.kind === "table" && (e.table?.headers.length ?? 0) >= 2 && (e.table?.rows.length ?? 0) >= 2)) return true;
  if (deviceParts(s) >= 2) return true;
  // two or more surfaces with type inside also reads as structure
  const surfaces = s.elements.filter((e) => e.kind === "surface");
  return surfaces.length >= 2;
}

function hasAnchorWeight(s: PaintedSlide, sys: VisualSystem): boolean {
  if (s.background?.kind === "image" && realImageSrc(s.background.src)) return true;
  if (s.elements.some((e) => e.kind === "image" && realImageSrc(e.src) && e.bbox.w * e.bbox.h > CANVAS.width * CANVAS.height * 0.3)) return true;
  return s.elements.some((e) => hasText(e) && (e.fontSize ?? 0) >= sys.typeScale.h1 * 1.4);
}

export function reflectCanvas(
  slides: PaintedSlide[],
  system: VisualSystem,
  theme: ColorTheme,
  briefs?: Array<PageBrief | undefined>,
): ReflectResult {
  const findings: ReflectFinding[] = [];
  const pal = paletteOf(theme);
  const allowed = new Set(
    [...Object.values(pal), theme.brand, theme.onPhoto].filter(Boolean).map((c) => c!.toLowerCase()),
  );
  const mx = CANVAS.width * system.grid.margin;
  const my = CANVAS.height * system.grid.margin;
  const ramp = new Set(canvasTypeRamp(system));

  if (slides.length === 0) {
    findings.push({ kind: "coherence", slideIdx: -1, issue: "empty deck" });
    return { passed: false, findings };
  }

  let denseRun = 0;
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i]!;
    const bg = s.background;
    if (bg?.kind === "image" && !realImageSrc(bg.src)) {
      findings.push({ kind: "content", slideIdx: i, issue: "photo canvas missing real src" });
    }
    const hasPayload = s.elements.some(
      (e) =>
        hasText(e) ||
        e.kind === "chart" ||
        e.kind === "table" ||
        e.kind === "diagram" ||
        (e.kind === "image" && realImageSrc(e.src)),
    );
    if (!hasPayload) findings.push({ kind: "content", slideIdx: i, issue: "page has no type, chart, table, diagram, or photo" });

    for (const el of s.elements) {
      if (el.kind === "image" && !realImageSrc(el.src)) {
        findings.push({ kind: "content", slideIdx: i, issue: `empty image ${el.name}` });
      }
      if (el.kind === "text") {
        const b = el.bbox;
        if (b.x < mx - 0.5 || b.y < my - 0.5 || b.x + b.w > CANVAS.width - mx + 0.5 || b.y + b.h > CANVAS.height - my + 0.5) {
          findings.push({ kind: "design", slideIdx: i, issue: `type past 5% inset (${el.name})` });
        }
        if (el.fontSize != null && !ramp.has(el.fontSize)) {
          findings.push({ kind: "design", slideIdx: i, issue: `font ${el.fontSize} off canvas ramp` });
        }
        if (el.color && !allowed.has(el.color.toLowerCase())) {
          findings.push({ kind: "design", slideIdx: i, issue: `text color ${el.color} not in deck palette` });
        }
      }
    }

    // Device copy that snap had to clip (title 48 / note 48 / body 120 chars) ends in an ellipsis;
    // ask for a shorter phrase rather than shipping a sentence that trails off.
    for (const e of s.elements) {
      if (e.kind === "text" && e.slot.includes(".") && /…$/.test(e.text ?? "")) {
        findings.push({
          kind: "content",
          slideIdx: i,
          issue: `device text was clipped: “${e.text}” (${e.slot}) — the phrase does not fit its row / card at this size; cut it to a shorter one (about ${Math.max(8, Math.round((e.text ?? "").length * 0.7))} chars, or fewer items on the page)`,
        });
      }
    }

    // Two free-standing text blocks sharing the same ground (a "↩ contents" mark drawn on top of the
    // footnote) print as one smeared line. Device parts are laid out by the expander and skipped.
    const freeTexts = s.elements.filter((e) => hasText(e) && !e.slot.includes("."));
    for (let a = 0; a < freeTexts.length; a++) {
      for (let b = a + 1; b < freeTexts.length; b++) {
        const ea = freeTexts[a]!;
        const eb = freeTexts[b]!;
        const ox = Math.min(ea.bbox.x + ea.bbox.w, eb.bbox.x + eb.bbox.w) - Math.max(ea.bbox.x, eb.bbox.x);
        const oy = Math.min(ea.bbox.y + ea.bbox.h, eb.bbox.y + eb.bbox.h) - Math.max(ea.bbox.y, eb.bbox.y);
        if (ox <= 0 || oy <= 0) continue;
        const smaller = Math.min(ea.bbox.w * ea.bbox.h, eb.bbox.w * eb.bbox.h);
        if (smaller > 0 && (ox * oy) / smaller >= TEXT_COLLISION_RATIO) {
          findings.push({
            kind: "design",
            slideIdx: i,
            issue: `text “${(ea.text ?? "").slice(0, 24)}” overlaps text “${(eb.text ?? "").slice(0, 24)}” — move one so their boxes do not intersect`,
          });
        }
      }
    }

    // "70+" as an h2 tile title reads like a label; a metrics page wants kpiRow, where the value
    // is display-size and the label sits under it.
    const numericTiles = s.elements.filter((e) => hasText(e) && /\.(tile|row)\d+\.title$/.test(e.slot) && NUMERIC_VALUE.test((e.text ?? "").trim()));
    if (numericTiles.length >= 3) {
      findings.push({
        kind: "design",
        slideIdx: i,
        issue: `${numericTiles.length} tiles are titled with bare numbers (${numericTiles.map((e) => `“${e.text}”`).join(", ")}) — numbers read first: carry them as a kpiRow device (items[{value, title, note?}]) instead`,
      });
    }

    // Readability floor: a real sentence set below 13px is unreadable at 1280×720 projection.
    // Short labels (eyebrows, numerals, attributions) are allowed at caption size.
    for (const e of s.elements) {
      if (e.kind !== "text" || !e.text) continue;
      const len = [...e.text.trim()].length;
      if ((e.fontSize ?? system.typeScale.body) < MIN_READABLE_PX && len > MAX_CAPTION_CHARS) {
        findings.push({
          kind: "design",
          slideIdx: i,
          issue: `${e.fontSize}px copy is below the ${MIN_READABLE_PX}px readability floor (${e.slot}, ${len} chars) — set it at body=${system.typeScale.body}px or cut it to a label`,
        });
      }
    }

    // "Four pillars" over five tiles is the kind of slip a client catches on the spot.
    const promised = titleCount(s, system);
    if (promised) {
      const counts = deviceItemCounts(s);
      if (counts.length && !counts.includes(promised.n)) {
        findings.push({
          kind: "content",
          slideIdx: i,
          issue: `title promises ${promised.n} (“${promised.word}”) but the page carries ${counts.join("/")} items — match the count or reword the title`,
        });
      }
    }

    // comparePlanes with points on one side only reads as "right half unfinished".
    for (const [dev, sides] of planePoints(s)) {
      const l = sides.left;
      const r = sides.right;
      if ((l >= 2 && r === 0) || (r >= 2 && l === 0)) {
        findings.push({
          kind: "content",
          slideIdx: i,
          issue: `${dev}: compare planes are unbalanced (left ${l} points, right ${r}) — give both sides parallel points`,
        });
      }
    }

    // Flat type hierarchy: ≥ 3 text objects and nothing reaches h2 → no entry point on the page.
    const texts = s.elements.filter((e) => e.kind === "text" && e.text && e.text.trim());
    if (texts.length >= 3) {
      const largest = Math.max(...texts.map((e) => e.fontSize ?? system.typeScale.body));
      if (largest < system.typeScale.h2) {
        findings.push({
          kind: "design",
          slideIdx: i,
          issue: `flat type hierarchy — largest text is ${largest}px; give the page one title at h1=${system.typeScale.h1}px and labels at caption=${system.typeScale.caption}px`,
        });
      }
    }

    const brief = briefs?.[i];
    if (brief) {
      const rel = brief.relationships;
      if (rel && rel !== "none" && !carriesRelationship(s)) {
        findings.push({
          kind: "design",
          slideIdx: i,
          issue: `brief says relationships=${rel} but the page is type only — carry it with ${RELATIONSHIP_CARRIERS[rel]}`,
        });
      }
      if (brief.rhythm === "anchor" && !hasAnchorWeight(s, system)) {
        findings.push({ kind: "design", slideIdx: i, issue: "anchor page has neither display type nor a photo field" });
      }
      if (brief.composition) {
        const miss = compositionCheck(s, brief.composition, system);
        if (miss) findings.push({ kind: "design", slideIdx: i, issue: miss });
      }
      // A dense page that delivers a title, a lede and one callout reads as unfinished next to
      // its neighbours. Measure the field below the header row.
      if (brief.rhythm === "dense") {
        const cov = fieldCoverage(s);
        if (cov < MIN_DENSE_FIELD_COVERAGE) {
          findings.push({
            kind: "design",
            slideIdx: i,
            issue: `dense page covers only ${Math.round(cov * 100)}% of the field below the header — carry the key points as a device / diagram / table instead of one line`,
          });
        }
      }
      if (brief.rhythm === "dense") {
        denseRun++;
        if (denseRun === 4) findings.push({ kind: "coherence", slideIdx: i, issue: "four dense pages in a row — give one page room to breathe" });
      } else {
        denseRun = 0;
      }
      // Reading load ceiling: five 30-character descriptions + subtitle + footnote + callout on one
      // photo is a page nobody reads. Cap the running copy (everything below h2) per rhythm.
      const load = readingLoad(s, system);
      const cap = readingCap(brief.rhythm, s.background?.kind === "image");
      if (load.units > cap || load.blocks > MAX_COPY_BLOCKS) {
        findings.push({
          kind: "design",
          slideIdx: i,
          issue: `page carries ~${Math.round(load.units)} characters of copy in ${load.blocks} blocks (cap ${cap} / ${MAX_COPY_BLOCKS} for a ${brief.rhythm ?? "default"}${s.background?.kind === "image" ? " photo" : ""} page) — cut each description to one phrase, move provenance to notes, or split the page`,
        });
      }
      if (brief.carrier === "chart" && !s.elements.some((e) => e.kind === "chart")) {
        findings.push({ kind: "content", slideIdx: i, issue: "brief asks for a chart carrier; none on the page" });
      }
      if (brief.carrier === "table" && !s.elements.some((e) => e.kind === "table")) {
        findings.push({ kind: "content", slideIdx: i, issue: "brief asks for a table carrier; none on the page" });
      }
      // photo carrier = the photograph is the page. A gradient field with a rounded "figure" frame and
      // no image is the model skipping the imageIdea — the same miss as a chart page without a chart.
      if (brief.carrier === "photo" && s.background?.kind !== "image" && !s.elements.some((e) => e.kind === "image")) {
        findings.push({
          kind: "content",
          slideIdx: i,
          issue: "brief asks for a photo carrier; the page has neither an image background nor an image element — set background { kind: \"image\", src: \"PHOTO\", scrim }",
        });
      }
    }
  }

  const fingerprints = slides.map((s) =>
    JSON.stringify(structureOf([s])[0]?.elements.map((e) => `${e.kind}:${Math.round(e.w)}x${Math.round(e.h)}`)),
  );
  const unique = new Set(fingerprints);
  if (slides.length >= 3 && unique.size === 1) {
    findings.push({ kind: "coherence", slideIdx: -1, issue: "every page uses the same composition" });
  }

  // Header run: the same eyebrow/title/deck stack on ≥ 3 consecutive pages is what makes a deck
  // read as one template even when the lower two thirds differ.
  const headers = slides.map(headerFingerprint);
  let run = 1;
  for (let i = 1; i < headers.length; i++) {
    run = headers[i] && headers[i] === headers[i - 1] ? run + 1 : 1;
    if (run === 3) {
      const want = briefs?.[i]?.composition;
      findings.push({
        kind: "coherence",
        slideIdx: i,
        issue: `same header stack on pages ${i - 2}–${i} — break the run here${want ? ` with composition=${want} (${COMPOSITION_HINTS[want]})` : ": move the title into a side column, a band, or drop the header row for a statement"}`,
      });
    }
  }

  // Page numerals the author wrote ("02", "06") must count up with the pages; a repeated or
  // skipped number makes the reader suspect a missing slide.
  const numerals = slides.map(pageNumeralOf);
  const withNum = numerals
    .map((el, i) => ({ el, i }))
    .filter((x): x is { el: PaintedEl; i: number } => x.el != null)
    .map(({ el, i }) => ({ el, n: Number(el.text!.trim().split("/")[0]), i }));
  if (withNum.length >= 3) {
    const offsets = [1, 0];
    const fits = offsets.some((off) => withNum.every(({ n, i }) => n === i + off));
    if (!fits) {
      const off = withNum.some(({ n, i }) => n === i + 1) ? 1 : 0;
      const badPages = withNum.filter(({ n, i }) => n !== i + off);
      const bad = badPages.map(({ n, i }) => `page ${i} shows ${n} (expected ${i + off})`);
      findings.push({
        kind: "coherence",
        slideIdx: -1,
        issue: `page numerals do not count up: ${bad.join("; ")} — number every page in order or drop the numerals`,
        pages: badPages.map(({ i }) => i),
      });
    }
    // One folio system: the same size on every page. A lone 24px orange "05" among 12px eyebrows
    // reads as a KPI, and the wayfinding disappears exactly where it is needed.
    const sizes = new Map<number, number[]>();
    for (const { el, i } of withNum) {
      const s = el.fontSize ?? 0;
      sizes.set(s, [...(sizes.get(s) ?? []), i]);
    }
    if (sizes.size > 1) {
      const [mode] = [...sizes.entries()].sort((a, b) => b[1].length - a[1].length)[0]!;
      const oddEntries = [...sizes.entries()].filter(([s]) => s !== mode);
      const odd = oddEntries.map(([s, pages]) => `page ${pages.join(", ")} at ${s}px`);
      findings.push({
        kind: "coherence",
        slideIdx: -1,
        issue: `page numerals change size (${odd.join("; ")}; the rest at ${mode}px) — one folio size across the deck`,
        pages: oddEntries.flatMap(([, pages]) => pages),
      });
    }
  }

  // Deck-level backstop for the snap rule: content-page titles share one size. Snap forces the
  // `title` slot; this catches titles the author filed under another slot name.
  const titles = slides.map((s, i) => (isContentPage(s.layout, briefs?.[i]) ? findContentTitle(s.elements, system) : undefined));
  const titleSizes = titles.map((t) => t?.fontSize);
  const present = titleSizes.filter((n): n is number => n != null);
  const distinct = [...new Set(present)];
  if (distinct.length > 1) {
    const target = distinct.includes(system.typeScale.h1) ? system.typeScale.h1 : mode(present);
    // A title snap itself stepped to the next rung because h1 does not fit its column (a split
    // page's narrow left third) is the compiler's decision, not the author's — no repair can
    // change it short of rewriting the title, so it does not count as an off-size page.
    const offIdx = titles
      .map((t, i) => (t?.fontSize != null && t.fontSize !== target && t.fontSize !== contentTitleSize(system, t.text ?? "", t.bbox) ? i : -1))
      .filter((i) => i >= 0);
    if (offIdx.length) {
      findings.push({
        kind: "coherence",
        slideIdx: -1,
        issue: `content-page titles are set at ${distinct.sort((a, b) => a - b).join("/")}px — one section-title size across the deck: set pages ${offIdx.map((i) => `${i} (${titleSizes[i]}px)`).join(", ")} to ${target}px (system h1=${system.typeScale.h1}px)`,
        pages: offIdx,
      });
    }
  }

  // Copy voice: launch-copy words, copy that narrates the slide's own design, exclamation marks
  // per page; antithesis titles ("X 不是 Y" / "not X, it's Y") deck-wide, one tolerated.
  const pageTitles: string[] = [];
  for (let i = 0; i < slides.length; i++) {
    const texts = slides[i]!.elements.filter((e): e is PaintedEl & { text: string } => e.kind === "text" && !!e.text?.trim());
    const largest = texts.reduce<(PaintedEl & { text: string }) | undefined>((a, b) => (!a || (b.fontSize ?? 0) > (a.fontSize ?? 0) ? b : a), undefined);
    pageTitles.push(largest?.text ?? "");
    const hits = lintCopyVoice({ body: texts.map((t) => t.text) });
    for (const line of formatCopyVoiceHits(hits.filter((h) => h.rule !== "antithesis")).slice(0, 3)) {
      findings.push({ kind: "content", slideIdx: i, issue: `copy voice — ${line}` });
    }
  }
  const antithesis = lintCopyVoice({ titles: pageTitles }).filter((h) => h.rule === "antithesis");
  if (antithesis.length) {
    const pages = pageTitles.map((t, i) => (antithesis.some((h) => t.replace(/\s+/g, " ").trim().startsWith(h.text.replace(/…$/, ""))) ? i : -1)).filter((i) => i >= 0);
    findings.push({
      kind: "content",
      slideIdx: -1,
      issue: `copy voice — ${antithesis.length} titles are framed as a negation / antithesis (${antithesis.map((h) => `"${h.text}"`).join(", ")}); keep at most one, the rest should say what the page shows`,
      pages,
    });
  }

  return { passed: findings.length === 0, findings };
}

const CJK_NUMERALS: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const EN_NUMERALS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
/** CJK numeral + classifier ("四个", "五步", "三大") or English numeral + plural noun ("four pillars"). */
const CJK_COUNT = /([一两二三四五六七八九十]|\d)\s*(个(?!\s*(?:月|周|星期|小时|季度|百分点|人|天|年|亿|万|千|米|公里|字))|大|种|步|类|层|条|项|点(?!\s*[钟半])|招|要素|阶段|支柱)/u;
const EN_COUNT =
  /\b(two|three|four|five|six|seven|eight|nine|ten|\d)\s+(?:key\s+|core\s+|main\s+|big\s+)?(?:pillars|steps|stages|phases|reasons|ways|layers|points|principles|risks|benefits|levers|rules|questions|moves|drivers|shifts|gaps|challenges|priorities|elements|factors|dimensions|trends|lessons|takeaways|paths|options|scenarios|models|modes|types|kinds)\b/i;

/** The count a content-page title promises ("四个失血点" → 4, "Five pillars" → 5), 2–10 only. */
function titleCount(s: PaintedSlide, system: VisualSystem): { n: number; word: string } | undefined {
  const title = findContentTitle(s.elements, system);
  const text = title?.text?.trim();
  if (!text) return undefined;
  const cjk = CJK_COUNT.exec(text);
  const m = cjk ?? EN_COUNT.exec(text);
  if (!m) return undefined;
  const tok = m[1]!.toLowerCase();
  const n = /^\d+$/.test(tok) ? Number(tok) : (CJK_NUMERALS[tok] ?? EN_NUMERALS[tok]);
  if (!n || n < 2 || n > 10) return undefined;
  return { n, word: m[0]!.trim() };
}

/** Item counts of every list-like device on the page, via expanded part slots `${dev}.tile3.title`. */
function deviceItemCounts(s: PaintedSlide): number[] {
  const perDevice = new Map<string, Set<number>>();
  for (const e of s.elements) {
    const m = /^(.+)\.(?:tile|step|row|kpi)(\d+)\./.exec(e.slot);
    if (!m) continue;
    const set = perDevice.get(m[1]!) ?? new Set<number>();
    set.add(Number(m[2]));
    perDevice.set(m[1]!, set);
  }
  const counts = [...perDevice.values()].map((set) => set.size);
  // Hand-laid grids: equal-size surfaces (cards) and small icons (tile markers) count too.
  const cards = new Map<string, number>();
  let icons = 0;
  for (const e of s.elements) {
    if (e.slot.includes(".")) continue; // device parts already counted
    if (e.kind === "surface" && e.bbox.w < CANVAS.width * 0.6) {
      const k = `${Math.round(e.bbox.w / 4)}x${Math.round(e.bbox.h / 4)}`;
      cards.set(k, (cards.get(k) ?? 0) + 1);
    } else if (e.kind === "icon") icons += 1;
  }
  counts.push(...cards.values(), icons);
  return [...new Set(counts.filter((n) => n >= 2))];
}

/** Points per side of every comparePlanes device on the page (expanded part slots `${dev}.left.p0`). */
function planePoints(s: PaintedSlide): Map<string, { left: number; right: number }> {
  const out = new Map<string, { left: number; right: number }>();
  for (const e of s.elements) {
    const m = /^(.+)\.(left|right)\.(plane|p\d+)$/.exec(e.slot);
    if (!m) continue;
    const entry = out.get(m[1]!) ?? { left: 0, right: 0 };
    if (m[3] !== "plane") entry[m[2] as "left" | "right"] += 1;
    out.set(m[1]!, entry);
  }
  return out;
}

/** Page numeral heuristic shared with snap (which strips / injects folios). */
function pageNumeralOf(s: PaintedSlide): PaintedEl | undefined {
  return pageNumeral(s.elements);
}

/** Running-copy blocks (≥ 8 units each) a page may carry before it stops being read. */
export const MAX_COPY_BLOCKS = 16;
/** Reading-load caps in CJK-equivalent characters (latin ≈ 0.58 each) for copy below h2. */
export const READING_CAP = { dense: 320, default: 260, breathing: 210 } as const;

/** Copy below h2 on a page: total units and the number of blocks worth reading (≥ 8 units). */
function readingLoad(s: PaintedSlide, system: VisualSystem): { units: number; blocks: number } {
  let units = 0;
  let blocks = 0;
  for (const e of s.elements) {
    if (e.kind !== "text" || !e.text) continue;
    if ((e.fontSize ?? system.typeScale.body) >= system.typeScale.h2) continue;
    const u = textUnits(e.text.trim());
    if (!u) continue;
    units += u;
    if (u >= 8) blocks += 1;
  }
  return { units, blocks };
}

function readingCap(rhythm: PageBrief["rhythm"], onPhoto: boolean): number {
  const base = rhythm === "dense" ? READING_CAP.dense : rhythm === "breathing" ? READING_CAP.breathing : READING_CAP.default;
  return Math.round(onPhoto ? base * 0.7 : base);
}

/** Below this share of the lower two-thirds, a dense page is underfilled. */
export const MIN_DENSE_FIELD_COVERAGE = 0.22;

/**
 * Share of the field below the header row (y ≥ H/3) covered by content. Sum of clipped bbox
 * areas (overlaps double-count, which only over-reports coverage — safe for an underfill test).
 * Full-page surfaces / overlays / photo scrims are not content.
 */
function fieldCoverage(s: PaintedSlide): number {
  const top = CANVAS.height / 3;
  const fieldArea = CANVAS.width * (CANVAS.height - top);
  // Device parts carry `${deviceSlot}.${part}` slots; a device's footprint is the union of its
  // parts (thin rows of a numbered list still occupy the whole band visually).
  const boxes = new Map<string, { x: number; y: number; x1: number; y1: number }>();
  for (const e of s.elements) {
    if (e.kind === "overlay" || e.kind === "rule") continue;
    if (e.bbox.w >= CANVAS.width * 0.9 && e.bbox.h >= CANVAS.height * 0.9) continue;
    const dot = e.slot.indexOf(".");
    const key = dot > 0 ? e.slot.slice(0, dot) : `${e.slot}#${boxes.size}`;
    const b = boxes.get(key);
    const x1 = e.bbox.x + e.bbox.w;
    const y1 = e.bbox.y + e.bbox.h;
    if (!b) boxes.set(key, { x: e.bbox.x, y: e.bbox.y, x1, y1 });
    else {
      b.x = Math.min(b.x, e.bbox.x);
      b.y = Math.min(b.y, e.bbox.y);
      b.x1 = Math.max(b.x1, x1);
      b.y1 = Math.max(b.y1, y1);
    }
  }
  let sum = 0;
  for (const b of boxes.values()) {
    const y0 = Math.max(b.y, top);
    const y1 = Math.min(b.y1, CANVAS.height);
    if (y1 <= y0) continue;
    sum += Math.min(b.x1 - b.x, CANVAS.width) * (y1 - y0);
  }
  return Math.min(1, sum / fieldArea);
}

function mode(nums: number[]): number {
  const count = new Map<number, number>();
  for (const n of nums) count.set(n, (count.get(n) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]![0];
}

/** Text elements in the top third: count, snapped sizes, left edge — the "header stack" signature. */
function headerFingerprint(s: PaintedSlide): string {
  const top = s.elements
    .filter((e) => e.kind === "text" && e.text && e.bbox.y + e.bbox.h / 2 < CANVAS.height / 3)
    .sort((a, b) => a.bbox.y - b.bbox.y)
    .map((e) => `${e.fontSize ?? 0}@${Math.round(e.bbox.x / 16)}`);
  return top.length ? top.join("|") : "";
}

/**
 * split / sidebar = two columns separated by a vertical gutter. True when some x divides the
 * page so that ≥ 1 element lies wholly left of it and ≥ 1 wholly right, with at most one
 * element straddling (a footer band). Rules, overlays and full-page fields do not count; the
 * column widths are free (a 256px sidebar next to a 900px content column is a valid sidebar).
 */
function hasVerticalGutter(s: PaintedSlide): boolean {
  const els = s.elements.filter(
    (e) => e.kind !== "rule" && e.kind !== "overlay" && !(e.bbox.w >= CANVAS.width * 0.9 && e.bbox.h >= CANVAS.height * 0.9),
  );
  if (els.length < 2) return false;
  const edges = [...new Set(els.map((e) => e.bbox.x + e.bbox.w))].sort((a, b) => a - b);
  for (const gx of edges) {
    if (gx <= CANVAS.width * 0.1 || gx >= CANVAS.width * 0.9) continue;
    let left = 0;
    let right = 0;
    let straddle = 0;
    for (const e of els) {
      if (e.bbox.x + e.bbox.w <= gx + 2) left += 1;
      else if (e.bbox.x >= gx - 2) right += 1;
      else straddle += 1;
    }
    if (left >= 1 && right >= 1 && straddle <= 1) return true;
  }
  return false;
}

function compositionCheck(s: PaintedSlide, want: Composition, system: VisualSystem): string | undefined {
  const texts = s.elements.filter((e) => e.kind === "text" && e.text);
  const topTexts = texts.filter((e) => e.bbox.y + e.bbox.h / 2 < CANVAS.height / 3);
  const hasHeaderRow = topTexts.length >= 2 && topTexts.some((e) => (e.fontSize ?? 0) >= system.typeScale.h1);
  const display = texts.some((e) => (e.fontSize ?? 0) >= system.typeScale.h1 * 1.4);
  const photo = s.background?.kind === "image";
  const geometry = s.elements.filter((e) => e.kind !== "text" && e.kind !== "rule" && e.kind !== "overlay");
  switch (want) {
    case "statement":
      return display ? undefined : `composition=statement but no display-size sentence (≥ ${Math.round(system.typeScale.h1 * 1.4)}px)`;
    case "full-bleed":
      return photo || s.background?.kind === "solid" || s.background?.kind === "linear" ? undefined : "composition=full-bleed but the page has no field background";
    case "split":
    case "sidebar":
      return hasVerticalGutter(s) ? undefined : `composition=${want} but nothing divides the page into two columns — type column on one side, carrier on the other`;
    case "grid":
      // A table is a grid in its own right (carrier=table pages get composition=grid).
      return geometry.filter((e) => e.kind === "surface" || e.kind === "device" || e.kind === "table").length >= 1 || geometry.length >= 4
        ? undefined
        : "composition=grid but no tiles / surfaces";
    default:
      return hasHeaderRow || want !== "header-stack" ? undefined : "composition=header-stack but no title row in the top third";
  }
}
