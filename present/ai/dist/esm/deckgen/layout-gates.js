/**
 * Geometric layout gates: what a reviewer sees on the rendered page but the structural
 * gates in `reflect-canvas` do not measure.
 *
 *   - dead space: a large empty rectangle inside the content frame (half a page under a row of steps)
 *   - split column: a title and its copy in one column with a void between them
 *   - stranded title: a heading that wraps with one or two characters alone on the last line
 *   - repeated data: the same numbers as KPI tiles / table cells and again as a chart
 *
 * Text boxes are top-anchored and the model oversizes them freely (a 28px title in a 250px box),
 * so every check works on the *ink* box — the lines the text actually wraps to — not the bbox.
 * The wrap estimate matches the renderer within a glyph for CJK (≈ 0.98 em after h1 tracking) and
 * the default text insets (9.6px left and right).
 */
import { CANVAS } from "./visual-system.js";
import { NUMERIC_VALUE, isContentPage } from "./snap.js";
/** Renderer default text insets (`DEFAULT_TEXT_INSETS`), left + right. */
const TEXT_INSET_X = 19.2;
const CJK_ADVANCE = 0.98;
const LATIN_ADVANCE = 0.56;
/** Empty rectangle that counts as dead space: share of the content frame, and minimum sides. */
export const DEAD_SPACE = { area: 0.2, w: 0.35, h: 0.24 };
/** A void this tall between two stacked text blocks in one column splits the column. */
export const COLUMN_GAP_PX = 140;
function isCjk(ch) {
    return (ch.codePointAt(0) ?? 0) >= 0x2e80;
}
/** No line may start with these (CJK kinsoku); the renderer pulls them back onto the line above. */
const NO_LINE_START = /^[，。、；：！？）》」』”’,.;:!?)\]]/u;
/**
 * Greedy wrap at `maxW`: CJK breaks per character, latin per word. Returns the lines' widths and
 * text so callers can read both how tall the block is and what sits on its last line.
 */
