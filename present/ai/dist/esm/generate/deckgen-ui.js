/**
 * Thin UI-model for deckgen chrome: outline pills, error copy, result badges.
 * Look (system + palette) is authored by the model, not a wizard picker.
 *
 * DOM lives in playground (`deckgen-chrome.ts`). This file is the shared
 * whitelist / human-error contract the adapter and UI both use.
 * The live wizard is Brief → Outline → Build; a reviewed outline is the page list.
 */
import { COLOR_THEME_IDS, COLOR_THEME_PAIRING, LAYOUT_IDS, LAYOUT_VARIANTS, SLOT_CAPS, isColorThemeId, isLayoutId, isVariantForLayout, themesForSystem, } from "../deckgen/ids.js";
const HUMAN = {
    pairing: "That color theme cannot be used with this type system.",
    "invented-layout": "That page layout is not in the allowed list.",
    "invented-variant": "That layout variant is not available for this page type.",
    "invented-page-type": "That page type is not in the allowed list.",
    "over-slots": "This page has more items than the layout allows.",
    unknown: "Couldn't finish this deck. Try generating again.",
};
/** User-facing deckgen failure. `message` is always a single human line (no stack). */
export class DeckgenUserError extends Error {
    kind;
    userMessage;
    constructor(kind, detail) {
        const userMessage = HUMAN[kind];
        super(userMessage);
        this.name = "DeckgenUserError";
        this.kind = kind;
        this.userMessage = userMessage;
        if (detail)
            this.cause = detail;
    }
}
export function deckgenErrorKindFromMessage(raw) {
    const msg = raw.split("\n")[0] ?? raw;
    if (/cannot pair|Unknown ColorTheme|Unknown VisualSystem/i.test(msg))
        return "pairing";
    if (/Unknown beat intent|invented page|page type/i.test(msg))
        return "invented-page-type";
    if (/Unknown Layout|invented layout|No skeleton/i.test(msg))
        return "invented-layout";
    if (/Variant .+ is not valid|invented variant/i.test(msg))
        return "invented-variant";
    if (/exceeds|over.?slot|more items than/i.test(msg))
        return "over-slots";
    return "unknown";
}
/** Map any thrown value to a single human line. Never returns a stack. */
export function formatDeckgenUserError(e) {
    if (e instanceof DeckgenUserError)
        return e.userMessage;
    const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "";
    const first = firstLine(raw);
    if (!first)
        return HUMAN.unknown;
    return HUMAN[deckgenErrorKindFromMessage(first)];
}
export function firstLine(text) {
    return (text.split(/\r?\n/)[0] ?? "").trim();
}
/** True if the string looks like a stack / Error dump (must never reach the toast). */
export function looksLikeStackDump(text) {
    if (/\n\s+at\s+\S/.test(text))
        return true;
    if (/^\s*Error:\s/i.test(text) && text.includes("\n"))
        return true;
    if (/\b(?:TypeError|ReferenceError|SyntaxError|DeckgenUserError):/.test(text) && /\n/.test(text)) {
        return true;
    }
    return false;
}
export function sanitizeDeckgenErrorCopy(text) {
    if (!text.trim())
        return HUMAN.unknown;
    if (looksLikeStackDump(text))
        return formatDeckgenUserError(new Error(firstLine(text)));
    const line = firstLine(text);
    if (/stack|at\s+\S+\s+\(/i.test(line))
        return HUMAN.unknown;
    return line;
}
/** All six themes; `allowed` is the pairing filter. Illegal ones stay visible + disabled. */
export function colorThemeOptions(systemId) {
    const allowed = new Set(themesForSystem(systemId));
    return COLOR_THEME_IDS.map((id) => ({
        id,
        systemId: COLOR_THEME_PAIRING.editorial.includes(id)
            ? "editorial"
            : "swiss",
        allowed: allowed.has(id),
    }));
}
export function isThemeAllowedForSystem(systemId, themeId) {
    return isColorThemeId(themeId) && themesForSystem(systemId).includes(themeId);
}
export function layoutVariantOptions() {
    const out = [];
    for (const layout of LAYOUT_IDS) {
        for (const variant of LAYOUT_VARIANTS[layout]) {
            out.push({ layout, variant, value: `${layout}/${variant}` });
        }
    }
    return out;
}
export function isWhitelistedLayoutVariant(layout, variant) {
    return isLayoutId(layout) && isVariantForLayout(layout, variant);
}
export function defaultVariantFor(layout) {
    return LAYOUT_VARIANTS[layout][0];
}
/** Legacy outline hints → nearest whitelist layout. Unmapped hints stay invented. */
const HINT_TO_LAYOUT = {
    cover: "cover",
    hero: "cover",
    section: "section",
    agenda: "section",
    quote: "quote",
    bullets: "bullets",
    content: "bullets",
    process: "steps",
    timeline: "timeline",
    cards: "cards",
    "two-column": "compare",
    comparison: "compare",
    "image-text": "split",
    banner: "banner",
    table: "bars",
    chart: "bars",
    stat: "kpi",
    metrics: "kpi",
    closing: "close",
};
function autoVariantFor(layout, item) {
    const n = (item.bullets ?? []).map((b) => b.trim()).filter(Boolean).length;
    const title = (item.title ?? "").trim();
    switch (layout) {
        case "cover":
            return n > 0 ? "title-meta" : "poster";
        case "statement":
            return /\?\s*$/.test(title) ? "question" : n > 0 ? "line-plus-note" : "single-line";
        case "quote":
            return "serif-mark";
        case "cards":
            if (n >= 6)
                return "six";
            if (n >= 4)
                return "four";
            return "three";
        case "steps":
            return n <= 3 ? "row-3" : "row-5";
        case "timeline":
            return n >= 5 ? "vertical" : "horizontal";
        case "gallery":
            return n <= 3 ? "trio" : "matrix";
        case "kpi":
            if (n >= 4)
                return "ledger";
            if (n >= 2)
                return "number-row";
            return "big-number";
        case "split":
            return item.imageIdea ? "figure-text" : "text-text";
        case "figure":
            return item.imageIdea ? "hero" : "image-caption";
        case "close":
            if (n >= 3)
                return "manifesto";
            if (n >= 2)
                return "three-takeaways";
            return "next-step";
        case "bars":
            return "tower";
        default:
            return defaultVariantFor(layout);
    }
}
export function readOutlinePageLock(item) {
    const variant = (item.deckgenVariant ?? "").trim();
    const explicit = (item.deckgenLayout ?? "").trim();
    if (explicit)
        return { layout: explicit, variant };
    const hint = (item.layoutHint ?? "").trim();
    const mapped = HINT_TO_LAYOUT[hint];
    if (mapped)
        return { layout: mapped, variant };
    return { layout: hint, variant };
}
/**
 * Display default for the outline pill. Does not invent: unknown hints become
 * `bullets/title-5` for the UI only. Build still validates the stored lock.
 */
export function defaultOutlinePageLock(item, index, total) {
    const stored = readOutlinePageLock(item);
    if (isLayoutId(stored.layout)) {
        const variant = stored.variant || autoVariantFor(stored.layout, item);
        if (isWhitelistedLayoutVariant(stored.layout, variant)) {
            return { layout: stored.layout, variant };
        }
        return { layout: stored.layout, variant: autoVariantFor(stored.layout, item) };
    }
    const mapped = HINT_TO_LAYOUT[stored.layout];
    if (mapped)
        return { layout: mapped, variant: autoVariantFor(mapped, item) };
    if (index === 0)
        return { layout: "cover", variant: autoVariantFor("cover", item) };
    if (total > 1 && index === total - 1)
        return { layout: "close", variant: autoVariantFor("close", item) };
    return { layout: "bullets", variant: defaultVariantFor("bullets") };
}
export function applyOutlinePageLock(item, lock) {
    item.deckgenLayout = lock.layout;
    item.deckgenVariant = lock.variant;
}
export function planFromOutlineItem(item, index, total = index + 1) {
    const explicit = (item.deckgenLayout ?? "").trim();
    // Explicit lock must stay on the whitelist (wizard pill / API). Missing lock
    // maps layoutHint → nearest catalog page so a reviewed outline is never discarded.
    const lock = explicit ? readOutlinePageLock(item) : defaultOutlinePageLock(item, index, total);
    if (!isLayoutId(lock.layout)) {
        throw new DeckgenUserError("invented-page-type", `Unknown page type "${lock.layout || item.layoutHint || ""}".`);
    }
    const variant = lock.variant || autoVariantFor(lock.layout, item);
    if (!isVariantForLayout(lock.layout, variant)) {
        throw new DeckgenUserError("invented-variant", `Variant "${variant}" is not valid for ${lock.layout}.`);
    }
    const title = (item.title ?? "").trim();
    const items = (item.bullets ?? []).map((b) => b.trim()).filter(Boolean);
    return slidePlanFor(lock.layout, variant, title, items, item.imageIdea, index);
}
function slidePlanFor(layout, variant, title, items, imageIdea, index) {
    const v = variant;
    switch (layout) {
        case "cover":
            return { layout, variant: v, title, ...(items[0] ? { subtitle: items[0] } : {}) };
        case "section":
            return { layout, variant: v, title, number: String(index + 1).padStart(2, "0") };
        case "statement":
            return { layout, variant: v, claim: title || items[0] || "", ...(items[0] && title ? { note: items[0] } : {}) };
        case "quote":
            return { layout, variant: v, claim: title || items[0] || "", ...(items[0] && title ? { note: items[0] } : {}) };
        case "bullets":
        case "steps":
        case "timeline":
        case "cards":
        case "bars":
        case "loop":
            return { layout, variant: v, title, items };
        case "gallery":
            return { layout, variant: v, title, items, ...(imageIdea ? { imageSrc: imageIdea } : {}) };
        case "split": {
            const half = Math.max(1, Math.ceil(items.length / 2));
            const leftItems = items.slice(0, Math.min(3, half) || 1);
            const rightSlice = items.slice(half, half + 3);
            const figure = variant === "text-figure" || variant === "figure-text";
            return {
                layout,
                variant: v,
                title,
                leftItems: variant === "figure-text" ? undefined : leftItems,
                ...(variant === "text-figure"
                    ? {}
                    : { rightItems: rightSlice.length ? rightSlice : leftItems }),
                ...(figure && imageIdea ? { imageSrc: imageIdea } : {}),
            };
        }
        case "figure":
            return {
                layout,
                variant: v,
                title,
                note: items[0] || title,
                ...(imageIdea ? { imageSrc: imageIdea } : {}),
            };
        case "kpi":
            if (variant === "number-row" || variant === "ledger") {
                const cap = variant === "ledger" ? SLOT_CAPS.barItems + 2 : SLOT_CAPS.kpiRow;
                const kpis = items.slice(0, cap).map((line) => {
                    const [value, ...rest] = line.split("|");
                    return { value: (value ?? "").trim() || "0", label: rest.join("|").trim() || title };
                });
                return { layout, variant: v, title, kpis };
            }
            return { layout, variant: v, value: items[0] ?? "01", label: title };
        case "compare": {
            const half = Math.max(1, Math.ceil(items.length / 2));
            return {
                layout,
                variant: v,
                title,
                leftItems: items.slice(0, half).length ? items.slice(0, half) : [title],
                rightItems: items.slice(half).length ? items.slice(half) : items.slice(0, 1).length ? items.slice(0, 1) : [title],
            };
        }
        case "banner":
            return { layout, variant: v, title, next: items[0] ?? title };
        case "close":
            return {
                layout,
                variant: v,
                title,
                ...(variant === "next-step" ? { next: items[0] ?? title } : { items: items.slice(0, SLOT_CAPS.closeTakeaways) }),
            };
        default:
            throw new DeckgenUserError("invented-layout", `Unknown Layout "${layout}".`);
    }
}
export function assertPageSlotCaps(plan, slideNo) {
    const n = slideNo + 1;
    if (plan.layout === "statement" && plan.claim && [...plan.claim].length > SLOT_CAPS.statementClaimChars) {
        throw new DeckgenUserError("over-slots", `Slide ${n} statement exceeds ${SLOT_CAPS.statementClaimChars} characters.`);
    }
    if (plan.layout === "quote" && plan.claim && [...plan.claim].length > SLOT_CAPS.quoteChars) {
        throw new DeckgenUserError("over-slots", `Slide ${n} quote exceeds ${SLOT_CAPS.quoteChars} characters.`);
    }
    if (plan.layout === "bullets" && plan.items && plan.items.length > SLOT_CAPS.bulletItems) {
        throw new DeckgenUserError("over-slots", `Slide ${n} bullets exceed ${SLOT_CAPS.bulletItems} items.`);
    }
    const itemCap = plan.layout === "cards"
        ? plan.variant === "six"
            ? SLOT_CAPS.cardItems
            : plan.variant === "four"
                ? 4
                : 3
        : plan.layout === "steps"
            ? plan.variant === "row-3"
                ? 3
                : SLOT_CAPS.stepItems
            : plan.layout === "timeline"
                ? SLOT_CAPS.timelineItems
                : plan.layout === "loop"
                    ? SLOT_CAPS.loopItems
                    : plan.layout === "bars"
                        ? SLOT_CAPS.barItems
                        : plan.layout === "gallery"
                            ? plan.variant === "trio"
                                ? 3
                                : SLOT_CAPS.galleryItems
                            : undefined;
    if (itemCap != null && plan.items && plan.items.length > itemCap) {
        throw new DeckgenUserError("over-slots", `Slide ${n} ${plan.layout} exceeds ${itemCap} items.`);
    }
    if (plan.layout === "kpi" && plan.variant === "number-row" && plan.kpis && plan.kpis.length > SLOT_CAPS.kpiRow) {
        throw new DeckgenUserError("over-slots", `Slide ${n} kpi row exceeds ${SLOT_CAPS.kpiRow}.`);
    }
    if (plan.layout === "kpi" && plan.variant === "ledger" && plan.kpis && plan.kpis.length > SLOT_CAPS.barItems + 2) {
        throw new DeckgenUserError("over-slots", `Slide ${n} kpi ledger exceeds ${SLOT_CAPS.barItems + 2}.`);
    }
}
/** True when the wizard (or a test) locked at least one page to a deckgen layout. */
export function outlineHasDeckgenLocks(outline) {
    return outline.slides.some((s) => (s.deckgenLayout ?? "").trim().length > 0);
}
export function pagesFromOutline(outline) {
    const total = outline.slides.length;
    return outline.slides.map((item, i) => {
        const plan = planFromOutlineItem(item, i, total);
        assertPageSlotCaps(plan, i);
        return plan;
    });
}
export function resultBadgeParts(meta) {
    const system = (meta.system ?? "").trim();
    const layout = (meta.layout ?? "").trim();
    const theme = (meta.theme ?? "").trim();
    const parts = [];
    if (system)
        parts.push(system);
    if (layout)
        parts.push(layout);
    if (theme)
        parts.push(theme);
    if (parts.length === 0 && system && theme)
        parts.push(system, theme);
    return parts;
}
/** `system · layout · theme` when layout is known; otherwise `system · theme`. */
export function formatResultBadge(meta) {
    return resultBadgeParts(meta).join(" · ");
}
export function badgeFromSlideTags(tags) {
    return {
        system: tags?.system,
        layout: tags?.layout,
        theme: tags?.theme,
        variant: tags?.variant,
    };
}
/** Relative luminance 0..1 (sRGB hex). */
export function hexLuminance(hex) {
    const h = hex.replace("#", "");
    if (h.length < 6)
        return 0;
    const to = (c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const r = to(parseInt(h.slice(0, 2), 16));
    const g = to(parseInt(h.slice(2, 4), 16));
    const b = to(parseInt(h.slice(4, 6), 16));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a, b) {
    const l1 = hexLuminance(a);
    const l2 = hexLuminance(b);
    const light = Math.max(l1, l2);
    const dark = Math.min(l1, l2);
    return (light + 0.05) / (dark + 0.05);
}
/**
 * Badge text must keep ≥ 60% of body-on-bg contrast.
 * Prefer muted; fall back to ink when muted is too weak.
 */
export function pickBadgeForeground(opts) {
    const bodyRatio = contrastRatio(opts.ink, opts.bg);
    const floor = bodyRatio * 0.6;
    const mutedRatio = contrastRatio(opts.muted, opts.bg);
    if (mutedRatio + 1e-6 >= floor)
        return { color: opts.muted, ratio: mutedRatio, bodyRatio };
    const inkRatio = contrastRatio(opts.ink, opts.bg);
    return { color: opts.ink, ratio: inkRatio, bodyRatio };
}
export const DECKGEN_CAPTION_PX = { editorial: 12, swiss: 11 };
