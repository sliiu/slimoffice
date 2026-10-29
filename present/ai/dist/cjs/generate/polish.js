"use strict";
/**
 * Post-outline polish for the product generate path (deckgen).
 *
 * The discarded PPTAgent lifecycle used to own research → organize → compile →
 * images → QA → art director. Compile is now deckgen (canvas author or no-key
 * fill); these passes still run around it so a reviewed outline gets denser copy,
 * real imagery, contrast repair, and a conservative recolor pass.
 *
 * Design / P0 throw-gates stay off: they assume PPTAgent layout names (cards,
 * cover photos, web-exclusive quota) and would fail every whitelist deck.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPolishContext = createPolishContext;
exports.cloneOutline = cloneOutline;
exports.clampOutlineToDeckgenSlots = clampOutlineToDeckgenSlots;
exports.specFromOutlineImagery = specFromOutlineImagery;
exports.enrichOutlineContent = enrichOutlineContent;
exports.polishGeneratedDeck = polishGeneratedDeck;
const types_1 = require("../config/types");
const presets_1 = require("../config/presets");
const client_1 = require("../llm/client");
const ids_js_1 = require("../deckgen/ids.js");
const text_measure_js_1 = require("../deckgen/text-measure.js");
const fetch_enrichment_image_1 = require("./enrich/fetch-enrichment-image");
const images_1 = require("./enrich/images");
const compile_1 = require("./compile/compile");
const validate_1 = require("./qa/validate");
const art_director_1 = require("./qa/art-director");
const prompts_1 = require("./prompts");
const abort_1 = require("./abort");
const call_budget_1 = require("./call-budget");
const deckgen_ui_1 = require("./deckgen-ui");
const roles_1 = require("./agent/roles");
const FEATURE_DECKGEN = new Set(["cover", "section", "figure", "gallery", "quote", "banner", "close"]);
const FEATURE_HINTS = new Set(["cover", "hero", "section", "stat", "closing", "quote"]);
function createPolishContext(opts) {
    const budget = new call_budget_1.ModelCallBudget(opts.maxModelCalls ?? call_budget_1.GENERATE_MODEL_CALL_BUDGET);
    return {
        budget,
        recordUsage: (usage) => {
            opts.onLlmUsage?.(usage);
        },
        emit: (event) => {
            opts.onProgress?.(event);
        },
    };
}
function cloneOutline(outline) {
    return {
        ...outline,
        slides: outline.slides.map((s) => ({
            ...s,
            ...(s.bullets ? { bullets: s.bullets.slice() } : {}),
        })),
    };
}
/** After organize (≤8 bullets) clip to deckgen slot caps so pagesFromOutline does not throw. */
function clampOutlineToDeckgenSlots(outline) {
    const total = outline.slides.length;
    return {
        ...outline,
        slides: outline.slides.map((item, i) => {
            const lock = (0, deckgen_ui_1.defaultOutlinePageLock)(item, i, total);
            const layout = ((item.deckgenLayout ?? "").trim() || lock.layout).toLowerCase();
            const variant = ((item.deckgenVariant ?? "").trim() || lock.variant).toLowerCase();
            let title = item.title;
            if (layout === "statement") {
                title = (0, text_measure_js_1.truncateChars)(title, ids_js_1.SLOT_CAPS.statementClaimChars).text;
            }
            else if (layout === "quote") {
                title = (0, text_measure_js_1.truncateChars)(title, ids_js_1.SLOT_CAPS.quoteChars).text;
            }
            const maxItems = layout === "kpi"
                ? variant === "ledger"
                    ? ids_js_1.SLOT_CAPS.barItems + 2
                    : ids_js_1.SLOT_CAPS.kpiRow + 2
                : layout === "close"
                    ? ids_js_1.SLOT_CAPS.closeTakeaways
                    : layout === "cards"
                        ? variant === "six"
                            ? ids_js_1.SLOT_CAPS.cardItems
                            : variant === "four"
                                ? 4
                                : 3
                        : layout === "steps"
                            ? variant === "row-3"
                                ? 3
                                : ids_js_1.SLOT_CAPS.stepItems
                            : layout === "timeline"
                                ? ids_js_1.SLOT_CAPS.timelineItems
                                : layout === "loop"
                                    ? ids_js_1.SLOT_CAPS.loopItems
                                    : layout === "bars"
                                        ? ids_js_1.SLOT_CAPS.barItems
                                        : layout === "gallery"
                                            ? variant === "trio"
                                                ? 3
                                                : ids_js_1.SLOT_CAPS.galleryItems
                                            : ids_js_1.SLOT_CAPS.bulletItems;
            const bullets = (item.bullets ?? [])
                .map((b) => (0, text_measure_js_1.truncateChars)(b, ids_js_1.SLOT_CAPS.bulletItemChars).text)
                .filter(Boolean)
                .slice(0, maxItems);
            if (!item.bullets && bullets.length === 0)
                return { ...item, title };
            return { ...item, title, bullets };
        }),
    };
}
/** Map outline imageIdea onto the post-compile enrich spec (bg vs hero). */
function specFromOutlineImagery(outline) {
    const spec = (0, compile_1.outlineToFallbackSpec)(outline, { injectMissingCover: false });
    const total = outline.slides.length;
    for (let i = 0; i < spec.slides.length; i++) {
        const item = outline.slides[i];
        const idea = item?.imageIdea?.trim();
        if (!item || !idea)
            continue;
        const layout = ((item.deckgenLayout ?? "").trim() || (0, deckgen_ui_1.defaultOutlinePageLock)(item, i, total).layout).toLowerCase();
        const hint = item.layoutHint ?? "";
        const slide = spec.slides[i];
        const feature = FEATURE_DECKGEN.has(layout) || FEATURE_HINTS.has(hint) || i === 0 || (total > 1 && i === total - 1);
        if (feature) {
            slide.bgImageQuery = idea;
            slide.bgOverlay = 0.55;
        }
        else {
            slide.heroImageQuery = idea;
        }
    }
    return spec;
}
/**
 * Optional LLM content pass. No-ops when text config is unusable so unit tests
 * still compile the reviewed outline synchronously-enough (no network).
 */