export function wrapText(text, fontSize, maxW) {
    const out = [];
    for (const para of text.split(/\n/)) {
        // tokens: one CJK char, or a run of non-CJK non-space chars (a word), or spaces
        const tokens = para.match(/[⺀-\u{10ffff}]|[^\s⺀-\u{10ffff}]+|\s+/gu) ?? [];
        let line = "";
        let w = 0;
        for (const tok of tokens) {
            const tw = [...tok].reduce((a, ch) => a + (isCjk(ch) ? CJK_ADVANCE : LATIN_ADVANCE) * fontSize, 0);
            if (line && w + tw > maxW && !/^\s+$/.test(tok) && !NO_LINE_START.test(tok)) {
                out.push({ text: line.trimEnd(), w });
                line = "";
                w = 0;
            }
            if (!line && /^\s+$/.test(tok))
                continue;
            line += tok;
            w += tw;
        }
        out.push({ text: line.trimEnd(), w });
    }
    return out;
}
function lineHeightOf(e, sys) {
    const fs = e.fontSize ?? sys.typeScale.body;
    return e.lineHeight ?? (fs >= sys.typeScale.h1 ? 1.15 : fs >= sys.typeScale.h2 ? 1.25 : 1.45);
}
/** The part of a text box the type actually covers (top-anchored, aligned within the box). */
export function inkBox(e, sys) {
    if (e.kind !== "text" || !e.text?.trim())
        return e.bbox;
    const fs = e.fontSize ?? sys.typeScale.body;
    const lines = wrapText(e.text.trim(), fs, Math.max(1, e.bbox.w - TEXT_INSET_X));
    const h = Math.min(e.bbox.h, lines.length * fs * lineHeightOf(e, sys) + 9.6);
    const widest = Math.min(e.bbox.w, Math.max(...lines.map((l) => l.w)) + TEXT_INSET_X);
    const x = e.align === "middle" ? e.bbox.x + (e.bbox.w - widest) / 2 : e.align === "end" ? e.bbox.x + e.bbox.w - widest : e.bbox.x;
    return { x, y: e.bbox.y, w: widest, h };
}
/** Page-sized fields and scrims are ground, not content. */
function isGround(e) {
    if (e.kind === "overlay")
        return true;
    return e.bbox.w >= CANVAS.width * 0.9 && e.bbox.h >= CANVAS.height * 0.9;
}
/** Pages where emptiness is the design: cover / close / statements / photo fields / breathing pages. */
function wantsAir(s, brief, idx, total) {
    if (idx === 0 || idx === total - 1)
        return true;
    if (!isContentPage(s.layout, brief))
        return true;
    if (s.background?.kind === "image")
        return true;
    if (brief?.rhythm === "breathing" || brief?.rhythm === "anchor")
        return true;
    return brief?.composition === "statement" || brief?.composition === "full-bleed";
}
const CELL = 16;
/** Largest empty axis-aligned rectangle inside `frame`, given occupied boxes (histogram method on a 16px grid). */
export function largestEmptyRect(frame, boxes) {
    const cols = Math.floor(frame.w / CELL);
    const rows = Math.floor(frame.h / CELL);
    const busy = Array.from({ length: rows }, () => new Array(cols).fill(false));
    for (const b of boxes) {
        const c0 = Math.max(0, Math.floor((b.x - frame.x) / CELL));
        const c1 = Math.min(cols - 1, Math.ceil((b.x + b.w - frame.x) / CELL) - 1);
        const r0 = Math.max(0, Math.floor((b.y - frame.y) / CELL));
        const r1 = Math.min(rows - 1, Math.ceil((b.y + b.h - frame.y) / CELL) - 1);
        for (let r = r0; r <= r1; r++)
            for (let c = c0; c <= c1; c++)
                busy[r][c] = true;
    }
    const heights = new Array(cols).fill(0);
    let best = { x: frame.x, y: frame.y, w: 0, h: 0 };
    let bestCells = 0;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++)
            heights[c] = busy[r][c] ? 0 : heights[c] + 1;
        const stack = [];
        for (let c = 0; c <= cols; c++) {
            const hc = c === cols ? 0 : heights[c];
            while (stack.length && heights[stack[stack.length - 1]] >= hc) {
                const top = stack.pop();
                const h = heights[top];
                const left = stack.length ? stack[stack.length - 1] + 1 : 0;
                const w = c - left;
                if (w * h > bestCells) {
                    bestCells = w * h;
                    best = { x: frame.x + left * CELL, y: frame.y + (r - h + 1) * CELL, w: w * CELL, h: h * CELL };
                }
            }
            stack.push(c);
        }
    }
    return best;
}
function deadSpace(s, sys) {
    const mx = CANVAS.width * sys.grid.margin;
    const my = CANVAS.height * sys.grid.margin;
    const frame = { x: mx, y: my, w: CANVAS.width - 2 * mx, h: CANVAS.height - 2 * my };
    const boxes = s.elements.filter((e) => !isGround(e)).map((e) => inkBox(e, sys));
    // A column divider is a 1–4px rule, thinner than the 16px grid this search runs on, so it never
    // occupied a cell and the empty rectangle ran straight across both columns. A split page is two
    // columns by design: the short type column under a tall carrier is not one hole. Widen the rule to
    // a cell so it actually separates them.
    for (const e of s.elements) {
        // Wider than a cell: the type column ends a gutter short of the rule, and a 16px block left
        // that gap open, so the empty rectangle crossed into the other column anyway.
        // emit draws a rule as a rect, so match the shape, not the kind: a stroke many times taller
        // than it is wide is a column divider.
        if (e.kind === "rule" && e.bbox.h > e.bbox.w * 4 && e.bbox.w < CELL) {
            // Reach back to the nearest content on the left: the type column stops a gutter short of the
            // rule, and any gap left between them lets the empty rectangle through.
            const left = boxes.filter((b) => b.x + b.w <= e.bbox.x + 1).reduce((a, b) => Math.max(a, b.x + b.w), e.bbox.x - 80);
            boxes.push({ x: left, y: e.bbox.y, w: e.bbox.x + e.bbox.w - left, h: e.bbox.h });
        }
    }
    const r = largestEmptyRect(frame, boxes);
    if (r.w * r.h < frame.w * frame.h * DEAD_SPACE.area || r.w < frame.w * DEAD_SPACE.w || r.h < frame.h * DEAD_SPACE.h)
        return undefined;
    const pct = Math.round(((r.w * r.h) / (CANVAS.width * CANVAS.height)) * 100);
    return `empty block ${Math.round(r.w)}×${Math.round(r.h)}px at (${Math.round(r.x)}, ${Math.round(r.y)}) — ${pct}% of the page holds nothing; grow the carrier into it (taller cards / chart, a second row, a supporting visual) or close the gap so the page reads as one composition`;
}
/** Same column = horizontal overlap of at least half the narrower block. */
function sameColumn(a, b) {
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    return ox >= Math.min(a.w, b.w) * 0.5;
}
/**
 * The bottom of the page, measured against where the ink actually stops. `deadSpace` looks for
 * one big empty rectangle; a footnote or a folio splits the bottom void into two bands that are
 * each too short to trip it, while the page still reads as "content piled at the top, half a page
 * blank underneath". The gap below the lowest content ink is the honest measure, so a footnote
 * alone (muted, small) never counts as content that fills the page.
 */
