/**
 * Normalize LLM (or fixture) canvas IR: real images only, type ramp, grid,
 * palette roles. Photo backgrounds may bleed; type stays in the 5% inset.
 */
import { CANVAS, MAX_CAPTION_CHARS, MIN_READABLE_PX } from "./visual-system.js";
import { isPaintRole } from "./color-theme.js";
import { isCanvasDiagramLayout, isCanvasIconId, isCanvasPresetId, isDeviceKind, normalizeIconId } from "./vocab.js";
import { expandDevice } from "./devices.js";
const IMAGE_SRC = /^(data:|https?:|blob:)/i;
const KINDS = [
    "text",
    "image",
    "rule",
    "bar",
    "surface",
    "ellipse",
    "line",
    "chart",
    "table",
    "overlay",
    "shape",
    "icon",
    "diagram",
    "device",
];
/** Floating objects (shadow / glow) allowed per page before snap strips the rest. */
export const MAX_FLOATING_PER_PAGE = 2;
export function realImageSrc(src) {
    const t = (src ?? "").trim();
    if (!t)
        return undefined;
    if (IMAGE_SRC.test(t))
        return t;
    return undefined;
}
export function canvasTypeRamp(sys) {
    const extra = [11, 12, 13, 14, 16, 17, 18, 20, 22, 24, 28, 32, 36, 42, 48, 56, 64, 72, 80];
    return [...new Set([...Object.values(sys.typeScale).filter((n) => typeof n === "number"), ...extra])].sort((a, b) => a - b);
}
export function snapFontSize(n, ramp) {
    if (!ramp.length)
        return n;
    return ramp.reduce((best, x) => (Math.abs(x - n) < Math.abs(best - n) ? x : best));
}
/**
 * When the author omitted fontSize, read the role off the slot name / box height instead
 * of flattening the whole page to body size (the #1 art-director complaint on live runs).
 */