async function enrichOutlineContent(outlineInput, guidance, opts, ctx) {
    const outline = cloneOutline(outlineInput);
    const config = opts.config ?? (0, types_1.defaultConfig)();
    if (!(0, presets_1.isConfigUsable)(config))
        return outline;
    const { model } = (0, client_1.createLlm)(config.text);
    let manuscript = (0, roles_1.manuscriptFromOutline)(outline, guidance);
    if (ctx.budget.tryConsume()) {
        try {
            (0, abort_1.throwIfAborted)(opts.signal);
            ctx.emit({ stage: "outline", progress: 0.03, detailKey: "research.drafting" });
            (0, abort_1.throwIfAborted)(opts.signal);
            manuscript = await (0, roles_1.researchManuscript)(model, guidance, outline, opts.signal, opts.hostSkillStore, ctx.recordUsage);
            ctx.emit({ stage: "outline", progress: 0.08, detailKey: "research.ready" });
        }
        catch (e) {
            (0, abort_1.rethrowIfAborted)(opts.signal, e);
            if (opts.debug)
                console.warn("[ai] research failed:", e);
        }
    }
    try {
        (0, abort_1.throwIfAborted)(opts.signal);
        if (!ctx.budget.tryConsume())
            throw new Error("skip");
        const organized = await (0, roles_1.organizeDeckContent)(model, {
            outline,
            manuscript,
            ...(guidance.language ? { language: guidance.language } : {}),
            ...(opts.signal ? { signal: opts.signal } : {}),
            ...(opts.hostSkillStore ? { host: opts.hostSkillStore } : {}),
            onUsage: ctx.recordUsage,
        });
        for (let i = 0; i < outline.slides.length; i++) {
            const brief = organized.slides[i] ?? (0, roles_1.briefFromOutlineItem)(outline.slides[i], outline.title);
            const item = outline.slides[i];
            if (!item)
                continue;
            const imageIdea = brief.imagery?.trim() || item.imageIdea;
            outline.slides[i] = {
                ...item,
                bullets: brief.keyPoints,
                ...(brief.notes ? { notes: brief.notes } : item.notes ? { notes: item.notes } : {}),
                ...(imageIdea ? { imageIdea } : {}),
                ...(brief.coreMessage ? { coreMessage: brief.coreMessage } : {}),
                ...(brief.audienceMove ? { audienceMove: brief.audienceMove } : {}),
                ...(brief.relationships ? { relationships: brief.relationships } : {}),
                ...(brief.rhythm ? { rhythm: brief.rhythm } : {}),
                ...(brief.carrier ? { carrier: brief.carrier } : {}),
                ...(brief.composition ? { composition: brief.composition } : {}),
            };
        }
        if (Object.keys(organized.deck).length) {
            outline.designBrief = { ...(outline.designBrief ?? {}), ...organized.deck };
        }
    }
    catch (e) {
        (0, abort_1.rethrowIfAborted)(opts.signal, e);
        if (opts.debug)
            console.warn("[ai] organize failed:", e);
    }
    return clampOutlineToDeckgenSlots(outline);
}
/** Images → QA repair → art director. Mutates `pres`. Motion stays in the adapter. */
async function polishGeneratedDeck(pres, outline, guidance, opts, ctx) {
    const config = opts.config ?? (0, types_1.defaultConfig)();
    const allowImagery = opts.enableImageEnrichment !== false && (0, fetch_enrichment_image_1.imageEnrichmentAvailable)(config);
    const canvasDone = Boolean(pres.meta?.deckgen?.canvas);
    if (allowImagery && outline?.slides.length && !canvasDone) {
        const spec = specFromOutlineImagery(outline);
        try {
            (0, abort_1.throwIfAborted)(opts.signal);
            await (0, images_1.enrichImagesInPresentation)(pres, spec, {
                config,
                ...(opts.signal ? { signal: opts.signal } : {}),
                ...(guidance.styleFamily ? { styleFamily: guidance.styleFamily } : {}),
                ...(guidance.language ? { language: guidance.language } : {}),
                ...(guidance.topic ? { topic: guidance.topic } : {}),
                ...(opts.imageEnrichmentPriority ? { imageEnrichmentPriority: opts.imageEnrichmentPriority } : {}),
                onProgress: (p) => {
                    if (opts.signal?.aborted)
                        return;
                    if (p.skippedAll) {
                        ctx.emit({ stage: "compile", progress: 0.75, detailKey: "enrich.skip" });
                        return;
                    }
                    const totalImgs = Math.max(1, p.total);
                    ctx.emit({
                        stage: "compile",
                        progress: 0.7 + 0.08 * (p.done / totalImgs),
                        detailKey: "compile.image",
                        detailParams: { done: p.done, total: p.total },
                    });
                    if ((0, abort_1.shouldCommitGeneratedDeck)(opts.signal))
                        opts.onPresentationDraft?.(pres);
                },
            });
        }
        catch (e) {
            (0, abort_1.rethrowIfAborted)(opts.signal, e);
            if (opts.debug)
                console.warn("[ai] image enrich failed (non-fatal):", e);
        }
    }
    (0, abort_1.throwIfAborted)(opts.signal);
    if (opts.enableQaRepair !== false) {
        try {
            ctx.emit({ stage: "compile", progress: 0.8, detailKey: "qa.checking" });
            (0, validate_1.validateAndRepairPresentation)(pres);
        }
        catch (e) {
            (0, abort_1.rethrowIfAborted)(opts.signal, e);
            if (opts.debug)
                console.warn("[ai] qa pass failed (non-fatal):", e);
        }
    }
    if (opts.enableArtDirector !== false && (0, presets_1.isConfigUsable)(config) && ctx.budget.tryConsume()) {
        try {
            (0, abort_1.throwIfAborted)(opts.signal);
            ctx.emit({ stage: "compile", progress: 0.88, detailKey: "artDirector.reviewing" });
            const { model } = (0, client_1.createLlm)(config.text);
            const screenshots = (await opts.captureReviewShots?.(pres)) ?? [];
            (0, abort_1.throwIfAborted)(opts.signal);
            const report = await (0, art_director_1.reviewPresentation)(pres, {
                model,
                ...(opts.signal ? { signal: opts.signal } : {}),
                language: (0, prompts_1.resolveGuidanceLanguage)(guidance),
                ...(guidance.topic ? { topic: guidance.topic } : {}),
                ...(guidance.styleFamily ? { styleFamily: guidance.styleFamily } : {}),
                imageryUnavailable: !allowImagery,
                ...(screenshots.length ? { screenshots } : {}),
                onUsage: ctx.recordUsage,
            });
            opts.onArtDirectorReport?.(report);
        }
        catch (e) {
            (0, abort_1.rethrowIfAborted)(opts.signal, e);
            if (opts.debug)
                console.warn("[ai] art director failed (non-fatal):", e);
        }
    }
}
