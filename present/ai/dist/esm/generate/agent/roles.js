import { z } from "zod";
import { generateSpecJson } from "../aliases.js";
import { resolveGuidanceLanguage } from "../prompts.js";
import { contentOrganizerSystemPrompt, contentOrganizerUserPrompt, organizeDeckSystemPrompt, organizeDeckUserPrompt, researchSystemPrompt, researchUserPrompt, } from "./prompts.js";
import { isCanvasSystemId } from "../../deckgen/ids.js";
import { normalizeSystemId } from "../../deckgen/visual-system.js";
import { CARRIERS, COMPOSITIONS, DECK_MODES, PAGE_RHYTHMS, PHOTO_RHYTHMS, RELATIONSHIPS, coerceDeckBrief, coercePageBrief, } from "../../deckgen/brief.js";
export const ManuscriptSchema = z.object({
    title: z.string(),
    language: z.string(),
    audience: z.string().optional(),
    thesis: z.string().describe("One-sentence through-line of the deck."),
    sections: z
        .array(z.object({
        title: z.string(),
        summary: z.string(),
        facts: z.array(z.string()).max(12),
    }))
        .min(1)
        .max(40),
});
export const SlideBriefSchema = z.object({
    purpose: z.string(),
    topic: z.string(),
    keyPoints: z.array(z.string()).min(1).max(8),
    imagery: z.string().optional(),
    notes: z.string().optional(),
    // Design Brief (per page) — see deckgen/brief.ts
    coreMessage: z.string().optional(),
    audienceMove: z.string().optional(),
    relationships: z.enum(RELATIONSHIPS).optional(),
    rhythm: z.enum(PAGE_RHYTHMS).optional(),
    carrier: z.enum(CARRIERS).optional(),
    composition: z.enum(COMPOSITIONS).optional(),
});
export const DeckDesignBriefSchema = z.object({
    mode: z.enum(DECK_MODES).optional(),
    systemId: z
        .preprocess((v) => (v == null ? v : normalizeSystemId(v) ?? undefined), z.string().refine(isCanvasSystemId, { message: "unknown systemId" }).optional()),
    paletteIntent: z.string().optional(),
    motif: z.string().optional(),
    // `coerceDeckBriefs` has already normalised these through coerceDeckBrief; without them here zod
    // stripped the organizer's decisions before they reached the outline.
    folio: z.boolean().optional(),
    photoRhythm: z.enum(PHOTO_RHYTHMS).optional(),
});
export const DeckBriefsSchema = z.object({
    deck: DeckDesignBriefSchema.optional(),
    slides: z.array(SlideBriefSchema).min(1).max(40),
});
export async function researchManuscript(model, guidance, outline, signal, host, onUsage) {
    const lang = resolveGuidanceLanguage(guidance);
    return generateSpecJson(model, ManuscriptSchema, researchSystemPrompt(host), researchUserPrompt(guidance, outline), signal, (v) => coerceManuscript(v, lang), onUsage);
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
export function coerceManuscript(v, fallbackLang) {
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
export function manuscriptFromOutline(outline, guidance) {
    return {
        title: outline.title,
        language: resolveGuidanceLanguage(guidance),
        ...(guidance.audience ? { audience: guidance.audience } : {}),
        thesis: outline.subtitle || outline.title,
        sections: outline.slides.map((s) => ({
            title: s.title,
            summary: s.notes ?? s.title,
            facts: s.bullets?.length ? s.bullets : [s.title],
        })),
    };
}
export async function organizeDeckContent(model, args) {
    const n = args.outline.slides.length;
    const raw = await generateSpecJson(model, DeckBriefsSchema, organizeDeckSystemPrompt(args.host), organizeDeckUserPrompt(args), args.signal, coerceDeckBriefs, args.onUsage);
    const slides = args.outline.slides
        .map((item, i) => {
        const brief = raw.slides[i];
        if (brief && brief.keyPoints.length)
            return brief;
        return briefFromOutlineItem(item, args.outline.title);
    })
        .slice(0, n);
    return { slides, deck: coerceDeckBrief(raw.deck) };
}
/** Tolerate loose enums (e.g. "Order", "dark tech") and per-page aliases before zod parses. */
export function coerceDeckBriefs(v) {
    if (!v || typeof v !== "object")
        return v;
    const o = { ...v };
    const deckRaw = o.deck ?? o.designBrief ?? o.brief;
    const deck = coerceDeckBrief(deckRaw && typeof deckRaw === "object"
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
            const page = coercePageBrief(row);
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
export async function organizeSlideContent(model, args) {
    return generateSpecJson(model, SlideBriefSchema, contentOrganizerSystemPrompt(), contentOrganizerUserPrompt(args), args.signal, undefined, args.onUsage);
}
export function briefFromOutlineItem(item, topic) {
    const keyPoints = item.bullets?.length ? item.bullets : [item.title];
    return {
        purpose: item.layoutHint ?? "content",
        topic,
        keyPoints,
        ...(item.imageIdea ? { imagery: item.imageIdea } : {}),
        ...(item.notes ? { notes: item.notes } : {}),
        ...coercePageBrief(item),
    };
}