export function inferFontSizeFromSlot(slot, sys, bbox, text = "") {
    const s = String(slot ?? "").toLowerCase();
    const t = sys.typeScale;
    if (/display|hero|headline|statement|claim|big|number|value|stat|kpi/.test(s))
        return t.display;
    if (/eyebrow|kicker|caption|label|footer|source|meta|page|num|index|tag|note/.test(s))
        return t.caption;
    if (/body|copy|para|desc|bullet|point|text|summary|detail/.test(s))
        return t.body;
    if (/^title$|(^|[^a-z])title|heading|h1/.test(s) && !/sub|tile|card|step|item|kpi|tab|col|plane|row/.test(s))
        return t.h1;
    if (/subtitle|deck|lede|lead|standfirst|h2|section/.test(s))
        return t.h2;
    // No hint in the name: a short line in a headline-height box is a title, everything else is copy.
    if ([...text].length <= 40 && bbox.h >= t.h1 * 1.2 && bbox.h <= t.display * 2)
        return t.h1;
    return t.body;
}
// ---------------------------------------------------------------------------
// Content-page titles share one size. Type anchors belong to the VisualSystem, not the
// author: a deck where page 1 titles at 32px and page 2 at 42px reads as two decks.
// Pages that deliberately carry display type (cover / close / section / quote / claim,
// anchor rhythm, statement / full-bleed compositions) are left alone.
// ---------------------------------------------------------------------------
const ANCHOR_LAYOUTS = new Set(["cover", "close", "closing", "section", "quote", "claim", "hero"]);
/** A page whose title is a section title (not display type). */
export function isContentPage(layout, brief) {
    if (ANCHOR_LAYOUTS.has((layout ?? "").toLowerCase()))
        return false;
    if (brief?.rhythm === "anchor")
        return false;
    if (brief?.composition === "statement" || brief?.composition === "full-bleed")
        return false;
    return true;
}
/** The page-title slot (not tile / step / kpi / plane titles inside devices). */
export function isTitleSlot(slot) {
    const s = String(slot ?? "").toLowerCase();
    return /title|heading|^h1$/.test(s) && !/sub|tile\d|card|step|item|kpi|tab|col|plane|row|chart|table|section/.test(s);
}
/** Rough CJK-aware glyph width in em. */
export function textUnits(text) {
    return [...text].reduce((acc, ch) => acc + (/[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.58), 0);
}
/** Renderer default lIns + rIns (0.1in each) — the box is wider than the line it can hold. */
const TITLE_INSET_X = 19.2;
/** Estimated wrapped lines of `text` at `size` inside a box `w` wide (renderer insets taken off). */
function wrappedLines(text, size, w) {
    // Capacity in em units (a Latin glyph is 0.58 of one), so "04" at 72px in a 150px box is one line.
    const perLine = Math.max(0.5, Math.max(1, w - TITLE_INSET_X) / size);
    return Math.max(1, ...text.split(/\n/).map((line) => Math.ceil(Math.max(0.5, textUnits(line)) / perLine)));
}
/**
 * A display sentence the author set at 84px in a 700×220 box ("Masters and layouts come along")
 * wraps to three lines and runs 70px past the box into the subtitle below. Step it down the ramp
 * until the estimated wrapped height fits the box (10% slack). Body copy and below is left as
 * authored — a paragraph box that is too short is the author's overflow, not a sizing choice.
 */
export function fitTextSize(text, size, bbox, ramp, lineHeight, sys) {
    const lh = lineHeight != null && lineHeight >= 0.8 && lineHeight <= 2 ? lineHeight : 1.15;
    const floor = sys.typeScale.h2;
    if (size <= floor)
        return size;
    // One line always "fits": a box drawn exactly font-size tall is normal authoring, and a single
    // line spilling a few px below its box hits nothing. Only wrapped lines run into neighbours.
    const fits = (s) => {
        const lines = wrappedLines(text, s, bbox.w);
        return lines === 1 || lines * s * lh <= bbox.h * 1.1;
    };
    if (fits(size))
        return size;
    const rungs = [...ramp].filter((r) => r < size && r >= floor).sort((a, b) => b - a);
    for (const r of rungs)
        if (fits(r))
            return r;
    return rungs.at(-1) ?? size;
}
/**
 * h1 for content titles; h2 when the title cannot fit in two lines of h1 inside its box — or when
 * two lines of h1 would leave a single character on the second line ("和常见方案的区 / 别"). An
 * orphan is fixed by stepping down only if h2 then fits without one; otherwise h1 stands.
 */
export function contentTitleSize(sys, text, bbox) {
    const { h1, h2 } = sys.typeScale;
    const units = textUnits(text);
    const room = Math.max(1, bbox.w - TITLE_INSET_X);
    const layout = (size) => {
        const perLine = Math.max(1, Math.floor(room / size));
        const lines = Math.ceil(units / perLine);
        const last = units - perLine * (lines - 1);
        return { lines, orphan: lines > 1 && last <= 1.2 };
    };
    const maxLines = Math.min(2, Math.max(1, Math.floor(bbox.h / (h1 * 1.15))));
    const atH1 = layout(h1);
    if (atH1.lines > maxLines)
        return h2;
    if (atH1.orphan) {
        const atH2 = layout(h2);
        if (!atH2.orphan && atH2.lines <= 2)
            return h2;
    }
    return h1;
}
const NUMERAL_ONLY = /^[\d０-９.,%+\-–—×x\s·/]+$/;
/**
 * The section title of a content page when the author did not name a `title` slot (most
 * models don't): the largest word-text in the top third at ≥ h2 — not a sidebar numeral
 * ("04"), not a KPI value ("41%"), not an eyebrow. Shared by snap (forces) and reflect (checks).
 */
export function findContentTitle(elements, sys) {
    let best;
    for (const e of elements) {
        if (e.kind !== "text" || !e.text)
            continue;
        // Judge by the first line, not the box centre: a two-line title in a generous sidebar box
        // (y=180, h=150) is still the section title even though the box centre is past the third.
        const firstLine = Math.min(e.bbox.h, (e.fontSize ?? sys.typeScale.h2) * 1.4);
        if (e.bbox.y + firstLine / 2 >= CANVAS.height / 3)
            continue;
        if ((e.fontSize ?? 0) < sys.typeScale.h2)
            continue;
        const t = e.text.trim();
        if ([...t].length < 4 || NUMERAL_ONLY.test(t))
            continue;
        if (!best || (e.fontSize ?? 0) > (best.fontSize ?? 0))
            best = e;
    }
    return best;
}
// ---------------------------------------------------------------------------
// Display-type treatments ("艺术字"). The author may ask for one on any text ≥ h2; the system
// decides which ones exist in its language. Anchor pages get the system default when the
// author asked for nothing, so a cover never ships as plain type on a system that has a voice.
// ---------------------------------------------------------------------------
/** Treatment aliases the model reaches for. */
const TREATMENT_ALIASES = {
    gradient: "gradient",
    "gradient-fill": "gradient",
    gradienttext: "gradient",
    outline: "outline",
    outlined: "outline",
    hollow: "outline",
    stroke: "outline",
    shadow: "shadow",
    "drop-shadow": "shadow",
    dropshadow: "shadow",
    glow: "glow",
    neon: "glow",
};
export function normalizeTreatment(raw) {
    if (typeof raw !== "string")
        return undefined;
    const key = raw.trim().toLowerCase().replace(/[\s_]+/g, "-");
    return TREATMENT_ALIASES[key] ?? TREATMENT_ALIASES[key.replace(/-/g, "")];
}
/**
 * The treatment this system will actually draw for a request. A banned one falls back to the
 * system default (never silently to the banned effect); a system whose default is `none` draws
 * only what it allows. Shadow is allowed even on shadow-banning systems when it is their display
 * voice (photo-editorial: type on a photo needs it to read).
 */
export function resolveTreatment(sys, want) {
    const dflt = sys.canvas.displayTreatment === "none" ? undefined : sys.canvas.displayTreatment;
    if (!want)
        return undefined;
    const allowed = (t) => {
        switch (t) {
            case "gradient":
                return !sys.bans.gradients;
            case "glow":
                return sys.canvas.glow;
            case "shadow":
                return !sys.bans.shadows || dflt === "shadow";
            case "outline":
                return true;
        }
    };
    if (allowed(want))
        return want;
    return dflt && allowed(dflt) ? dflt : undefined;
}
/** Minimum size for a treatment: below h2 an outline or a gradient is noise. */
function treatmentFloor(sys) {
    return sys.typeScale.h2;
}
/**
 * At most one treated text per page: keep the largest. Anchor pages whose display line carries no
 * treatment receive the system default. Shadow / glow are folded into the existing flags so the
 * floating cap and emit see them like any other shadow / glow carrier.
 */
function applyTreatments(elements, sys, page) {
    const floor = treatmentFloor(sys);
    const texts = elements.filter((e) => e.kind === "text" && e.text && (e.fontSize ?? 0) >= floor);
    for (const e of elements)
        if (e.kind === "text" && e.treatment && (e.fontSize ?? 0) < floor)
            delete e.treatment;
    const treated = texts.filter((e) => e.treatment).sort((a, b) => (b.fontSize ?? 0) - (a.fontSize ?? 0));
    for (const extra of treated.slice(1))
        delete extra.treatment;
    if (!treated.length && !page.content) {
        const dflt = resolveTreatment(sys, sys.canvas.displayTreatment === "none" ? undefined : sys.canvas.displayTreatment);
        const display = texts
            .filter((e) => (e.fontSize ?? 0) >= sys.typeScale.h1 * 1.4 && !NUMERAL_ONLY.test((e.text ?? "").trim()))
            .sort((a, b) => (b.fontSize ?? 0) - (a.fontSize ?? 0))[0];
        if (dflt && display)
            display.treatment = dflt;
    }
    for (const e of elements) {
        if (e.kind !== "text" || !e.treatment)
            continue;
        if (e.treatment === "shadow") {
            e.shadow = { blur: 18, dx: 0, dy: 6, alpha: 0.45 };
            delete e.treatment;
        }
        else if (e.treatment === "glow") {
            e.glow = true;
            delete e.treatment;
        }
    }
}
function clamp01(n, fallback = 1) {
    if (n == null || Number.isNaN(n))
        return fallback;
    return Math.max(0, Math.min(1, n));
}
function roleOf(raw, fallback = "ink") {
    return typeof raw === "string" && isPaintRole(raw) ? raw : fallback;
}
function snapBox(bbox, opts) {
    const maxW = CANVAS.width;
    const maxH = CANVAS.height;
    let x = Number.isFinite(bbox.x) ? bbox.x : opts.mx;
    let y = Number.isFinite(bbox.y) ? bbox.y : opts.my;
    let w = Number.isFinite(bbox.w) ? bbox.w : 40;
    let h = Number.isFinite(bbox.h) ? bbox.h : 40;
    w = Math.max(8, w);
    h = Math.max(4, h);
    // Clamp the far edges, not the origin: a sidebar authored at x=-18,w=222 keeps its right
    // edge at 204 instead of sliding 82px into the title column beside it.
    const right = x + w;
    const bottom = y + h;
    const minX = opts.bleed ? 0 : opts.mx;
    const minY = opts.bleed ? 0 : opts.my;
    const maxX = opts.bleed ? maxW : maxW - opts.mx;
    const maxY = opts.bleed ? maxH : maxH - opts.my;
    x = Math.max(minX, Math.min(x, maxX - 8));
    y = Math.max(minY, Math.min(y, maxY - 4));
    // A box that lies entirely outside the frame keeps its own size at the near edge; one that
    // merely pokes out is trimmed so the inner edge stays where the author put it.
    w = right > x + 8 ? Math.min(right, maxX) - x : Math.min(w, maxX - x);
    h = bottom > y + 4 ? Math.min(bottom, maxY) - y : Math.min(h, maxY - y);
    w = Math.max(8, w);
    h = Math.max(4, h);
    return { x, y, w, h };
}
function snapChart(raw) {
    if (!raw || typeof raw !== "object")
        return undefined;
    const o = raw;
    const type = o.type;
    const allowed = ["column", "bar", "line", "area", "pie", "doughnut"];
    const t = allowed.includes(type) ? type : "column";
    const categories = Array.isArray(o.categories)
        ? o.categories.map((c) => String(c ?? "").slice(0, 24)).filter(Boolean).slice(0, 12)
        : [];
    const seriesIn = Array.isArray(o.series) ? o.series : [];
    const series = seriesIn.slice(0, t === "pie" || t === "doughnut" ? 1 : 6).map((s, i) => {
        const row = s && typeof s === "object" ? s : {};
        const values = Array.isArray(row.values)
            ? row.values.map((v) => {
                const n = typeof v === "number" ? v : Number(v);
                return Number.isFinite(n) ? n : 0;
            })
            : [];
        const cats = categories.length ? categories : values.map((_, j) => `C${j + 1}`);
        return {
            name: String(row.name ?? `S${i + 1}`).slice(0, 24),
            values: cats.map((_, j) => values[j] ?? 0),
        };
    });
    const cats = categories.length ? categories : (series[0]?.values.map((_, j) => `C${j + 1}`) ?? ["A", "B"]);
    if (!series.length)
        return undefined;
    return { type: t, categories: cats, series };
}
function snapTable(raw) {
    if (!raw || typeof raw !== "object")
        return undefined;
    const o = raw;
    const headers = Array.isArray(o.headers) ? o.headers.map((h) => String(h ?? "").slice(0, 32)).slice(0, 8) : [];
    const rows = Array.isArray(o.rows)
        ? o.rows
            .slice(0, 12)
            .map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "").slice(0, 40)) : []))
            .filter((r) => r.length)
        : [];
    if (headers.length < 2 && !rows.length)
        return undefined;
    const cols = Math.max(headers.length, ...rows.map((r) => r.length), 2);
    const hdr = [...headers];
    while (hdr.length < cols)
        hdr.push(`C${hdr.length + 1}`);
    return {
        headers: hdr.slice(0, cols),
        rows: rows.map((r) => {
            const next = [...r];
            while (next.length < cols)
                next.push("");
            return next.slice(0, cols);
        }),
    };
}
function snapDiagram(raw) {
    if (!raw || typeof raw !== "object")
        return undefined;
    const o = raw;
    const layout = String(o.layout ?? "");
    if (!isCanvasDiagramLayout(layout))
        return undefined;
    const list = Array.isArray(o.items) ? o.items : [];
    const items = list
        .map((it) => {
        if (typeof it === "string")
            return { title: it.trim().slice(0, 40) };
        const row = it && typeof it === "object" ? it : {};
        const title = String(row.title ?? row.text ?? row.label ?? "").trim().slice(0, 40);
        const body = String(row.body ?? row.desc ?? "").trim().slice(0, 90);
        return { title, ...(body ? { body } : {}) };
    })
        .filter((it) => it.title)
        .slice(0, 8);
    if (items.length < 2)
        return undefined;
    return { layout, items };
}
/**
 * Cap a device string without cutting a word in half: back off to the last space / CJK
 * boundary when that keeps most of the budget, and mark the cut with an ellipsis so
 * "authored in th" never ships as if it were the whole sentence.
 */
