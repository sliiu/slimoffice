"use strict";
/**
 * Apply ColorTheme last. Must not change layout, variant, or geometry.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyColorTheme = applyColorTheme;
exports.backdropOf = backdropOf;
exports.bestTextToken = bestTextToken;
const color_theme_js_1 = require("./color-theme.js");
const color_js_1 = require("../generate/qa/color.js");
function applyColorTheme(slides, theme) {
    const pal = (0, color_theme_js_1.paletteOf)(theme);
    return slides.map((slide) => {
        const elements = slide.elements.map((el) => ({
            ...el,
            bbox: { ...el.bbox },
            color: pal[el.paintRole] ?? pal.ink,
        }));
        liftPanelsUnderText(elements);
        ensureTextReads(elements, slide.background, pal, theme.onPhoto);
        return { ...slide, elements };
    });
}
/** Stand-in for an unknown photo when only the scrim is known: mid grey. */
const PHOTO_MID = { r: 128, g: 128, b: 128 };
/**
 * What a text element visually sits on: the panel under it, else the slide field — solid paper,
 * the middle of a linear field, or the scrimmed side of a photo. `undefined` = cannot be known
 * (photo with no scrim / overlay), in which case the element is left alone.
 */
function backdropOf(elements, ti, background, pal) {
    const panel = panelUnder(elements, ti);
    if (panel)
        return (0, color_js_1.parseHex)(panel.color) ?? undefined;
    if (!background || background.kind === "solid")
        return (0, color_js_1.parseHex)(pal[background?.paintRole ?? "bg"] ?? pal.bg) ?? undefined;
    if (background.kind === "linear") {
        const from = (0, color_js_1.parseHex)(pal[background.paintRole ?? "bg"] ?? pal.bg);
        const to = (0, color_js_1.parseHex)(pal[background.toRole ?? "accent"] ?? pal.accent);
        if (!from || !to)
            return undefined;
        return (0, color_js_1.mixRgb)(from, to, 0.5);
    }
    const scrimColor = (0, color_js_1.parseHex)(pal[background.overlayRole ?? "ink"] ?? pal.ink);
    if (!scrimColor)
        return undefined;
    if (background.scrim)
        return (0, color_js_1.mixRgb)(PHOTO_MID, scrimColor, Math.min(1, background.scrim.strength * 0.85));
    if ((background.overlay ?? 0) > 0.001)
        return (0, color_js_1.mixRgb)(PHOTO_MID, scrimColor, background.overlay);
    return undefined;
}
/**
 * Every text element must clear WCAG AA on what it sits on. The author picks roles by meaning
 * (`muted` for a caption, `accent` for a numeral) and cannot see the hex; a muted caption on an
 * accent sidebar or a lemon numeral on white is the #1 "看不清" complaint on live decks. When a
 * pairing fails, swap the text for the palette token of the same polarity that reads best —
 * never a hex outside the deck palette, so the deck stays in one family and the palette gate
 * stays green.
 */