function bottomVoid(s, sys) {
    const my = CANVAS.height * sys.grid.margin;
    const bottom = CANVAS.height - my;
    const content = s.elements
        .filter((e) => !isGround(e) && e.kind !== "rule" && !/footnote|folio|pageNo/i.test(e.slot))
        .map((e) => inkBox(e, sys))
        .filter((b) => b.h > 0);
    if (!content.length)
        return undefined;
    const lowest = Math.max(...content.map((b) => b.y + b.h));
    const gap = bottom - lowest;
    const bandH = CANVAS.height * 0.18;
    if (gap < bandH)
        return undefined;
    return `content stops at y=${Math.round(lowest)} and the page runs to y=${Math.round(bottom)} — a ${Math.round(gap)}px band (${Math.round((gap / CANVAS.height) * 100)}% of the page) holds nothing: grow the carrier to fill it (taller cards / chart, a second row) or move the block down to the optical centre`;
}
function splitColumn(s, sys) {
    // Free text blocks only; device parts are laid out by their expander.
    const texts = s.elements
        .filter((e) => e.kind === "text" && e.text?.trim() && !e.slot.includes(".") && !isGround(e))
        .map((e) => ({ e, ink: inkBox(e, sys) }))
        .filter(({ ink }) => ink.y + ink.h < CANVAS.height * 0.88)
        .sort((a, b) => a.ink.y - b.ink.y);
    for (let i = 0; i < texts.length; i++) {
        const upper = texts[i];
        if ((upper.e.fontSize ?? 0) < sys.typeScale.h2)
            continue;
        const bottom = upper.ink.y + upper.ink.h;
        // the next block below it in the same column, with nothing else in between
        const below = texts.slice(i + 1).find((t) => t.ink.y >= bottom - 2 && sameColumn(upper.ink, t.ink));
        if (!below)
            continue;
        const between = s.elements.some((e) => {
            if (isGround(e) || e === upper.e || e === below.e)
                return false;
            const b = inkBox(e, sys);
            return b.y < below.ink.y && b.y + b.h > bottom && sameColumn(upper.ink, b);
        });
        const gap = below.ink.y - bottom;
        if (!between && gap >= COLUMN_GAP_PX) {
            return `“${(upper.e.text ?? "").slice(0, 20)}” ends at y=${Math.round(bottom)} and the next copy in its column starts at y=${Math.round(below.ink.y)} — a ${Math.round(gap)}px void splits the column; set the copy directly under the title (≈ 24–40px) or put the carrier in that space`;
        }
    }
    return undefined;
}
function strandedTitle(s, sys) {
    for (const e of s.elements) {
        if (e.kind !== "text" || !e.text?.trim() || (e.fontSize ?? 0) < sys.typeScale.h2)
            continue;
        if (NUMERIC_VALUE.test(e.text.trim()))
            continue;
        const fs = e.fontSize;
        const maxW = Math.max(1, e.bbox.w - TEXT_INSET_X);
        const lines = wrapText(e.text.trim(), fs, maxW);
        if (lines.length < 2)
            continue;
        const last = lines[lines.length - 1];
        const chars = [...last.text.replace(/[\s，。、；：！？,.;:!?]/gu, "")];
        const cjk = chars.filter(isCjk).length;
        const latinWords = last.text.trim().split(/\s+/).filter(Boolean).length;
        const stranded = cjk > 0 ? chars.length <= 2 : latinWords === 1 && last.w < maxW * 0.25;
        if (!stranded)
            continue;
        const perLine = Math.floor(maxW / (CJK_ADVANCE * fs));
        return `heading “${e.text.trim().slice(0, 24)}” wraps with “${last.text.trim()}” alone on its last line — cut it to ${lines.length === 2 ? `≤ ${perLine} characters so it fits one line` : "fewer words"}, or widen its box to ≥ ${Math.ceil(maxW + last.w + TEXT_INSET_X)}px if the column allows`;
    }
    return undefined;
}
function numbersIn(text) {
    return [...text.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}
function repeatedData(s) {
    const charts = s.elements.filter((e) => e.kind === "chart" && e.chart);
    if (!charts.length)
        return undefined;
    // Numbers the page already states as values: bare-number texts (KPI tiles, numerals) and table cells.
    const stated = new Set();
    for (const e of s.elements) {
        if (e.kind === "text" && e.text && NUMERIC_VALUE.test(e.text.trim()) && /\d/.test(e.text)) {
            for (const n of numbersIn(e.text.trim()))
                stated.add(n);
        }
        if (e.kind === "table" && e.table)
            for (const row of e.table.rows)
                for (const cell of row)
                    for (const n of numbersIn(String(cell)))
                        stated.add(n);
    }
    if (stated.size < 2)
        return undefined;
    for (const c of charts) {
        const values = [...new Set(c.chart.series.flatMap((sr) => sr.values))];
        const shared = values.filter((v) => stated.has(v));
        if (shared.length >= 2 && shared.length >= values.length * 0.5) {
            return `the chart repeats numbers the page already states (${shared.join(", ")}) — one carrier per figure: drop the chart, or chart data the tiles / table do not show (a trend, a breakdown, a benchmark)`;
        }
    }
    return undefined;
}
/** Layout findings for every page; at most one finding per check per page. */
export function layoutFindings(slides, sys, briefs) {
    const findings = [];
    slides.forEach((s, i) => {
        const brief = briefs?.[i];
        const stranded = strandedTitle(s, sys);
        if (stranded)
            findings.push({ kind: "design", slideIdx: i, issue: stranded });
        const repeated = repeatedData(s);
        if (repeated)
            findings.push({ kind: "content", slideIdx: i, issue: repeated });
        if (wantsAir(s, brief, i, slides.length))
            return;
        // A split column is the more specific diagnosis of the same void; report one, not both.
        const split = splitColumn(s, sys);
        const dead = split ? undefined : deadSpace(s, sys);
        // The bottom band is checked even when a dead rectangle was already named: they are different
        // shapes of the same failure, and a page can have both.
        const bottom = bottomVoid(s, sys);
        if (split)
            findings.push({ kind: "design", slideIdx: i, issue: split });
        if (dead)
            findings.push({ kind: "design", slideIdx: i, issue: dead });
        if (bottom)
            findings.push({ kind: "design", slideIdx: i, issue: bottom });
    });
    return findings;
}
