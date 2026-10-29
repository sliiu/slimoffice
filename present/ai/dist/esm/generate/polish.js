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
import { defaultConfig } from "../config/types.js";
import { isConfigUsable } from "../config/presets.js";
import { createLlm } from "../llm/client.js";
import { SLOT_CAPS } from "../deckgen/ids.js";
import { truncateChars } from "../deckgen/text-measure.js";
import { imageEnrichmentAvailable } from "./enrich/fetch-enrichment-image.js";
import { enrichImagesInPresentation } from "./enrich/images.js";
import { outlineToFallbackSpec } from "./compile/compile.js";
import { validateAndRepairPresentation } from "./qa/validate.js";
import { reviewPresentation } from "./qa/art-director.js";
import { resolveGuidanceLanguage } from "./prompts.js";
import { rethrowIfAborted, shouldCommitGeneratedDeck, throwIfAborted } from "./abort.js";
import { GENERATE_MODEL_CALL_BUDGET, ModelCallBudget } from "./call-budget.js";
import { defaultOutlinePageLock } from "./deckgen-ui.js";
import { briefFromOutlineItem, manuscriptFromOutline, organizeDeckContent, researchManuscript, } from "./agent/roles.js";
const FEATURE_DECKGEN = new Set(["cover", "section", "figure", "gallery", "quote", "banner", "close"]);
const FEATURE_HINTS = new Set(["cover", "hero", "section", "stat", "closing", "quote"]);
export function createPolishContext(opts) {
    const budget = new ModelCallBudget(opts.maxModelCalls ?? GENERATE_MODEL_CALL_BUDGET);
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
export function cloneOutline(outline) {
    return {
        ...outline,
        slides: outline.slides.map((s) => ({
            ...s,
            ...(s.bullets ? { bullets: s.bullets.slice() } : {}),
        })),
    };
}
/** After organize (≤8 bullets) clip to deckgen slot caps so pagesFromOutline does not throw. */
export function clampOutlineToDeckgenSlots(outline) {
    const total = outline.slides.length;
    return {
        ...outline,
        slides: outline.slides.map((item, i) => {
            const lock = defaultOutlinePageLock(item, i, total);
            const layout = ((item.deckgenLayout ?? "").trim() || lock.layout).toLowerCase();
            const variant = ((item.deckgenVariant ?? "").trim() || lock.variant).toLowerCase();
            let title = item.title;
            if (layout === "statement") {
                title = truncateChars(title, SLOT_CAPS.statementClaimChars).text;
            }
            else if (layout === "quote") {
                title = truncateChars(title, SLOT_CAPS.quoteChars).text;
            }
            const maxItems = layout === "kpi"
                ? variant === "ledger"
                    ? SLOT_CAPS.barItems + 2
                    : SLOT_CAPS.kpiRow + 2
                : layout === "close"
                    ? SLOT_CAPS.closeTakeaways
                    : layout === "cards"
                        ? variant === "six"
                            ? SLOT_CAPS.cardItems
                            : variant === "four"
                                ? 4
                                : 3
                        : layout === "steps"
                            ? variant === "row-3"
                                ? 3
                                : SLOT_CAPS.stepItems
                            : layout === "timeline"
                                ? SLOT_CAPS.timelineItems
                                : layout === "loop"
                                    ? SLOT_CAPS.loopItems
                                    : layout === "bars"
                                        ? SLOT_CAPS.barItems
                                        : layout === "gallery"
                                            ? variant === "trio"
                                                ? 3
                                                : SLOT_CAPS.galleryItems
                                            : SLOT_CAPS.bulletItems;
            const bullets = (item.bullets ?? [])
                .map((b) => truncateChars(b, SLOT_CAPS.bulletItemChars).text)
                .filter(Boolean)
                .slice(0, maxItems);
            if (!item.bullets && bullets.length === 0)
                return { ...item, title };
            return { ...item, title, bullets };
        }),
    };
}
/** Map outline imageIdea onto the post-compile enrich spec (bg vs hero). */
export function specFromOutlineImagery(outline) {
    const spec = outlineToFallbackSpec(outline, { injectMissingCover: false });
    const total = outline.slides.length;
    for (let i = 0; i < spec.slides.length; i++) {
        const item = outline.slides[i];
        const idea = item?.imageIdea?.trim();
        if (!item || !idea)
            continue;
        const layout = ((item.deckgenLayout ?? "").trim() || defaultOutlinePageLock(item, i, total).layout).toLowerCase();
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
export async function enrichOutlineContent(outlineInput, guidance, opts, ctx) {
    const outline = cloneOutline(outlineInput);
    const config = opts.config ?? defaultConfig();
    if (!isConfigUsable(config))
        return outline;
    const { model } = createLlm(config.text);
    let manuscript = manuscriptFromOutline(outline, guidance);
    if (ctx.budget.tryConsume()) {
        try {
            throwIfAborted(opts.signal);
            ctx.emit({ stage: "outline", progress: 0.03, detailKey: "research.drafting" });
            throwIfAborted(opts.signal);
            manuscript = await researchManuscript(model, guidance, outline, opts.signal, opts.hostSkillStore, ctx.recordUsage);
            ctx.emit({ stage: "outline", progress: 0.08, detailKey: "research.ready" });
        }
        catch (e) {
            rethrowIfAborted(opts.signal, e);
            if (opts.debug)
                console.warn("[ai] research failed:", e);
        }
    }
    try {
        throwIfAborted(opts.signal);
        if (!ctx.budget.tryConsume())
            throw new Error("skip");
        const organized = await organizeDeckContent(model, {
            outline,
            manuscript,
            ...(guidance.language ? { language: guidance.language } : {}),
            ...(opts.signal ? { signal: opts.signal } : {}),
            ...(opts.hostSkillStore ? { host: opts.hostSkillStore } : {}),
            onUsage: ctx.recordUsage,
        });
        for (let i = 0; i < outline.slides.length; i++) {
            const brief = organized.slides[i] ?? briefFromOutlineItem(outline.slides[i], outline.title);
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
        rethrowIfAborted(opts.signal, e);
        if (opts.debug)
            console.warn("[ai] organize failed:", e);
    }
    return clampOutlineToDeckgenSlots(outline);
}
/** Images → QA repair → art director. Mutates `pres`. Motion stays in the adapter. */
export async function polishGeneratedDeck(pres, outline, guidance, opts, ctx) {
    const config = opts.config ?? defaultConfig();
    const allowImagery = opts.enableImageEnrichment !== false && imageEnrichmentAvailable(config);
    const canvasDone = Boolean(pres.meta?.deckgen?.canvas);
    if (allowImagery && outline?.slides.length && !canvasDone) {
        const spec = specFromOutlineImagery(outline);
        try {
            throwIfAborted(opts.signal);
            await enrichImagesInPresentation(pres, spec, {
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
                    if (shouldCommitGeneratedDeck(opts.signal))
                        opts.onPresentationDraft?.(pres);
                },
            });
        }
        catch (e) {
            rethrowIfAborted(opts.signal, e);
            if (opts.debug)
                console.warn("[ai] image enrich failed (non-fatal):", e);
        }
    }
    throwIfAborted(opts.signal);
    if (opts.enableQaRepair !== false) {
        try {
            ctx.emit({ stage: "compile", progress: 0.8, detailKey: "qa.checking" });
            validateAndRepairPresentation(pres);
        }
        catch (e) {
            rethrowIfAborted(opts.signal, e);
            if (opts.debug)
                console.warn("[ai] qa pass failed (non-fatal):", e);
        }
    }
    if (opts.enableArtDirector !== false && isConfigUsable(config) && ctx.budget.tryConsume()) {
        try {
            throwIfAborted(opts.signal);
            ctx.emit({ stage: "compile", progress: 0.88, detailKey: "artDirector.reviewing" });
            const { model } = createLlm(config.text);
            const screenshots = (await opts.captureReviewShots?.(pres)) ?? [];
            throwIfAborted(opts.signal);
            const report = await reviewPresentation(pres, {
                model,
                ...(opts.signal ? { signal: opts.signal } : {}),
                language: resolveGuidanceLanguage(guidance),
                ...(guidance.topic ? { topic: guidance.topic } : {}),
                ...(guidance.styleFamily ? { styleFamily: guidance.styleFamily } : {}),
                imageryUnavailable: !allowImagery,
                ...(screenshots.length ? { screenshots } : {}),
                onUsage: ctx.recordUsage,
            });
            opts.onArtDirectorReport?.(report);
        }
        catch (e) {
            rethrowIfAborted(opts.signal, e);
            if (opts.debug)
                console.warn("[ai] art director failed (non-fatal):", e);
        }
    }
}