export function clipText(raw, max) {
    const s = raw.trim();
    const chars = [...s];
    if (chars.length <= max)
        return s;
    let cut = max - 1;
    for (let i = cut; i >= Math.floor(max * 0.6); i--) {
        const ch = chars[i];
        if (/[\s,;:，；：、]/.test(ch) || /[\u2e80-\u9fff]/.test(ch)) {
            cut = /[\u2e80-\u9fff]/.test(ch) ? i + 1 : i;
            break;
        }
    }
    return chars.slice(0, cut).join("").replace(/[\s,;:，；：、]+$/u, "") + "…";
}
function snapDeviceItems(raw, max = 6) {
    if (!Array.isArray(raw))
        return undefined;
    const out = raw
        .map((it) => {
        if (typeof it === "string")
            return { title: clipText(it, 48) };
        const row = it && typeof it === "object" ? it : {};
        const title = clipText(String(row.title ?? row.label ?? row.text ?? ""), 48);
        const body = clipText(String(row.body ?? row.desc ?? ""), 120);
        const value = String(row.value ?? row.number ?? "").trim().slice(0, 16);
        const note = clipText(String(row.note ?? row.delta ?? ""), 48);
        const icon = normalizeIconId(row.icon);
        const targetRaw = Number(row.target ?? row.page ?? row.slide ?? row.goto);
        const target = Number.isInteger(targetRaw) && targetRaw >= 1 ? targetRaw : undefined;
        return {
            title,
            ...(body ? { body } : {}),
            ...(value ? { value } : {}),
            ...(note ? { note } : {}),
            ...(icon && isCanvasIconId(icon) ? { icon } : {}),
            ...(target ? { target } : {}),
        };
    })
        .filter((it) => it.title || it.value);
    return out.length ? out.slice(0, max) : undefined;
}
function snapPlane(raw) {
    if (!raw || typeof raw !== "object")
        return undefined;
    const o = raw;
    const title = String(o.title ?? o.label ?? "").trim().slice(0, 40);
    const points = Array.isArray(o.points)
        ? o.points.map((p) => String(p ?? "").trim().slice(0, 80)).filter(Boolean).slice(0, 6)
        : [];
    if (!title && !points.length)
        return undefined;
    return { title: title || " ", points };
}
/** A metric-led title: "70+", "3.2x", "45%", "200+ 动画", "70+ transitions" — a number, optional unit, then at most a short label. */
export const NUMERIC_VALUE = /^[~≈<>]?\d[\d,.]*\s?(?:[%+xX×]|[kKmMbB]\+?|万|亿)?\+?(?:\s?[\p{L}\p{Script=Han} ]{1,16})?$/u;
const NUMERIC_LEAD = /^([~≈<>]?\d[\d,.]*\s?(?:[%+xX×]|[kKmMbB]\+?|万|亿)?\+?)\s*(.*)$/u;
/**
 * Tiles titled with numbers ("70+ transitions" × 4) are KPIs wearing a grid: the number is what
 * reads first, so they are carried as a kpiRow — value = the number, title = the label that
 * followed it (else the body), note = the body. The reflect gate names the same rule; doing it here
 * saves the repair round the model regularly fails (it re-authors the grid with the same titles).
 */
