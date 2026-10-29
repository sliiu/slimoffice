"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeckBriefsSchema = exports.DeckDesignBriefSchema = exports.SlideBriefSchema = exports.ManuscriptSchema = void 0;
exports.researchManuscript = researchManuscript;
exports.coerceManuscript = coerceManuscript;
exports.manuscriptFromOutline = manuscriptFromOutline;
exports.organizeDeckContent = organizeDeckContent;
exports.coerceDeckBriefs = coerceDeckBriefs;
exports.organizeSlideContent = organizeSlideContent;
exports.briefFromOutlineItem = briefFromOutlineItem;
const zod_1 = require("zod");
const aliases_1 = require("../aliases");
const prompts_1 = require("../prompts");
const prompts_2 = require("./prompts");
const ids_js_1 = require("../../deckgen/ids.js");
const visual_system_js_1 = require("../../deckgen/visual-system.js");
const brief_js_1 = require("../../deckgen/brief.js");
exports.ManuscriptSchema = zod_1.z.object({
    title: zod_1.z.string(),
    language: zod_1.z.string(),
    audience: zod_1.z.string().optional(),
    thesis: zod_1.z.string().describe("One-sentence through-line of the deck."),
    sections: zod_1.z
        .array(zod_1.z.object({
        title: zod_1.z.string(),
        summary: zod_1.z.string(),
        facts: zod_1.z.array(zod_1.z.string()).max(12),
    }))
        .min(1)
        .max(40),
});
exports.SlideBriefSchema = zod_1.z.object({
    purpose: zod_1.z.string(),
    topic: zod_1.z.string(),
    keyPoints: zod_1.z.array(zod_1.z.string()).min(1).max(8),
    imagery: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
    // Design Brief (per page) — see deckgen/brief.ts
    coreMessage: zod_1.z.string().optional(),
    audienceMove: zod_1.z.string().optional(),
    relationships: zod_1.z.enum(brief_js_1.RELATIONSHIPS).optional(),
    rhythm: zod_1.z.enum(brief_js_1.PAGE_RHYTHMS).optional(),
    carrier: zod_1.z.enum(brief_js_1.CARRIERS).optional(),
    composition: zod_1.z.enum(brief_js_1.COMPOSITIONS).optional(),
});
exports.DeckDesignBriefSchema = zod_1.z.object({
    mode: zod_1.z.enum(brief_js_1.DECK_MODES).optional(),
    systemId: zod_1.z
        .preprocess((v) => (v == null ? v : (0, visual_system_js_1.normalizeSystemId)(v) ?? undefined), zod_1.z.string().refine(ids_js_1.isCanvasSystemId, { message: "unknown systemId" }).optional()),
    paletteIntent: zod_1.z.string().optional(),
    motif: zod_1.z.string().optional(),
    // `coerceDeckBriefs` has already normalised these through coerceDeckBrief; without them here zod
    // stripped the organizer's decisions before they reached the outline.
    folio: zod_1.z.boolean().optional(),
    photoRhythm: zod_1.z.enum(brief_js_1.PHOTO_RHYTHMS).optional(),
});
exports.DeckBriefsSchema = zod_1.z.object({
    deck: exports.DeckDesignBriefSchema.optional(),
    slides: zod_1.z.array(exports.SlideBriefSchema).min(1).max(40),
});
async function researchManuscript(model, guidance, outline, signal, host, onUsage) {
    const lang = (0, prompts_1.resolveGuidanceLanguage)(guidance);
    return (0, aliases_1.generateSpecJson)(model, exports.ManuscriptSchema, (0, prompts_2.researchSystemPrompt)(host), (0, prompts_2.researchUserPrompt)(guidance, outline), signal, (v) => coerceManuscript(v, lang), onUsage);
}
function asText(v) {
    if (typeof v === "string")
        return v.trim();
    if (Array.isArray(v))
        return v.map(asText).filter(Boolean).join(" ");
    return "";
}
function sectionFromUnknown(s) {
    const o = s && typeof s === "object" ? s : {};
    const title = asText(o.title) || "Section";
    const notes = asText(o.speaker_notes) || asText(o.speakerNotes) || asText(o.notes) || asText(o.summary);
    const rawFacts = Array.isArray(o.facts) ? o.facts : Array.isArray(o.bullets) ? o.bullets : [];
    const facts = rawFacts.map(asText).filter(Boolean).slice(0, 12);
    return { title, summary: notes || title, facts: facts.length ? facts : [title] };
}
function coerceManuscript(v, fallbackLang) {
    const n = v && typeof v === "object" ? v : {};
    const title = asText(n.title) || "Untitled";
    const rows = Array.isArray(n.sections) ? n.sections : Array.isArray(n.slides) ? n.slides : [];
    const sections = rows.map(sectionFromUnknown);
    return {
        title,
        language: asText(n.language) || fallbackLang,
        ...(typeof n.audience === "string" && n.audience.trim() ? { audience: n.audience.trim() } : {}),
        thesis: asText(n.thesis) || asText(n.subtitle) || asText(n.speaker_notes) || title,
        sections: sections.length ? sections : [{ title, summary: title, facts: [title] }],
    };
}
function manuscriptFromOutline(outline, guidance) {
    return {
        title: outline.title,
        language: (0, prompts_1.resolveGuidanceLanguage)(guidance),
        ...(guidance.audience ? { audience: guidance.audience } : {}),
        thesis: outline.subtitle || outline.title,
        sections: outline.slides.map((s) => ({
            title: s.title,
            summary: s.notes ?? s.title,
            facts: s.bullets?.length ? s.bullets : [s.title],
        })),
    };
}
async function organizeDeckContent(model, args) {
    const n = args.outline.slides.length;
    const raw = await (0, aliases_1.generateSpecJson)(model, exports.DeckBriefsSchema, (0, prompts_2.organizeDeckSystemPrompt)(args.host), (0, prompts_2.organizeDeckUserPrompt)(args), args.signal, coerceDeckBriefs, args.onUsage);
    const slides = args.outline.slides
        .map((item, i) => {
        const brief = raw.slides[i];
        if (brief && brief.keyPoints.length)
            return brief;
        return briefFromOutlineItem(item, args.outline.title);
    })
        .slice(0, n);
    return { slides, deck: (0, brief_js_1.coerceDeckBrief)(raw.deck) };
}
/** Tolerate loose enums (e.g. "Order", "dark tech") and per-page aliases before zod parses. */
function coerceDeckBriefs(v) {
    if (!v || typeof v !== "object")
        return v;
    const o = { ...v };
    const deckRaw = o.deck ?? o.designBrief ?? o.brief;
    const deck = (0, brief_js_1.coerceDeckBrief)(deckRaw && typeof deckRaw === "object"
        ? Object.fromEntries(Object.entries(deckRaw).map(([k, val]) => [
            k,
            typeof val === "string" && k === "mode" ? val.toLowerCase().replace(/[\s_]+/g, "-") : val,
        ]))
        : undefined);
    o.deck = deck;
    if (Array.isArray(o.slides)) {
        o.slides = o.slides.map((s) => {
            if (!s || typeof s !== "object")
                return s;
            const row = { ...s };
            const page = (0, brief_js_1.coercePageBrief)(row);
            delete row.relationship;
            delete row.carrierHint;
            delete row.layoutComposition;
            for (const key of ["coreMessage", "audienceMove", "relationships", "rhythm", "carrier", "composition"])
                delete row[key];
            // imageIdea (brief) and imagery (legacy) mean the same thing here.
            if (typeof row.imageIdea === "string" && !row.imagery)
                row.imagery = row.imageIdea;
            delete row.imageIdea;
            if (row.imagery != null && typeof row.imagery !== "string")
                delete row.imagery;
            return { ...row, ...page };
        });
    }
    return o;
}
async function organizeSlideContent(model, args) {
    return (0, aliases_1.generateSpecJson)(model, exports.SlideBriefSchema, (0, prompts_2.contentOrganizerSystemPrompt)(), (0, prompts_2.contentOrganizerUserPrompt)(args), args.signal, undefined, args.onUsage);
}
function briefFromOutlineItem(item, topic) {
    const keyPoints = item.bullets?.length ? item.bullets : [item.title];
    return {
        purpose: item.layoutHint ?? "content",
        topic,
        keyPoints,
        ...(item.imageIdea ? { imagery: item.imageIdea } : {}),
        ...(item.notes ? { notes: item.notes } : {}),
        ...(0, brief_js_1.coercePageBrief)(item),
    };
}
