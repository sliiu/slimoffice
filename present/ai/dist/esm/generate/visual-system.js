/**
 * Design P1 visual systems (wizard default A).
 * Locked palettes — no free color invent. Design-gate assert #4 matches these.
 */
export const VISUAL_SYSTEM_IDS = ["A", "B"];
/** A dark-launch: midnight + champagne + white titles */
export const VISUAL_SYSTEM_A = {
    id: "A",
    bg: ["#0b1220", "#0f172a", "#111827", "#020617", "#0a0f1c"],
    accent: ["#d4af37", "#c9a227", "#e8d5a3", "#b8860b", "#f0e6c8"],
    title: ["#ffffff", "#f8fafc", "#f1f5f9", "#e2e8f0"],
    body: ["#e2e8f0", "#cbd5e1", "#f8fafc", "#ffffff"],
};
/** B light-magazine: paper white/light gray + one accent + dark type */
export const VISUAL_SYSTEM_B = {
    id: "B",
    bg: ["#ffffff", "#fafafa", "#f8fafc", "#f5f5f4", "#f1f5f9", "#eeeeee"],
    accent: ["#2563eb", "#1d4ed8", "#0f766e", "#b45309", "#7c3aed", "#dc2626"],
    title: ["#0f172a", "#111827", "#1e293b", "#0a0a0a"],
    body: ["#1e293b", "#334155", "#0f172a", "#374151"],
};
export const VISUAL_SYSTEMS = {
    A: VISUAL_SYSTEM_A,
    B: VISUAL_SYSTEM_B,
};
export function resolveVisualSystem(id) {
    return id === "B" ? "B" : "A";
}
export function visualSystemPalette(id) {
    return VISUAL_SYSTEMS[resolveVisualSystem(id)];
}
/** Stamp solid slide backgrounds from the locked Design visual-system palette. */
const FULL_BLEED_NAME_RE = /\b(cover|hero|section|closing)\b/i;
/** Stamp solid slide backgrounds from the locked Design visual-system palette.
 *  Skip full-bleed structural slides (cover/hero/section/closing) and existing
 *  image backgrounds — P0 cover-visual requires image + dark overlay there. */
export function applyVisualSystemBackgrounds(slides, system) {
    const pal = visualSystemPalette(system);
    const bg = pal.bg[0] ?? "#0b1220";
    for (const slide of slides) {
        if (slide.background?.kind === "image")
            continue;
        const n = (slide.name ?? "").toLowerCase();
        if (FULL_BLEED_NAME_RE.test(n))
            continue;
        slide.background = { kind: "solid", color: bg };
    }
}
function parseHexRgb(hex) {
    const h = hex.trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}$/.test(h))
        return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function nearestPaletteColor(hex, palette) {
    const rgb = parseHexRgb(hex);
    if (!rgb)
        return palette[0] ?? hex;
    let best = palette[0] ?? hex;
    let bestD = Infinity;
    for (const p of palette) {
        const q = parseHexRgb(p);
        if (!q)
            continue;
        const d = Math.hypot(rgb.r - q.r, rgb.g - q.g, rgb.b - q.b);
        if (d < bestD) {
            bestD = d;
            best = p;
        }
    }
    return best;
}
/**
 * Remap out-of-palette solid fills on non-text shapes to the locked visual-system
 * palette (Design visual-system gate). Mutates in place.
 */
export function ensureVisualSystemFills(slides, system) {
    const pal = visualSystemPalette(system);
    const allowed = [...pal.bg, ...pal.accent, ...pal.title, ...pal.body];
    const TOL = 130; // match Design gate TOL+40
    const visit = (sh) => {
        if (sh.visible === false)
            return;
        if (sh.kind === "group" && Array.isArray(sh.children)) {
            for (const ch of sh.children)
                visit(ch);
            return;
        }
        if (sh.kind === "text" || sh.kind === "image")
            return;
        const fill = sh.fill;
        if (!fill || fill.kind !== "solid" || !fill.color || (fill.alpha ?? 1) < 0.15)
            return;
        const rgb = parseHexRgb(fill.color);
        if (!rgb)
            return;
        let bestD = Infinity;
        for (const p of allowed) {
            const q = parseHexRgb(p);
            if (!q)
                continue;
            bestD = Math.min(bestD, Math.hypot(rgb.r - q.r, rgb.g - q.g, rgb.b - q.b));
        }
        if (bestD > TOL) {
            fill.color = nearestPaletteColor(fill.color, allowed);
        }
    };
    for (const slide of slides) {
        for (const layer of slide.layers) {
            for (const sh of layer.shapes)
                visit(sh);
        }
    }
}