function numericTilesToKpis(items) {
    if (items.length < 2 || items.length > 4)
        return undefined;
    if (items.some((it) => it.value))
        return undefined;
    const numeric = items.filter((it) => NUMERIC_VALUE.test(it.title.trim()));
    if (numeric.length < Math.max(2, items.length - 1))
        return undefined;
    return items.map((it) => {
        const m = NUMERIC_LEAD.exec(it.title.trim());
        if (!m)
            return it;
        const value = m[1].trim();
        const label = m[2].trim();
        const { body, ...rest } = it;
        const title = label || body || "";
        const note = label ? body : undefined;
        return { ...rest, value, title, ...(note ? { note } : {}) };
    });
}
function snapDevice(raw) {
    if (!raw || typeof raw !== "object")
        return undefined;
    const o = raw;
    const rawType = String(o.type ?? o.kind ?? "");
    if (!isDeviceKind(rawType))
        return undefined;
    let type = rawType;
    let items = snapDeviceItems(o.items, type === "agendaList" ? 8 : 6);
    if ((type === "iconLabelGrid" || type === "numberedList") && items) {
        const kpis = numericTilesToKpis(items);
        if (kpis) {
            type = "kpiRow";
            items = kpis;
        }
    }
    const text = typeof o.text === "string" ? o.text.trim().slice(0, 200) : undefined;
    const attribution = typeof o.attribution === "string" ? o.attribution.trim().slice(0, 60) : undefined;
    const iconId = normalizeIconId(o.icon);
    const icon = iconId && isCanvasIconId(iconId) ? iconId : undefined;
    let left = snapPlane(o.left);
    let right = snapPlane(o.right);
    // comparePlanes written as two items (title + body) instead of left/right planes — a common slip.
    if (type === "comparePlanes" && !left && !right && items && items.length >= 2) {
        const toPlane = (it) => ({ title: it.title || it.value || "", points: [it.body, it.note].filter((p) => Boolean(p)) });
        left = toPlane(items[0]);
        right = toPlane(items[1]);
    }
    const dev = {
        type,
        ...(items ? { items } : {}),
        ...(text ? { text } : {}),
        ...(attribution ? { attribution } : {}),
        ...(icon ? { icon } : {}),
        ...(left ? { left } : {}),
        ...(right ? { right } : {}),
    };
    switch (type) {
        case "kpiRow":
        case "stepStrip":
        case "numberedList":
        case "iconLabelGrid":
            return items ? dev : undefined;
        case "agendaList":
            return items && items.length >= 2 ? dev : undefined;
        case "takeawayBand":
        case "quoteBlock":
        case "calloutNote":
            return text || items ? dev : undefined;
        case "comparePlanes":
            return left || right ? dev : undefined;
    }
    return undefined;
}
function snapRuns(raw) {
    if (!Array.isArray(raw) || !raw.length)
        return undefined;
    const runs = [];
    for (const r of raw) {
        if (typeof r === "string") {
            if (r)
                runs.push({ text: r });
            continue;
        }
        if (!r || typeof r !== "object")
            continue;
        const o = r;
        const text = String(o.text ?? "");
        if (!text)
            continue;
        const e = String(o.emphasis ?? o.style ?? "");
        const emphasis = e === "bold" || e === "accent" || e === "mono" ? e : undefined;
        runs.push({ text, ...(emphasis ? { emphasis } : {}) });
    }
    if (!runs.length)
        return undefined;
    // ≤ 2 emphasised spans per element — more reads as noise.
    let seen = 0;
    for (const run of runs) {
        if (!run.emphasis)
            continue;
        seen++;
        if (seen > 2)
            delete run.emphasis;
    }
    if (!runs.some((r) => r.emphasis))
        return undefined;
    return runs;
}
function snapScrim(raw) {
    if (!raw || typeof raw !== "object")
        return undefined;
    const o = raw;
    const d = String(o.direction ?? o.side ?? "");
    const direction = d === "left" || d === "right" || d === "top" || d === "bottom" || d === "radial" || d === "flat" ? d : undefined;
    if (!direction)
        return undefined;
    return { direction, strength: clamp01(typeof o.strength === "number" ? o.strength : Number(o.strength), 0.72) };
}
/**
 * No authored scrim → derive one from where the type sits. Darkest on the
 * type side, clear on the far side. Uniform overlays flatten the photo.
 */
