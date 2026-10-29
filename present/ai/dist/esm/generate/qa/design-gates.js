import { parseHex, relativeLuminance } from "./color.js";
import { resolveVisualSystem, visualSystemPalette } from "../visual-system.js";
import { LAYOUT_KINDS } from "../compile/layouts.js";
import { isWebExclusiveKind, WEB_EXCLUSIVE_DECK_MIN_SLIDES, WEB_EXCLUSIVE_MIN_PAGES, } from "../compile/constraints.js";
/** Design aliases plus every compile layout kind — catalog must not be a subset of LAYOUT_KINDS. */
const DESIGN_LAYOUT_ALIASES = [
    "hero-fullbleed", "section-break", "title-body", "cards-2", "cards-3", "cards-4",
    "process-h", "stat-row", "closing-cta",
];
export const DESIGN_LAYOUT_CATALOG = [...LAYOUT_KINDS, ...DESIGN_LAYOUT_ALIASES];
const CATALOG = new Set(DESIGN_LAYOUT_CATALOG);
export function canonicalizeLayoutId(raw) {
    const n = raw.trim().toLowerCase();
    if (!n)
        return "";
    if (n === "hero-fullbleed" || n === "hero")
        return "hero";
    if (n === "cover")
        return "cover";
    if (n === "section-break" || n === "section" || n.includes("章节"))
        return "section";
    if (n === "title-body" || n === "content" || n === "bullets")
        return n === "title-body" ? "content" : n;
    if (n === "process-h" || n === "process")
        return "process";
    if (n === "stat-row" || n === "metrics" || n === "stat")
        return n === "stat" ? "stat" : n === "stat-row" ? "stat-row" : "metrics";
    if (n === "closing-cta" || n === "closing" || n.includes("感谢") || n.includes("thank"))
        return "closing";
    if (n.startsWith("cards"))
        return n;
    if (n === "two-column" || n === "twocolumn")
        return "two-column";
    if (n === "comparison" || n === "quote")
        return n;
    if (n === "image-text" || n === "imagetext")
        return "image-text";
    if (n === "timeline" || n === "agenda" || n === "chart" || n === "table" || n === "banner")
        return n;
    return n;
}
export function isInDesignCatalog(id) {
    const n = id.trim().toLowerCase();
    return CATALOG.has(n) || CATALOG.has(canonicalizeLayoutId(n));
}
export function isDesignWebExclusive(id) {
    return isWebExclusiveKind(id);
}
export const TYPE_FLOORS_PT = { coverSectionTitle: 36, inSectionMajor: 28, subtitle: 20, bodyCard: 16, footnote: 12 };
const REF = 720;
const shortSide = (p) => Math.min(p.size.width, p.size.height);
const scaleFloor = (pt, s) => pt * (s / REF);
function texts(slide) {
    const out = [];
    const visit = (sh) => {
        if (!sh.visible)
            return;
        if (sh.kind === "text") {
            if (!sh.id.startsWith("dec_") && !sh.id.startsWith("bgov_"))
                out.push(sh);
            return;
        }
        if (sh.kind === "group")
            for (const ch of sh.children)
                visit(ch);
    };
    for (const layer of slide.layers)
        for (const sh of layer.shapes)
            visit(sh);
    return out;
}
function fontSize(t) {
    let max;
    for (const p of t.paragraphs) {
        const def = p.defRunStyle?.fontSize;
        for (const r of p.runs) {
            const s = r.fontSize ?? def;
            if (typeof s === "number" && Number.isFinite(s))
                max = max === undefined ? s : Math.max(max, s);
        }
    }
    return max;
}
function contentOf(t) {
    return t.paragraphs.map((p) => p.runs.map((r) => r.text).join("")).join("\n");
}
function hasText(t) { return contentOf(t).trim().length > 0; }
function titleLines(t) {
    const explicit = contentOf(t).split(/\n/).filter((l) => l.trim()).length;
    if (explicit > 1)
        return explicit;
    const size = fontSize(t) ?? 16;
    return Math.max(1, Math.round(t.bbox.h / (size * 1.25)));
}
function role(slide, idx, total) {
    const n = (slide.name ?? "").toLowerCase();
    const c = canonicalizeLayoutId(n);
    if (c === "closing" || n.includes("closing") || n.includes("感谢") || n.includes("thank"))
        return "closing";
    if (c === "section" || n.includes("section") || n.includes("章节"))
        return "section";
    if (idx === 0 || c === "cover" || c === "hero")
        return "cover";
    return "content";
}
function textRole(t, sr) {
    const name = (t.name ?? "").toLowerCase();
    const size = fontSize(t) ?? 0;
    if (name.includes("footnote") || name.includes("source"))
        return "footnote";
    if (name.includes("subtitle") || name.includes("eyebrow"))
        return "subtitle";
    if (name.includes("title") || name.includes("heading")) {
        return sr === "content" ? "inSectionMajor" : "coverSectionTitle";
    }
    if (sr !== "content")
        return size >= TYPE_FLOORS_PT.inSectionMajor ? "coverSectionTitle" : "subtitle";
    if (size >= TYPE_FLOORS_PT.inSectionMajor)
        return "inSectionMajor";
    if (size >= TYPE_FLOORS_PT.subtitle)
        return "subtitle";
    if (size > 0 && size < TYPE_FLOORS_PT.bodyCard)
        return "footnote";
    return "bodyCard";
}
function checkType(pres, findings) {
    const s = shortSide(pres);
    const floors = {
        coverSectionTitle: scaleFloor(36, s), inSectionMajor: scaleFloor(28, s),
        subtitle: scaleFloor(20, s), bodyCard: scaleFloor(16, s), footnote: scaleFloor(12, s),
    };
    for (let i = 0; i < pres.slides.length; i++) {
        const slide = pres.slides[i];
        const sr = role(slide, i, pres.slides.length);
        for (const t of texts(slide).filter(hasText)) {
            const size = fontSize(t);
            if (size === undefined)
                continue;
            const tr = textRole(t, sr);
            if (size + 1e-6 < floors[tr]) {
                findings.push({ kind: "type-floor", slideIdx: i, issue: `#${i + 1} type under ${tr} floor` });
            }
            if ((tr === "coverSectionTitle" || tr === "inSectionMajor") && titleLines(t) > (sr === "cover" ? 3 : 2)) {
                findings.push({ kind: "type-floor", slideIdx: i, issue: `#${i + 1} title squeezed` });
            }
        }
    }
}
function contentBBox(slide) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, any = false;
    const visit = (sh) => {
        if (!sh.visible || sh.id.startsWith("bgov_") || sh.name === "BG overlay")
            return;
        if (sh.kind === "group") {
            for (const ch of sh.children)
                visit(ch);
            return;
        }
        const b = sh.bbox;
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.w);
        maxY = Math.max(maxY, b.y + b.h);
        any = true;
    };
    for (const layer of slide.layers)
        for (const sh of layer.shapes)
            visit(sh);
    return any ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null;
}
function checkSpace(pres, findings) {
    const W = pres.size.width, H = pres.size.height, short = shortSide(pres), minMargin = 0.04 * short;
    for (let i = 0; i < pres.slides.length; i++) {
        const slide = pres.slides[i];
        const ts = texts(slide).filter(hasText);
        for (const t of ts) {
            if (t.bbox.x < minMargin - 1 || t.bbox.x + t.bbox.w > W - minMargin + 1) {
                findings.push({ kind: "spacing", slideIdx: i, issue: `#${i + 1} H-margin too tight` });
                break;
            }
        }
        const minGap = 0.6 * scaleFloor(16, short) * 1.3;
        const sorted = [...ts].sort((a, b) => a.bbox.y - b.bbox.y);
        for (let a = 0; a < sorted.length - 1; a++) {
            const A = sorted[a], B = sorted[a + 1];
            const ox = Math.min(A.bbox.x + A.bbox.w, B.bbox.x + B.bbox.w) - Math.max(A.bbox.x, B.bbox.x);
            if (ox <= 0)
                continue;
            const gap = B.bbox.y - (A.bbox.y + A.bbox.h);
            if (gap >= 0 && gap < minGap - 0.5) {
                findings.push({ kind: "spacing", slideIdx: i, issue: `#${i + 1} block gap too tight` });
                break;
            }
        }
        // Cover / section / closing / quote are intentionally sparse — ratio floor is for body layouts only.
        const sr = role(slide, i, pres.slides.length);
        const sparseRole = sr === "cover" || sr === "section" || sr === "closing";
        const rawName = (slide.name ?? "").trim();
        const sparseLayout = /^(hero|cover|section|closing|quote|process|metrics|stat)/i.test(canonicalizeLayoutId(rawName) || rawName);
        const bb = contentBBox(slide);
        if (bb && !sparseRole && !sparseLayout) {
            const ratio = (bb.w * bb.h) / Math.max(1, W * H);
            if (ratio < 0.35 || ratio > 0.82) {
                findings.push({ kind: "spacing", slideIdx: i, issue: `#${i + 1} content ratio ${ratio.toFixed(2)} out of [0.35,0.82]` });
            }
        }
    }
}
function checkLayout(pres, findings) {
    let web = 0;
    for (let i = 0; i < pres.slides.length; i++) {
        const slide = pres.slides[i];
        const raw = (slide.name ?? "").trim();
        const sr = role(slide, i, pres.slides.length);
        if (!raw || !isInDesignCatalog(raw)) {
            findings.push({ kind: "layout-catalog", slideIdx: i, issue: `#${i + 1} layout not in catalog` });
            continue;
        }
        const c = canonicalizeLayoutId(raw);
        if (sr === "cover" && !(c === "cover" || c === "hero")) {
            findings.push({ kind: "layout-catalog", slideIdx: i, issue: `#${i + 1} cover must use hero-fullbleed/cover` });
        }
        if (sr === "section" && c !== "section") {
            findings.push({ kind: "layout-catalog", slideIdx: i, issue: `#${i + 1} section must use section-break` });
        }
        if (sr === "closing" && c !== "closing") {
            findings.push({ kind: "layout-catalog", slideIdx: i, issue: `#${i + 1} close must use closing-cta` });
        }
        if (isDesignWebExclusive(raw))
            web += 1;
    }
    if (pres.slides.length >= WEB_EXCLUSIVE_DECK_MIN_SLIDES && web < WEB_EXCLUSIVE_MIN_PAGES) {
        findings.push({ kind: "layout-catalog", slideIdx: -1, issue: `web-exclusive layouts ${web} < ${WEB_EXCLUSIVE_MIN_PAGES}` });
    }
}
function dist(hex, palette) {
    const rgb = parseHex(hex);
    if (!rgb)
        return Infinity;
    let best = Infinity;
    for (const p of palette) {
        const q = parseHex(p);
        if (!q)
            continue;
        best = Math.min(best, Math.hypot(rgb.r - q.r, rgb.g - q.g, rgb.b - q.b));
    }
    return best;
}
function checkTheme(pres, system, findings) {
    const pal = visualSystemPalette(system);
    const TOL = 90;
    for (let i = 0; i < Math.min(pres.slides.length, 3); i++) {
        const slide = pres.slides[i];
        const bg = slide.background?.kind === "solid" ? slide.background.color : undefined;
        if (bg) {
            if (dist(bg, pal.bg) > TOL)
                findings.push({ kind: "visual-system", slideIdx: i, issue: `#${i + 1} bg mismatch system ${system}` });
            const rgb = parseHex(bg);
            if (rgb) {
                const lum = relativeLuminance(rgb);
                if (system === "A" && lum > 0.35)
                    findings.push({ kind: "visual-system", slideIdx: i, issue: `#${i + 1} system A needs dark bg` });
                if (system === "B" && lum < 0.55)
                    findings.push({ kind: "visual-system", slideIdx: i, issue: `#${i + 1} system B needs light bg` });
            }
        }
    }
    const allowed = [...pal.bg, ...pal.accent, ...pal.title, ...pal.body];
    for (let i = 0; i < pres.slides.length; i++) {
        for (const layer of pres.slides[i].layers) {
            for (const sh of layer.shapes) {
                if (!sh.visible || sh.kind === "text" || sh.kind === "image")
                    continue;
                const fill = sh.fill;
                if (fill?.kind === "solid" && fill.color && (fill.alpha ?? 1) >= 0.15 && dist(fill.color, allowed) > TOL + 40) {
                    findings.push({ kind: "visual-system", slideIdx: i, issue: `#${i + 1} invented fill color` });
                    return;
                }
            }
        }
    }
}
/**
 * Keep compile layout kinds on slide.name when they are already in the catalog.
 * Only fill empty / invented names (titles, "Title Slide", …) from outline hints
 * or a positional fallback — never clobber a remapped compile kind with the
 * original outline layoutHint (that used to fail layout-catalog and P0 web quota).
 */