function ensureTextReads(elements, background, pal, onPhoto) {
    for (let ti = 0; ti < elements.length; ti += 1) {
        const t = elements[ti];
        if (t.kind !== "text" || !t.text?.trim())
            continue;
        const fg = (0, color_js_1.parseHex)(t.color);
        const bg = backdropOf(elements, ti, background, pal);
        if (!fg || !bg)
            continue;
        t.backdrop = (0, color_js_1.toHex)(bg);
        const min = aaThreshold(t);
        if ((0, color_js_1.contrastRatio)(fg, bg) >= min)
            continue;
        const next = bestTextToken(bg, min, pal, onPhoto);
        if (!next || next.toLowerCase() === t.color.toLowerCase())
            continue;
        t.recoloredFrom = t.color;
        t.color = next;
    }
}
/** Palette token (plus onPhoto) that clears `min` on `bg`, preferring the polarity opposite the field; else the best available. */
function bestTextToken(bg, min, pal, onPhoto) {
    const darkField = (0, color_js_1.relativeLuminance)(bg) < 0.5;
    const light = [onPhoto, pal.bg, pal.surface, pal.accentSoft, pal.line].filter((c) => Boolean(c));
    const dark = [pal.ink, pal.muted, pal.accent];
    const ordered = darkField ? [...light, ...dark] : [...dark, ...light];
    let best;
    let bestRatio = 0;
    for (const hex of ordered) {
        const rgb = (0, color_js_1.parseHex)(hex);
        if (!rgb)
            continue;
        const ratio = (0, color_js_1.contrastRatio)(rgb, bg);
        if (ratio >= min)
            return hex;
        if (ratio > bestRatio) {
            bestRatio = ratio;
            best = hex;
        }
    }
    return best;
}
/** Panels lighter than this (relative luminance) are never darkened for light copy. */
const MAX_LIFTABLE_LUMINANCE = 0.4;
/** WCAG AA threshold for a run: 3:1 for large text (≥24px, or ≥19px bold), 4.5:1 otherwise. */
function aaThreshold(el) {
    const size = el.fontSize ?? 16;
    const weight = el.fontWeight ?? 400;
    return size >= 24 || (size >= 19 && weight >= 700) ? 3 : 4.5;
}
/**
 * Light copy on a coloured panel (accent band, callout, ink sidebar) inherits the panel's token
 * colour. Some accents — a saturated orange, a mid blue — give light text only ~4:1. Rather than
 * flipping the text to ink (ugly, and QA would do exactly that later), push the *panel* a step
 * darker until the pairing clears AA. Rules, numerals and icons keep the untouched accent. Dark
 * copy on light chips (muted label on accentSoft) is left to QA's palette-aware text recolour.
 */
function liftPanelsUnderText(elements) {
    for (let ti = 0; ti < elements.length; ti += 1) {
        const t = elements[ti];
        if (t.kind !== "text" || !t.text?.trim())
            continue;
        const fg = (0, color_js_1.parseHex)(t.color);
        if (!fg || (0, color_js_1.relativeLuminance)(fg) <= 0.5)
            continue;
        const panel = panelUnder(elements, ti);
        if (!panel)
            continue;
        const bg = (0, color_js_1.parseHex)(panel.color);
        if (!bg)
            continue;
        // Only a field that is already dark or saturated (accent / ink) gets pushed darker. Light copy
        // on a cream card is a wrong pairing, not a weak one — darkening the card 60 % yields an
        // off-palette grey (live: #EFEBE3 → #605e5b); QA flips that text to ink instead.
        if ((0, color_js_1.relativeLuminance)(bg) > MAX_LIFTABLE_LUMINANCE)
            continue;
        const min = aaThreshold(t);
        if ((0, color_js_1.contrastRatio)(fg, bg) >= min)
            continue;
        const from = panel.liftedFrom ?? panel.color;
        panel.color = (0, color_js_1.toHex)((0, color_js_1.ensureContrast)(bg, fg, { r: 0, g: 0, b: 0 }, min));
        panel.liftedFrom = from;
    }
}
/** The topmost opaque surface / shape below `ti` that carries the text (centre inside, ≥ 60 % overlap). */
function panelUnder(elements, ti) {
    const t = elements[ti];
    const cx = t.bbox.x + t.bbox.w / 2;
    const cy = t.bbox.y + t.bbox.h / 2;
    const tArea = Math.max(1, t.bbox.w * t.bbox.h);
    for (let i = ti - 1; i >= 0; i -= 1) {
        const p = elements[i];
        if (p.kind !== "surface" && p.kind !== "shape" && p.kind !== "bar" && p.kind !== "ellipse")
            continue;
        if (p.strokeOnly || p.gradient || (p.fillAlpha != null && p.fillAlpha < 0.6))
            continue;
        const b = p.bbox;
        if (cx < b.x || cx > b.x + b.w || cy < b.y || cy > b.y + b.h)
            continue;
        const ix = Math.max(0, Math.min(t.bbox.x + t.bbox.w, b.x + b.w) - Math.max(t.bbox.x, b.x));
        const iy = Math.max(0, Math.min(t.bbox.y + t.bbox.h, b.y + b.h) - Math.max(t.bbox.y, b.y));
        if ((ix * iy) / tArea < 0.6)
            continue;
        return p;
    }
    return undefined;
}