export function deriveScrim(elements, overlay) {
    const strength = Math.max(0.55, Math.min(0.9, (overlay ?? 0.48) + 0.25));
    const texts = elements.filter((e) => e.kind === "text" && (e.text ?? "").trim());
    if (!texts.length)
        return { direction: "bottom", strength };
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (const t of texts) {
        // Weigh the ink, not the box: a left-aligned title in a 1100px box has its glyphs on the
        // left, and a centroid taken from the box put a radial scrim under the photo's subject
        // while the copy sat on the bare edge.
        const size = t.fontSize ?? 18;
        const units = [...(t.text ?? "")].reduce((acc, ch) => acc + (/[\u2e80-\u9fff]/.test(ch) ? 1 : 0.58), 0);
        const inkW = Math.min(t.bbox.w, Math.max(size, units * size));
        const inkX = t.align === "middle" ? t.bbox.x + (t.bbox.w - inkW) / 2 : t.align === "end" ? t.bbox.x + t.bbox.w - inkW : t.bbox.x;
        const a = Math.max(1, inkW * t.bbox.h);
        area += a;
        cx += (inkX + inkW / 2) * a;
        cy += (t.bbox.y + t.bbox.h / 2) * a;
    }
    cx /= area;
    cy /= area;
    const fx = cx / CANVAS.width;
    const fy = cy / CANVAS.height;
    const dx = Math.abs(fx - 0.5);
    const dy = Math.abs(fy - 0.5);
    const scrim = dx < 0.12 && dy < 0.12
        ? { direction: "radial", strength }
        : dx >= dy
            ? { direction: fx < 0.5 ? "left" : "right", strength }
            : { direction: fy < 0.5 ? "top" : "bottom", strength };
    return withScrimFloor(scrim, elements);
}
/**
 * The scrim is darkest where the copy's weight is; a kicker or folio in the far corner would sit
 * on the bare photograph. When any type lies on the clear side, keep a veil there too — a third
 * of the peak, enough for small light type, not enough to flatten the picture.
 */
export function withScrimFloor(scrim, elements) {
    if (scrim.direction === "flat" || scrim.direction === "radial")
        return scrim;
    const farSide = (b) => {
        const cx = (b.x + b.w / 2) / CANVAS.width;
        const cy = (b.y + b.h / 2) / CANVAS.height;
        switch (scrim.direction) {
            case "left":
                return cx > 0.6;
            case "right":
                return cx < 0.4;
            case "top":
                return cy > 0.6;
            default:
                return cy < 0.4;
        }
    };
    const exposed = elements.some((e) => e.kind === "text" && (e.text ?? "").trim() && farSide(e.bbox));
    return exposed ? { ...scrim, floor: Math.round(scrim.strength * 0.35 * 100) / 100 } : scrim;
}
function snapBackground(raw, elements, sys) {
    if (!raw)
        return undefined;
    if (raw.kind === "image") {
        const src = realImageSrc(raw.src);
        if (!src)
            return undefined;
        const overlay = clamp01(raw.overlay, 0.45);
        const authored = snapScrim(raw.scrim);
        const scrim = authored ? withScrimFloor(authored, elements) : deriveScrim(elements, raw.overlay);
        // A scrim darkens the photo so type can sit on it. That is the *dark* palette token: ink on
        // light paper, bg on dark paper. Defaulting to `ink` on a dark-paper system painted a white
        // wash over the photo and the copy was then flipped to black to read on it.
        const dark = sys.canvas.tone === "dark" ? "bg" : "ink";
        return {
            kind: "image",
            src,
            alpha: clamp01(raw.alpha, 1),
            overlay,
            overlayRole: roleOf(raw.overlayRole, dark),
            scrim,
        };
    }
    if (raw.kind === "linear") {
        return {
            kind: "linear",
            paintRole: roleOf(raw.paintRole, "bg"),
            toRole: roleOf(raw.toRole, "accent"),
            angle: Number.isFinite(raw.angle) ? raw.angle : 90,
        };
    }
    return { kind: "solid", paintRole: roleOf(raw.paintRole, "bg") };
}
function decorate(out, raw) {
    if (raw.rx && raw.rx > 0)
        out.rx = Math.min(48, raw.rx);
    if (raw.fillAlpha != null)
        out.fillAlpha = clamp01(raw.fillAlpha);
    if (raw.gradient) {
        out.gradient = {
            angle: Number.isFinite(raw.gradient.angle) ? raw.gradient.angle : 90,
            toRole: roleOf(raw.gradient.toRole, "accent"),
            fromAlpha: clamp01(raw.gradient.fromAlpha, 1),
            toAlpha: clamp01(raw.gradient.toAlpha, 0.2),
        };
    }
    if (raw.shadow) {
        out.shadow = {
            blur: Math.max(0, raw.shadow.blur ?? 12),
            dx: raw.shadow.dx ?? 0,
            dy: raw.shadow.dy ?? 8,
            alpha: clamp01(raw.shadow.alpha, 0.28),
        };
    }
    if (raw.glow)
        out.glow = true;
    if (Number.isInteger(raw.link) && raw.link >= 1)
        out.link = raw.link;
    return out;
}
function snapEl(raw, sys, ramp, mx, my, page) {
    const kind = KINDS.includes(raw.kind) ? raw.kind : "text";
    const bleed = kind === "bar" || kind === "overlay" || kind === "surface" || kind === "image";
    const bbox = snapBox(raw.bbox ?? { x: mx, y: my, w: 100, h: 40 }, { bleed, mx, my });
    const paintRole = roleOf(raw.paintRole, kind === "text" ? "ink" : "accent");
    const slot = (raw.slot || kind).slice(0, 40);
    const base = {
        slot,
        kind,
        name: raw.name || `slot:${slot}`,
        bbox,
        paintRole,
    };
    if (kind === "image") {
        const src = realImageSrc(raw.src);
        if (!src)
            return { drop: "image without a real src" };
        return { el: decorate({ ...base, src }, raw) };
    }
    if (kind === "chart") {
        const chart = snapChart(raw.chart);
        if (!chart)
            return { drop: "chart without series" };
        return { el: { ...base, chart } };
    }
    if (kind === "table") {
        const table = snapTable(raw.table);
        if (!table)
            return { drop: "table without headers or rows" };
        return { el: { ...base, table } };
    }
    if (kind === "diagram") {
        const diagram = snapDiagram(raw.diagram);
        if (!diagram) {
            const layout = String(raw.diagram?.layout ?? "");
            return { drop: layout && !isCanvasDiagramLayout(layout) ? `diagram layout "${layout}" not in whitelist` : "diagram needs ≥ 2 items" };
        }
        return { el: { ...base, diagram } };
    }
    if (kind === "device") {
        const device = snapDevice(raw.device);
        if (!device) {
            const type = String(raw.device?.type ?? "");
            return { drop: type && !isDeviceKind(type) ? `device type "${type}" not in whitelist` : "device missing its data" };
        }
        return { el: { ...base, device } };
    }
    if (kind === "shape") {
        const preset = String(raw.preset ?? "").trim();
        if (!isCanvasPresetId(preset))
            return { drop: `shape preset "${preset}" not in whitelist` };
        const text = (raw.text ?? "").trim();
        return {
            el: decorate({
                ...base,
                preset,
                ...(raw.strokeOnly ? { strokeOnly: true } : {}),
                ...(text ? { text: text.slice(0, 60), fontSize: snapFontSize(raw.fontSize ?? sys.typeScale.body, ramp) } : {}),
            }, raw),
        };
    }
    if (kind === "icon") {
        const icon = normalizeIconId(raw.icon);
        if (!isCanvasIconId(icon))
            return { drop: `icon "${icon}" not in whitelist` };
        const side = Math.max(16, Math.min(160, Math.min(bbox.w, bbox.h)));
        return { el: decorate({ ...base, icon, bbox: { ...bbox, w: side, h: side } }, raw) };
    }
    if (kind === "text") {
        const runs = snapRuns(raw.runs);
        const text = (runs ? runs.map((r) => r.text).join("") : raw.text ?? "").trim() || (raw.text ?? "").trim();
        if (!text)
            return { drop: "empty text" };
        let fontSize = page?.content && isTitleSlot(raw.slot)
            ? contentTitleSize(sys, text, bbox)
            : snapFontSize(raw.fontSize ?? inferFontSizeFromSlot(raw.slot, sys, bbox, text), ramp);
        // Running copy never goes below the projection floor (models keep writing 11px sentences;
        // fixing it here saves a repair round). Short labels / numerals may stay at caption size.
        if (fontSize < MIN_READABLE_PX && [...text].length > MAX_CAPTION_CHARS)
            fontSize = MIN_READABLE_PX;
        if (!(page?.content && isTitleSlot(raw.slot)))
            fontSize = fitTextSize(text, fontSize, bbox, ramp, raw.lineHeight, sys);
        const treatment = resolveTreatment(sys, normalizeTreatment(raw.treatment));
        return {
            el: decorate({
                ...base,
                text,
                fontSize,
                ...(treatment ? { treatment } : {}),
                ...(runs ? { runs } : {}),
                ...(raw.fontWeight != null ? { fontWeight: raw.fontWeight } : {}),
                ...(raw.align ? { align: raw.align } : {}),
                ...(raw.lineHeight != null ? { lineHeight: raw.lineHeight } : {}),
                ...(raw.italic ? { italic: true } : {}),
                ...(raw.letterSpacing != null ? { letterSpacing: raw.letterSpacing } : {}),
                ...(raw.caps === "all" ? { caps: "all" } : {}),
                ...(raw.fontFamily ? { fontFamily: raw.fontFamily } : {}),
            }, raw),
        };
    }
    if (kind === "line") {
        const dash = raw.dash === "dash" || raw.dash === "dot" ? raw.dash : "solid";
        const arrow = raw.arrow === "end" || raw.arrow === "both" ? raw.arrow : "none";
        return {
            el: {
                ...base,
                x2: Number.isFinite(raw.x2) ? raw.x2 : bbox.x + bbox.w,
                y2: Number.isFinite(raw.y2) ? raw.y2 : bbox.y,
                hairline: raw.hairline !== false,
                ...(dash !== "solid" ? { dash } : {}),
                ...(arrow !== "none" ? { arrow } : {}),
            },
        };
    }
    if (kind === "rule") {
        // A rule is a hairline along its long axis: a tall narrow bbox is a vertical divider, not a 1×4 dot.
        const vertical = bbox.h > bbox.w;
        const thin = vertical ? { w: Math.min(bbox.w, 4) } : { h: Math.min(bbox.h, 4) };
        return { el: { ...base, hairline: raw.hairline !== false, bbox: { ...bbox, ...thin } } };
    }
    return { el: decorate({ ...base }, raw) };
}
/** Carriers that emit from their bbox and scale their nodes to it (SmartArt cards, chart plot). */
const ROOM_CLAIM_KINDS = new Set(["diagram", "chart"]);
/** Kinds that sit behind / beside content and do not bound the free band. */
const NON_BOUNDING_KINDS = new Set(["overlay", "surface", "bar", "image"]);
/**
 * A page whose one diagram / chart was drawn shallow inside a much taller free band ("header-stack:
 * title, 220px process strip, footnote at the bottom") gets its carrier stretched to that band, one
 * gutter off the neighbours above and below. Core's SmartArt layouts size cards as a fraction of the
 * bbox, so the shallow box gave 110px cards with body copy clipped inside them under 200px of air.
 */