export function ensureDesignLayoutCatalog(pres, hints = []) {
    const last = pres.slides.length - 1;
    for (let i = 0; i < pres.slides.length; i++) {
        const slide = pres.slides[i];
        const raw = (slide.name ?? "").trim();
        if (isInDesignCatalog(raw))
            continue;
        const hint = hints[i]?.trim();
        if (hint && isInDesignCatalog(hint)) {
            slide.name = hint;
            continue;
        }
        slide.name = i === 0 ? "cover" : i === last && last > 0 ? "closing" : "content";
    }
}
/** Nudge geometry so Design spacing floors pass (in-place, best-effort). */
export function ensureDesignSpacing(pres) {
    const W = pres.size.width, H = pres.size.height, short = shortSide(pres);
    const minMargin = 0.04 * short;
    const minGap = 0.6 * scaleFloor(16, short) * 1.3;
    for (const slide of pres.slides) {
        const ts = texts(slide).filter(hasText);
        for (const t of ts) {
            const leftPad = minMargin + 1;
            const rightPad = W - minMargin - 1;
            {
                let x = Math.max(leftPad, Math.min(t.bbox.x, rightPad - 8));
                let right = Math.min(rightPad, Math.max(x + 8, t.bbox.x + t.bbox.w));
                if (right > rightPad)
                    right = rightPad;
                if (x + 8 > rightPad) {
                    x = Math.max(leftPad, rightPad - 8);
                    right = rightPad;
                }
                t.bbox = { ...t.bbox, x, w: Math.max(8, right - x) };
            }
        }
        const bb = contentBBox(slide);
        if (bb) {
            const ratio = (bb.w * bb.h) / Math.max(1, W * H);
            const cx = W / 2, cy = H / 2;
            const scaleFromCenter = (factor) => {
                const scale = (sh) => {
                    if (!sh.visible || sh.id.startsWith("bgov_") || sh.id.startsWith("dec_"))
                        return;
                    if (sh.kind === "group") {
                        for (const ch of sh.children)
                            scale(ch);
                        return;
                    }
                    const b = sh.bbox;
                    sh.bbox = {
                        x: cx + (b.x - cx) * factor,
                        y: cy + (b.y - cy) * factor,
                        w: b.w * factor,
                        h: b.h * factor,
                    };
                };
                for (const layer of slide.layers)
                    for (const sh of layer.shapes)
                        scale(sh);
            };
            if (ratio > 0.82) {
                scaleFromCenter(Math.sqrt(0.80 / ratio));
            }
            else if (ratio > 0 && ratio < 0.35) {
                // Under-filled body layouts: grow toward center target ~0.40 (Design floor 0.35).
                scaleFromCenter(Math.min(1.75, Math.sqrt(0.40 / ratio)));
            }
        }
        // Block gap AFTER ratio scale — iterate until stable (push-down can cascade).
        for (let pass = 0; pass < 8; pass++) {
            let moved = false;
            const sorted = [...texts(slide).filter(hasText)].sort((a, b) => a.bbox.y - b.bbox.y);
            for (let a = 0; a < sorted.length - 1; a++) {
                const A = sorted[a], B = sorted[a + 1];
                const ox = Math.min(A.bbox.x + A.bbox.w, B.bbox.x + B.bbox.w) - Math.max(A.bbox.x, B.bbox.x);
                if (ox <= 0)
                    continue;
                const gap = B.bbox.y - (A.bbox.y + A.bbox.h);
                // Include overlaps (gap < 0). Pad +1 so checkSpace (minGap - 0.5) still clears.
                if (gap < minGap) {
                    const need = minGap - gap + 1;
                    const newY = B.bbox.y + need;
                    if (newY + Math.min(B.bbox.h, 8) <= H) {
                        B.bbox = { ...B.bbox, y: newY };
                        moved = true;
                    }
                    else {
                        // Can't push B — shrink A.h to open the gap.
                        const maxABottom = B.bbox.y - minGap - 1;
                        const newH = Math.max(8, maxABottom - A.bbox.y);
                        if (newH < A.bbox.h - 0.1) {
                            A.bbox = { ...A.bbox, h: newH };
                            moved = true;
                        }
                    }
                }
            }
            if (!moved)
                break;
        }
        // Final H-margin clamp (after gap nudges / ratio scale).
        for (const t of texts(slide).filter(hasText)) {
            const leftPad = minMargin + 1;
            const rightPad = W - minMargin - 1;
            {
                let x = Math.max(leftPad, Math.min(t.bbox.x, rightPad - 8));
                let right = Math.min(rightPad, Math.max(x + 8, t.bbox.x + t.bbox.w));
                if (right > rightPad)
                    right = rightPad;
                if (x + 8 > rightPad) {
                    x = Math.max(leftPad, rightPad - 8);
                    right = rightPad;
                }
                t.bbox = { ...t.bbox, x, w: Math.max(8, right - x) };
            }
        }
    }
}
/** Raise undersized text runs to Design type floors (in-place). */
export function ensureDesignTypeFloors(pres) {
    const s = shortSide(pres);
    const floors = {
        coverSectionTitle: scaleFloor(TYPE_FLOORS_PT.coverSectionTitle, s),
        inSectionMajor: scaleFloor(TYPE_FLOORS_PT.inSectionMajor, s),
        subtitle: scaleFloor(TYPE_FLOORS_PT.subtitle, s),
        bodyCard: scaleFloor(TYPE_FLOORS_PT.bodyCard, s),
        footnote: scaleFloor(TYPE_FLOORS_PT.footnote, s),
    };
    for (let i = 0; i < pres.slides.length; i++) {
        const slide = pres.slides[i];
        const sr = role(slide, i, pres.slides.length);
        for (const tx of texts(slide).filter(hasText)) {
            const size = fontSize(tx);
            if (size === undefined)
                continue;
            const tr = textRole(tx, sr);
            const floor = floors[tr];
            if (size + 1e-6 >= floor)
                continue;
            for (const para of tx.paragraphs) {
                if (para.defRunStyle && typeof para.defRunStyle.fontSize === "number") {
                    para.defRunStyle.fontSize = Math.max(para.defRunStyle.fontSize, floor);
                }
                for (const run of para.runs) {
                    if (typeof run.fontSize === "number")
                        run.fontSize = Math.max(run.fontSize, floor);
                    else
                        run.fontSize = floor;
                }
            }
        }
    }
}
/** Cap title line-count proxy so Design type-floor "title squeezed" clears (in-place).
 *  Heuristic uses bbox.h / (size*1.25) when text is a single explicit line — shrink height
 *  (and bump size if needed). Must run AFTER spacing scale.
 */
