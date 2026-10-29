"use strict";
/**
 * L2 Layout + L3 Variant catalog.
 * Each entry is a named skeleton with slots. Inventing a layout/variant fails.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.listLayoutCatalog = listLayoutCatalog;
exports.resolveLayout = resolveLayout;
exports.imageSlotsAllowed = imageSlotsAllowed;
const ids_js_1 = require("./ids.js");
function text(id, opts = {}) {
    return { id, kind: "text", required: opts.required ?? true, ...opts };
}
const CATALOG = [
    {
        id: "cover",
        variant: "hero-title",
        slots: [text("title", { maxLines: 2 }), text("subtitle", { required: false, maxLines: 2 })],
    },
    {
        id: "cover",
        variant: "title-meta",
        slots: [
            text("title", { maxLines: 2 }),
            text("subtitle", { required: false, maxLines: 2 }),
            text("meta", { required: false, maxLines: 1 }),
        ],
    },
    {
        id: "cover",
        variant: "poster",
        slots: [text("title", { maxLines: 2 }), text("subtitle", { required: false, maxLines: 2 })],
    },
    {
        id: "section",
        variant: "num-title",
        slots: [text("number", { maxChars: 8 }), text("title", { maxLines: 2 })],
    },
    {
        id: "statement",
        variant: "single-line",
        slots: [text("claim", { maxChars: ids_js_1.SLOT_CAPS.statementClaimChars, maxLines: 1 })],
    },
    {
        id: "statement",
        variant: "line-plus-note",
        slots: [
            text("claim", { maxChars: ids_js_1.SLOT_CAPS.statementClaimChars, maxLines: 1 }),
            text("note", { required: false, maxLines: 2 }),
        ],
    },
    {
        id: "statement",
        variant: "question",
        slots: [text("claim", { maxChars: ids_js_1.SLOT_CAPS.statementClaimChars, maxLines: 2 })],
    },
    {
        id: "quote",
        variant: "serif-mark",
        slots: [
            text("claim", { maxChars: ids_js_1.SLOT_CAPS.quoteChars, maxLines: 2 }),
            text("note", { required: false, maxLines: 1 }),
        ],
    },
    {
        id: "quote",
        variant: "band",
        slots: [
            text("claim", { maxChars: ids_js_1.SLOT_CAPS.quoteChars, maxLines: 2 }),
            text("note", { required: false, maxLines: 1 }),
        ],
    },
    {
        id: "bullets",
        variant: "title-5",
        slots: [
            text("title", { maxLines: 1 }),
            text("items", { maxItems: ids_js_1.SLOT_CAPS.bulletItems, maxChars: ids_js_1.SLOT_CAPS.bulletItemChars }),
        ],
    },
    {
        id: "steps",
        variant: "row-5",
        slots: [text("title", { required: false, maxLines: 1 }), text("items", { maxItems: ids_js_1.SLOT_CAPS.stepItems })],
    },
    {
        id: "steps",
        variant: "row-3",
        slots: [text("title", { required: false, maxLines: 1 }), text("items", { maxItems: 3 })],
    },
    {
        id: "timeline",
        variant: "horizontal",
        slots: [text("title", { required: false, maxLines: 1 }), text("items", { maxItems: ids_js_1.SLOT_CAPS.timelineItems })],
    },
    {
        id: "timeline",
        variant: "vertical",
        slots: [text("title", { required: false, maxLines: 1 }), text("items", { maxItems: ids_js_1.SLOT_CAPS.timelineItems })],
    },
    {
        id: "cards",
        variant: "three",
        slots: [text("title", { required: false, maxLines: 1 }), text("items", { maxItems: 3 })],
    },
    {
        id: "cards",
        variant: "four",
        slots: [text("title", { required: false, maxLines: 1 }), text("items", { maxItems: 4 })],
    },
    {
        id: "cards",
        variant: "six",
        slots: [text("title", { required: false, maxLines: 1 }), text("items", { maxItems: ids_js_1.SLOT_CAPS.cardItems })],
    },
    {
        id: "bars",
        variant: "tower",
        slots: [text("title", { required: false, maxLines: 1 }), text("items", { maxItems: ids_js_1.SLOT_CAPS.barItems })],
    },
    {
        id: "bars",
        variant: "horizontal",
        slots: [text("title", { required: false, maxLines: 1 }), text("items", { maxItems: ids_js_1.SLOT_CAPS.barItems })],
    },
    {
        id: "loop",
        variant: "cycle-4",
        slots: [text("title", { required: false, maxLines: 1 }), text("items", { maxItems: ids_js_1.SLOT_CAPS.loopItems })],
    },
    {
        id: "split",
        variant: "text-text",
        slots: [
            text("title", { required: false, maxLines: 1 }),
            text("leftTitle", { required: false, maxLines: 1 }),
            text("leftItems", { maxItems: 4 }),
            text("rightTitle", { required: false, maxLines: 1 }),
            text("rightItems", { maxItems: 4 }),
        ],
    },
    {
        id: "split",
        variant: "text-figure",
        slots: [
            text("title", { required: false, maxLines: 1 }),
            text("leftTitle", { required: false, maxLines: 1 }),
            text("leftItems", { maxItems: 4 }),
            { id: "image", kind: "image", required: true },
        ],
    },
    {
        id: "split",
        variant: "figure-text",
        slots: [
            text("title", { required: false, maxLines: 1 }),
            { id: "image", kind: "image", required: true },
            text("rightTitle", { required: false, maxLines: 1 }),
            text("rightItems", { maxItems: 4 }),
        ],
    },
    {
        id: "figure",
        variant: "image-caption",
        slots: [
            { id: "image", kind: "image", required: true },
            text("note", { required: false, maxLines: ids_js_1.SLOT_CAPS.figureNoteLines }),
        ],
    },
    {
        id: "figure",
        variant: "hero",
        slots: [
            { id: "image", kind: "image", required: true },
            text("title", { required: false, maxLines: 1 }),
            text("note", { required: false, maxLines: ids_js_1.SLOT_CAPS.figureNoteLines }),
        ],
    },
    {
        id: "gallery",
        variant: "trio",
        slots: [
            { id: "image", kind: "image", required: false },
            text("items", { maxItems: 3 }),
        ],
    },
    {
        id: "gallery",
        variant: "matrix",
        slots: [
            { id: "image", kind: "image", required: false },
            text("items", { maxItems: ids_js_1.SLOT_CAPS.galleryItems }),
        ],
    },
    {
        id: "kpi",
        variant: "big-number",
        slots: [text("value", { maxLines: 1 }), text("label", { required: false, maxLines: 1 })],
    },
    {
        id: "kpi",
        variant: "number-row",
        slots: [
            text("title", { required: false, maxLines: 1 }),
            text("kpis", { maxItems: ids_js_1.SLOT_CAPS.kpiRow }),
        ],
    },
    {
        id: "kpi",
        variant: "ledger",
        slots: [
            text("title", { required: false, maxLines: 1 }),
            text("kpis", { maxItems: ids_js_1.SLOT_CAPS.barItems + 2 }),
        ],
    },
    {
        id: "compare",
        variant: "two-col",
        slots: [
            text("title", { required: false, maxLines: 1 }),
            text("leftTitle", { required: false, maxLines: 1 }),
            text("leftItems", { maxItems: 4 }),
            text("rightTitle", { required: false, maxLines: 1 }),
            text("rightItems", { maxItems: 4 }),
        ],
    },
    {
        id: "banner",
        variant: "ink-band",
        slots: [text("title", { required: false, maxLines: 1 }), text("next", { maxLines: 2 })],
    },
    {
        id: "close",
        variant: "three-takeaways",
        slots: [text("title", { required: false, maxLines: 1 }), text("items", { maxItems: ids_js_1.SLOT_CAPS.closeTakeaways })],
    },
    {
        id: "close",
        variant: "next-step",
        slots: [text("title", { required: false, maxLines: 1 }), text("next", { maxLines: 2 })],
    },
    {
        id: "close",
        variant: "manifesto",
        slots: [text("title", { maxLines: 2 }), text("items", { required: false, maxItems: ids_js_1.SLOT_CAPS.closeTakeaways })],
    },
];
function listLayoutCatalog() {
    return CATALOG.map((d) => ({ ...d, slots: d.slots.map((s) => ({ ...s })) }));
}
function resolveLayout(layout, variant) {
    if (!(0, ids_js_1.isLayoutId)(layout)) {
        throw new Error(`Unknown Layout "${layout}". Whitelist: ${ids_js_1.LAYOUT_IDS.join(", ")}.`);
    }
    if (!(0, ids_js_1.isVariantForLayout)(layout, variant)) {
        throw new Error(`Variant "${variant}" is not valid for Layout "${layout}". Allowed: ${ids_js_1.LAYOUT_VARIANTS[layout].join(", ")}.`);
    }
    const found = CATALOG.find((d) => d.id === layout && d.variant === variant);
    if (!found) {
        throw new Error(`No skeleton for ${layout}/${variant}.`);
    }
    return found;
}
function imageSlotsAllowed(layout, variant) {
    return ((layout === "figure" && (variant === "image-caption" || variant === "hero")) ||
        (layout === "split" && (variant === "text-figure" || variant === "figure-text")) ||
        layout === "gallery");
}