function claimFreeRoom(elements, sys, my) {
    const carriers = elements.filter((e) => ROOM_CLAIM_KINDS.has(e.kind));
    if (carriers.length !== 1)
        return;
    const c = carriers[0];
    const g = sys.grid.gutter;
    let top = my;
    let bottom = CANVAS.height - my;
    // A carrier drawn on a card (surface / rounded rect that contains it) grows only inside that
    // card, keeping the author's inset: cards do not bound the band, but they do frame the carrier.
    const card = elements.find((e) => e !== c &&
        (e.kind === "surface" || e.kind === "shape") &&
        e.bbox.x <= c.bbox.x + 1 &&
        e.bbox.y <= c.bbox.y + 1 &&
        e.bbox.x + e.bbox.w >= c.bbox.x + c.bbox.w - 1 &&
        e.bbox.y + e.bbox.h >= c.bbox.y + c.bbox.h - 1);
    if (card) {
        const inset = Math.max(0, c.bbox.y - card.bbox.y);
        top = Math.max(top, card.bbox.y + inset);
        bottom = Math.min(bottom, card.bbox.y + card.bbox.h - inset);
    }
    for (const e of elements) {
        if (e === c || e === card || NON_BOUNDING_KINDS.has(e.kind))
            continue;
        if (e.bbox.x >= c.bbox.x + c.bbox.w || e.bbox.x + e.bbox.w <= c.bbox.x)
            continue; // beside, not above / below
        const eBottom = e.bbox.y + e.bbox.h;
        if (eBottom <= c.bbox.y + 1)
            top = Math.max(top, eBottom + g);
        else if (e.bbox.y >= c.bbox.y + c.bbox.h - 1)
            bottom = Math.min(bottom, e.bbox.y - g);
        else
            return; // something overlaps the carrier already; leave the author's box alone
    }
    const room = bottom - top;
    // The band already keeps a gutter off each neighbour; anything left beyond that is a box drawn too small.
    if (room - c.bbox.h < 8)
        return;
    c.bbox = { ...c.bbox, y: Math.round(top), h: Math.round(room) };
}
/**
 * An eyebrow drawn 4px above a title ("Coverage" y=32 h=20, title y=56) collides once the
 * renderer adds its insets and line leading: the small label's descenders land on the title's
 * cap line. Keep a breathing gap between stacked free text — half the smaller size, at least
 * 6px — by lifting the upper (smaller) box when there is room, else pushing the lower one down.
 */