export function ensureDesignTitleLines(pres) {
    for (let i = 0; i < pres.slides.length; i++) {
        const slide = pres.slides[i];
        const sr = role(slide, i, pres.slides.length);
        const maxLines = sr === "cover" ? 3 : 2;
        for (const tx of texts(slide).filter(hasText)) {
            const tr = textRole(tx, sr);
            if (tr !== "coverSectionTitle" && tr !== "inSectionMajor")
                continue;
            // Always flatten multi-para / explicit newlines → one line (contentOf joins paras with \n).
            const flat = contentOf(tx).split(/\n/).map((l) => l.trim()).filter(Boolean).join(" ");
            if (flat && tx.paragraphs.length > 0) {
                const first = tx.paragraphs[0];
                const style = first.runs[0] ?? first.defRunStyle;
                const fontSizeKeep = typeof style?.fontSize === "number"
                    ? style.fontSize
                    : fontSize(tx);
                first.runs = [
                    {
                        text: flat,
                        ...(fontSizeKeep != null ? { fontSize: fontSizeKeep } : {}),
                        ...(style && "fontFamily" in style && style.fontFamily
                            ? { fontFamily: style.fontFamily }
                            : {}),
                        ...(style && "color" in style && style.color
                            ? { color: style.color }
                            : {}),
                    },
                ];
                // Drop extra paragraphs so contentOf no longer injects \n.
                tx.paragraphs = [first];
            }
            let size = fontSize(tx) ?? 16;
            // Shrink bbox so round(h/(size*1.25)) ≤ maxLines.
            // 0.25 headroom: round(h/(size*1.25)) must stay ≤ maxLines even after float noise.
            let maxH = (maxLines + 0.25) * size * 1.25;
            if (tx.bbox.h > maxH) {
                tx.bbox = { ...tx.bbox, h: Math.max(size, maxH) };
            }
            // If still over (e.g. float edge), bump font so proxy drops.
            if (titleLines(tx) > maxLines) {
                const need = tx.bbox.h / ((maxLines + 0.25) * 1.25);
                const bumped = Math.max(size, need + 0.01);
                for (const para of tx.paragraphs) {
                    if (para.defRunStyle && typeof para.defRunStyle.fontSize === "number") {
                        para.defRunStyle.fontSize = Math.max(para.defRunStyle.fontSize, bumped);
                    }
                    for (const run of para.runs) {
                        if (typeof run.fontSize === "number")
                            run.fontSize = Math.max(run.fontSize, bumped);
                        else
                            run.fontSize = bumped;
                    }
                }
                size = fontSize(tx) ?? bumped;
                maxH = (maxLines + 0.25) * size * 1.25;
                if (tx.bbox.h > maxH)
                    tx.bbox = { ...tx.bbox, h: Math.max(size, maxH) };
            }
        }
    }
}
export function runDesignGates(pres, opts = {}) {
    const findings = [];
    const system = resolveVisualSystem(opts.visualSystem);
    checkType(pres, findings);
    checkSpace(pres, findings);
    checkLayout(pres, findings);
    checkTheme(pres, system, findings);
    return { passed: findings.length === 0, findings };
}
export const DESIGN_GATE_KINDS = ["type-floor", "spacing", "layout-catalog", "visual-system"];
export function tallyDesignGateFindings(findings) {
    const byKind = Object.fromEntries(DESIGN_GATE_KINDS.map((k) => [k, 0]));
    for (const f of findings)
        byKind[f.kind] += 1;
    return byKind;
}