export function separateStackedText(elements, my) {
    const texts = elements.filter((e) => e.kind === "text" && e.text && !e.slot.includes("."));
    for (const a of texts) {
        for (const b of texts) {
            if (a === b)
                continue;
            const overlapX = Math.min(a.bbox.x + a.bbox.w, b.bbox.x + b.bbox.w) - Math.max(a.bbox.x, b.bbox.x);
            if (overlapX <= 0)
                continue;
            const gap = b.bbox.y - (a.bbox.y + a.bbox.h);
            if (gap < -2)
                continue; // already intersecting: reflect reports it, moving would hide the author's error
            const small = Math.min(a.fontSize ?? 18, b.fontSize ?? 18);
            const need = Math.max(6, Math.round(small * 0.5));
            if (gap >= need)
                continue;
            const shift = need - gap;
            const upperIsSmaller = (a.fontSize ?? 18) <= (b.fontSize ?? 18);
            if (upperIsSmaller && a.bbox.y - shift >= my)
                a.bbox = { ...a.bbox, y: a.bbox.y - shift };
            else
                b.bbox = { ...b.bbox, y: b.bbox.y + shift };
        }
    }
}
/** Keep at most MAX_FLOATING_PER_PAGE shadow / glow carriers; strip the rest (largest first). Treated display type is kept ahead of cards. */
function capFloating(elements) {
    const floating = elements.filter((e) => e.shadow || e.glow);
    if (floating.length <= MAX_FLOATING_PER_PAGE)
        return;
    floating
        .sort((a, b) => (a.kind === "text" ? 0 : 1) - (b.kind === "text" ? 0 : 1) || b.bbox.w * b.bbox.h - a.bbox.w * a.bbox.h)
        .slice(MAX_FLOATING_PER_PAGE)
        .forEach((e) => {
        delete e.shadow;
        delete e.glow;
    });
}
// ---------------------------------------------------------------------------
// Deck-level passes: agenda targets and the folio decision. Both need every page, so they run
// before / after the per-page snap rather than inside snapEl.
/** The page's title text: the `title` slot, else the largest word-text (numerals excluded). */
export function pageTitleOf(slide) {
    const texts = (slide.elements ?? []).filter((e) => e.kind === "text" && e.text && !NUMERAL_ONLY.test(e.text.trim()));
    const slotted = texts.find((e) => isTitleSlot(e.slot));
    if (slotted)
        return slotted.text.trim();
    return texts.sort((a, b) => (b.fontSize ?? 0) - (a.fontSize ?? 0))[0]?.text?.trim();
}
function normTitle(s) {
    return s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}
/**
 * Every agenda row must open a real page. A row's `target` is kept when it names another page;
 * otherwise it is matched by title, then by the k-th section page after the agenda, then by the
 * k-th content page. Rows that still cannot be placed lose their link rather than jumping to
 * the wrong slide. Mutates `slides` in place (device items only).
 */
export function resolveAgendaTargets(slides) {
    const n = slides.length;
    if (n < 2)
        return;
    const titles = slides.map((s) => normTitle(pageTitleOf(s) ?? ""));
    slides.forEach((slide, i) => {
        for (const el of slide.elements ?? []) {
            const dev = el.device;
            if (el.kind !== "device" || !dev || dev.type !== "agendaList" || !dev.items)
                continue;
            const sections = slides.map((s, j) => j).filter((j) => j > i && String(slides[j].layout).toLowerCase() === "section");
            const content = slides.map((s, j) => j).filter((j) => j > i && !["close", "closing", "cover"].includes(String(slides[j].layout).toLowerCase()));
            const used = new Set();
            dev.items.forEach((it, k) => {
                const explicit = it.target;
                let t = explicit && explicit >= 1 && explicit <= n && explicit - 1 !== i ? explicit : undefined;
                if (t == null && it.title) {
                    const key = normTitle(it.title);
                    if (key.length >= 2) {
                        const j = titles.findIndex((tt, idx) => idx !== i && idx > 0 && tt.length >= 2 && (tt.includes(key) || key.includes(tt)));
                        if (j >= 0)
                            t = j + 1;
                    }
                }
                if (t == null && sections[k] != null)
                    t = sections[k] + 1;
                if (t == null) {
                    const free = content.find((j) => !used.has(j + 1));
                    if (free != null)
                        t = free + 1;
                }
                if (t != null) {
                    it.target = t;
                    used.add(t);
                }
                else {
                    delete it.target;
                }
            });
        }
    });
}
/**
 * A page numeral: a bare 1–2 digit text ("02", "06") sitting in the top third or the bottom
 * 10 % of the page (eyebrow, sidebar numeral, footer folio). KPI values ("41%", "3.2x") and
 * numbers inside devices (step / list numerals carry dotted slots) do not match.
 */
/** Left column a sidebar composition owns (fraction of the page width). */
const SIDEBAR_COLUMN = 0.25;
/** Every page-numeral text on the page: "04" or "04 / 14", in a top or bottom band or the sidebar column, not a device part. */
export function pageNumeralsOf(elements) {
    const out = [];
    for (const e of elements) {
        if (e.kind !== "text" || !e.text)
            continue;
        const t = e.text.trim();
        if (!/^\d{1,2}(?:\s*\/\s*\d{1,2})?$/.test(t))
            continue;
        if (e.slot.includes("."))
            continue; // device part (step numbers, list numerals)
        const cy = e.bbox.y + e.bbox.h / 2;
        // A sidebar composition parks its numeral mid-height in the left column; it is the page's folio.
        const inSidebar = e.bbox.x + e.bbox.w <= CANVAS.width * SIDEBAR_COLUMN;
        if (!inSidebar && cy >= CANVAS.height / 3 && cy < CANVAS.height * 0.9)
            continue;
        out.push(e);
    }
    return out;
}
export function pageNumeralOf(elements) {
    return pageNumeralsOf(elements)[0];
}
function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
/**
 * Folio decision applied deterministically. `false`: strip every page numeral the author drew
 * (a KPI "12" inside a device is not a numeral). `true`: every content page carries one — the
 * author's if present, else a caption-size numeral in the bottom margin (left, or right when the
 * left corner is occupied), so wayfinding never depends on the model remembering every page.
 */
export function applyFolio(elements, sys, pageIdx, content, folio, size = sys.typeScale.caption, deck) {
    const numerals = pageNumeralsOf(elements);
    const existing = numerals[0];
    if (!folio) {
        for (const n of numerals)
            elements.splice(elements.indexOf(n), 1);
        return;
    }
    if (existing) {
        existing.fontSize = size;
        // The author's numeral keeps its style ("4", "04", "04 / 14") but always shows the page's
        // real position — a page-scoped repair pass otherwise renumbers one page and trips the
        // deck-wide "numerals do not count up" gate.
        const raw = existing.text.trim();
        const m = /^(\d{1,2})(\s*\/\s*)(\d{1,2})$/.exec(raw);
        const pad = deck?.pad ?? ((m ? m[1] : raw).startsWith("0") ? 2 : 1);
        const num = String(pageIdx + 1).padStart(pad, "0");
        existing.text = m ? `${num}${m[2]}${deck ? String(deck.total).padStart(pad, "0") : m[3]}` : num;
        // emit paints `runs` when present, so a styled numeral must be rewritten there too.
        if (existing.runs?.length)
            existing.runs = [{ ...existing.runs[0], text: existing.text }];
        // A display "04" in one corner and "04 / 14" in the other is the model numbering twice.
        for (const n of numerals.slice(1))
            elements.splice(elements.indexOf(n), 1);
        return;
    }
    if (!content)
        return;
    const mx = CANVAS.width * sys.grid.margin;
    const my = CANVAS.height * sys.grid.margin;
    const h = Math.round(size * 1.4);
    // Two mono digits plus the text-body insets; too tight a box wraps "02" into two lines.
    const w = Math.round(size * 4);
    const y = CANVAS.height - my - h;
    const spots = [
        { bbox: { x: mx, y, w, h }, align: "start" },
        { bbox: { x: CANVAS.width - mx - w, y, w, h }, align: "end" },
    ];
    const spot = spots.find((s) => !elements.some((e) => e.kind !== "overlay" && e.kind !== "bar" && e.kind !== "surface" && e.kind !== "image" && overlaps(s.bbox, e.bbox)));
    if (!spot)
        return;
    elements.push({
        slot: "folio",
        kind: "text",
        name: "slot:folio",
        bbox: spot.bbox,
        paintRole: "muted",
        text: String(pageIdx + 1).padStart(deck?.pad ?? 2, "0"),
        fontSize: size,
        fontFamily: sys.fonts.mono,
        align: spot.align,
        lineHeight: 1,
    });
}
/** snapCanvas with the drop report (used to build the repair prompt). */
export function snapCanvasReport(slides, sys, opts = {}) {
    const mx = CANVAS.width * sys.grid.margin;
    const my = CANVAS.height * sys.grid.margin;
    const ramp = canvasTypeRamp(sys);
    const drops = [];
    resolveAgendaTargets(slides);
    const out = slides.map((slide, i) => {
        const elements = [];
        const page = { content: isContentPage(slide.layout, opts.briefs?.[i]) };
        for (const el of slide.elements ?? []) {
            const outcome = snapEl(el, sys, ramp, mx, my, page);
            if (!outcome)
                continue;
            if ("drop" in outcome) {
                drops.push({ slideIdx: i, slot: el.slot || el.kind, reason: outcome.drop });
                continue;
            }
            if (outcome.el.kind === "device") {
                const expanded = expandDevice(outcome.el, sys);
                if (!expanded.length) {
                    drops.push({ slideIdx: i, slot: el.slot || el.kind, reason: "device expanded to nothing" });
                    continue;
                }
                for (const part of expanded) {
                    const snapped = snapEl(part, sys, ramp, mx, my);
                    if (snapped && "el" in snapped)
                        elements.push(snapped.el);
                }
                continue;
            }
            elements.push(outcome.el);
        }
        claimFreeRoom(elements, sys, my);
        separateStackedText(elements, my);
        applyTreatments(elements, sys, page);
        capFloating(elements);
        if (page.content) {
            // Slot-named titles were forced in snapEl; this covers the (common) unnamed case.
            const title = findContentTitle(elements, sys);
            if (title && !isTitleSlot(title.slot))
                title.fontSize = contentTitleSize(sys, title.text ?? "", title.bbox);
        }
        const background = snapBackground(slide.background, elements, sys);
        return {
            layout: (slide.layout || `page-${i + 1}`).slice(0, 40),
            variant: (slide.variant || "canvas").slice(0, 40),
            elements,
            ...(background ? { background } : {}),
        };
    });
    if (opts.folio != null) {
        // Deck pass: one folio size (the author's most common numeral size, else caption) on every
        // content page, or none anywhere.
        const authored = out.map((s) => pageNumeralOf(s.elements)).filter((e) => e != null);
        const sizes = authored.map((e) => e.fontSize).filter((n) => n != null);
        const mode = sizes.length ? [...sizes].sort((a, b) => sizes.filter((x) => x === b).length - sizes.filter((x) => x === a).length)[0] : undefined;
        // One numeral style across the deck: zero-padded if the author padded anywhere.
        const pad = !authored.length || authored.some((e) => /^0\d/.test(e.text?.trim() ?? "")) ? 2 : 1;
        out.forEach((s, i) => {
            const anchor = ANCHOR_LAYOUTS.has(String(s.layout).toLowerCase()) || opts.briefs?.[i]?.rhythm === "anchor";
            applyFolio(s.elements, sys, i, !anchor && i > 0 && i < out.length - 1, opts.folio, mode, { total: out.length, pad });
        });
    }
    return { slides: out, drops };
}
export function snapCanvas(slides, sys, opts = {}) {
    return snapCanvasReport(slides, sys, opts).slides;
}
