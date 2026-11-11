"use strict";
/**
 * Adapter: live generate entry (topic / outline) → canvas author (or no-key fill)
 * → polish (research/organize/images/QA/art director) → editable SlimPPT Presentation.
 *
 * Does not reimplement the catalog. Pairing / layout / variant ids are
 * imported from `packages/ai/src/deckgen` and re-asserted at this boundary.
 *
 * Product generate is always this path. `useDeckgen` is ignored.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DECKGEN_CANVAS = void 0;
exports.isDeckgenGenerateEnabled = isDeckgenGenerateEnabled;
exports.resolveDeckgenSystem = resolveDeckgenSystem;
exports.resolveDeckgenTheme = resolveDeckgenTheme;
exports.isInkBoardGuidance = isInkBoardGuidance;
exports.isFolioGuidance = isFolioGuidance;
exports.fillThemeId = fillThemeId;
exports.materialsFromGuidance = materialsFromGuidance;
exports.toDeckgenInput = toDeckgenInput;
exports.assertDeckgenBoundary = assertDeckgenBoundary;
exports.mergeCanvasPages = mergeCanvasPages;
exports.repairScope = repairScope;
exports.withFolioDecision = withFolioDecision;
exports.withPhotoDecision = withPhotoDecision;
exports.fillMissingPhotos = fillMissingPhotos;
exports.describeUnchangedPages = describeUnchangedPages;
exports.compileDeckgenPresentation = compileDeckgenPresentation;
exports.generatePresentationViaDeckgen = generatePresentationViaDeckgen;
exports.jobsFromOutline = jobsFromOutline;
const core_1 = require("@sliiu/present-core");
const index_js_1 = require("../deckgen/index.js");
const jobs_js_1 = require("../deckgen/jobs.js");
const brief_js_1 = require("../deckgen/brief.js");
const canvas_author_js_1 = require("./canvas-author.js");
const copy_rewrite_js_1 = require("./copy-rewrite.js");
const acquire_page_images_js_1 = require("./enrich/acquire-page-images.js");
const art_director_js_1 = require("./qa/art-director.js");
const prompts_js_1 = require("./prompts.js");
const visual_review_js_1 = require("./visual-review.js");
const types_js_1 = require("../config/types.js");
const presets_js_1 = require("../config/presets.js");
const client_js_1 = require("../llm/client.js");
const animations_js_1 = require("../animations.js");
const reveal_order_js_1 = require("./reveal-order.js");
const deckgen_ui_js_1 = require("./deckgen-ui.js");
const abort_js_1 = require("./abort.js");
const pipeline_p2_policy_js_1 = require("./qa/pipeline-p2-policy.js");
const usage_counter_js_1 = require("./usage-counter.js");
const polish_js_1 = require("./polish.js");
/** Wall-clock time kept for copy rewrite + polish after the vision round. */
const VISUAL_ROUND_RESERVE_MS = 90_000;
/** Below this much time the vision round (capture, review, repair) is not started. */
const VISUAL_ROUND_MIN_MS = 120_000;
/** Time a page-scoped re-author of ≤ 3 pages needs (flash-tier model, measured 2026-11-05: 60–90s). */
const VISUAL_REPAIR_MIN_MS = 100_000;
/** Time a second capture + review needs. */
const VISUAL_REREVIEW_MIN_MS = 60_000;
/** Live generate is always deckgen. `useDeckgen` is a no-op kept for call-site compatibility. */
function isDeckgenGenerateEnabled(_opts) {
    return true;
}
/**
 * Map leftover styleFamily / visualSystem hints onto the two-id whitelist.
 * Used by the no-key fill fallback. Live author picks systemId itself.
 */
function resolveDeckgenSystem(guidance) {
    if (isInkBoardGuidance(guidance))
        return index_js_1.INK_BOARD.systemId;
    if (isFolioGuidance(guidance))
        return index_js_1.FOLIO.systemId;
    const family = (guidance.styleFamily ?? "").trim().toLowerCase();
    if ((0, index_js_1.isVisualSystemId)(family))
        return family;
    if (family.includes("swiss"))
        return "swiss";
    if (family.includes("editorial"))
        return "editorial";
    const vs = String(guidance.visualSystem ?? "").trim().toLowerCase();
    if ((0, index_js_1.isVisualSystemId)(vs))
        return vs;
    // Design P1: B = light magazine → editorial. A / unset → editorial default.
    if (guidance.visualSystem === "B")
        return "editorial";
    return "editorial";
}
/**
 * Named ColorTheme is a seed. Unpaired ids are allowed on the canvas path;
 * fill fallback remaps to the system default.
 */
function resolveDeckgenTheme(systemId, themeHint) {
    const hint = (themeHint ?? "").trim();
    if ((0, index_js_1.isInkBoardThemeAlias)(hint))
        return index_js_1.INK_BOARD.themeId;
    if ((0, index_js_1.isFolioThemeAlias)(hint))
        return index_js_1.FOLIO.themeId;
    if (hint && (0, index_js_1.isColorThemeId)(hint))
        return hint;
    return index_js_1.DEFAULT_COLOR_THEME[systemId];
}
/**
 * Ink Board is editorial + ink. Notes / theme aliases win over a swiss family so a
 * brief that names the look does not land on a remapped swiss seed.
 * A brief that names Folio is not Ink Board — that look is swiss + ikb.
 */
function isInkBoardGuidance(guidance) {
    const notes = [guidance.extraNotes, guidance.goals, guidance.styleFamily, guidance.themeId]
        .map((s) => (s ?? "").toLowerCase())
        .join(" ");
    if (/\bink[-\s]?board\b/.test(notes))
        return true;
    const family = (guidance.styleFamily ?? "").trim().toLowerCase();
    const theme = (guidance.themeId ?? "").trim().toLowerCase();
    if (family === "swiss")
        return false;
    if (namesFolioLook(notes) && !(0, index_js_1.isInkBoardThemeAlias)(theme) && !isEditorialTheme(theme))
        return false;
    if ((0, index_js_1.isInkBoardThemeAlias)(theme))
        return true;
    if (family === "editorial" && (!theme || theme === "ai" || (0, index_js_1.isInkBoardThemeAlias)(theme)))
        return true;
    if (guidance.visualSystem === "editorial" && (!theme || theme === "ai" || (0, index_js_1.isInkBoardThemeAlias)(theme)))
        return true;
    return false;
}
/**
 * Folio is swiss + ikb. Notes / theme aliases win over an editorial family so a
 * brief that names the look does not land on a remapped editorial seed.
 * editorial / ink / indigo / kraft briefs stay those looks; swiss+signal/lemon stays those themes.
 * DeckBrief.folio is the page-number channel, not a look detector.
 */
function isFolioGuidance(guidance) {
    const notes = [guidance.extraNotes, guidance.goals, guidance.styleFamily, guidance.themeId]
        .map((s) => (s ?? "").toLowerCase())
        .join(" ");
    if (/\bink[-\s]?board\b/.test(notes))
        return false;
    const family = (guidance.styleFamily ?? "").trim().toLowerCase();
    const theme = (guidance.themeId ?? "").trim().toLowerCase();
    if (family === "editorial" || guidance.visualSystem === "editorial") {
        return namesFolioLook(notes) && !(0, index_js_1.isInkBoardThemeAlias)(theme) && !isEditorialTheme(theme);
    }
    if (isEditorialTheme(theme) || (0, index_js_1.isInkBoardThemeAlias)(theme))
        return false;
    if (namesFolioLook(notes))
        return true;
    if ((0, index_js_1.isFolioThemeAlias)(theme) || (0, index_js_1.isFolioThemeAlias)(family))
        return true;
    if (family === "swiss" && (!theme || theme === "ai" || (0, index_js_1.isFolioThemeAlias)(theme)))
        return true;
    if (guidance.visualSystem === "swiss" && (!theme || theme === "ai" || (0, index_js_1.isFolioThemeAlias)(theme)))
        return true;
    return false;
}
function namesFolioLook(notes) {
    return /\bfolio\b/.test(notes);
}
function isEditorialTheme(theme) {
    return theme === "indigo" || theme === "kraft";
}
/** Named product look, if the brief locked one. */
function namedLook(guidance) {
    if (isInkBoardGuidance(guidance))
        return index_js_1.INK_BOARD;
    if (isFolioGuidance(guidance))
        return index_js_1.FOLIO;
    return undefined;
}
function lookPaletteIntent(look) {
    return look.themeId === index_js_1.INK_BOARD.themeId
        ? "porcelain paper, near-black ink, no third hue, no gray-on-mud titles"
        : "swiss paper, near-black type, International Klein Blue accent";
}
function fillThemeId(systemId, themeId) {
    const id = resolveDeckgenTheme(systemId, themeId);
    try {
        (0, index_js_1.assertThemePairing)(systemId, id);
        return id;
    }
    catch {
        return index_js_1.DEFAULT_COLOR_THEME[systemId];
    }
}
function materialsFromGuidance(guidance, outline) {
    const fromOutline = outline?.slides.flatMap((s) => [s.title, ...(s.bullets ?? [])].map((t) => t.trim()).filter(Boolean)) ?? [];
    const fromGuidance = [guidance.goals, guidance.scenario, guidance.extraNotes]
        .map((t) => (t ?? "").trim())
        .filter(Boolean);
    const seen = new Set();
    const out = [];
    for (const line of [...fromOutline, ...fromGuidance]) {
        if (seen.has(line))
            continue;
        seen.add(line);
        out.push(line);
    }
    return out;
}
/** Map generate guidance (+ optional user outline) onto deckgen fill input. */
function toDeckgenInput(guidance, outline) {
    const look = namedLook(guidance);
    const systemId = look ? look.systemId : resolveDeckgenSystem(guidance);
    const themeId = look ? look.themeId : fillThemeId(systemId, guidance.themeId);
    const topic = (outline?.title || guidance.topic || "").trim() || "Untitled";
    const materials = materialsFromGuidance(guidance, outline);
    const audience = (guidance.audience ?? outline?.subtitle)?.trim();
    const language = guidance.language?.trim();
    const pages = outline?.slides.length ? (0, deckgen_ui_js_1.pagesFromOutline)(outline) : undefined;
    return {
        topic,
        systemId,
        themeId,
        ...(materials.length ? { materials } : {}),
        ...(audience ? { audience } : {}),
        ...(language ? { language } : {}),
        ...(pages?.length ? { pages } : {}),
    };
}
/** Fill-path boundary: system exists; outline pages still whitelist. Pairing is remapped, not thrown. */
function assertDeckgenBoundary(input) {
    if (!(0, index_js_1.isVisualSystemId)(input.systemId)) {
        throw new deckgen_ui_js_1.DeckgenUserError("pairing", `Unknown VisualSystem "${input.systemId}".`);
    }
    const themeId = input.themeId ?? index_js_1.DEFAULT_COLOR_THEME[input.systemId];
    if (!(0, index_js_1.isColorThemeId)(themeId)) {
        throw new deckgen_ui_js_1.DeckgenUserError("pairing", `Unknown ColorTheme "${themeId}".`);
    }
    for (const page of input.pages ?? []) {
        if (!(0, index_js_1.isLayoutId)(page.layout)) {
            throw new deckgen_ui_js_1.DeckgenUserError("invented-page-type", `Unknown Layout "${page.layout}".`);
        }
        if (!(0, index_js_1.isVariantForLayout)(page.layout, page.variant)) {
            throw new deckgen_ui_js_1.DeckgenUserError("invented-variant", `Variant "${page.variant}" is not valid for ${page.layout}.`);
        }
    }
}
function emitProgress(opts, event) {
    opts.onProgress?.(event);
}
/**
 * Per-page best-of between the author pass and the repair pass: a page comes from the repair
 * pass unless the author's version had fewer page-level findings. Returns undefined when the
 * merge would equal the repair pass (nothing to recompile) or the page counts differ.
 */
function mergeCanvasPages(first, second) {
    if (first.slides.length !== second.slides.length)
        return undefined;
    const perPage = (pass) => {
        const counts = new Array(pass.slides.length).fill(0);
        for (const f of pass.compiled.reflect.findings) {
            if (f.slideIdx >= 0 && f.slideIdx < counts.length)
                counts[f.slideIdx] += 1;
        }
        return counts;
    };
    const a = perPage(first);
    const b = perPage(second);
    let tookFirst = 0;
    const merged = second.slides.map((s, i) => {
        if (a[i] < b[i]) {
            tookFirst += 1;
            return first.slides[i];
        }
        return s;
    });
    return tookFirst ? merged : undefined;
}
/**
 * Pages a repair pass must touch, or undefined when a deck-level finding does not name its pages
 * (then the whole deck is re-authored). Also undefined when the scope would be the whole deck
 * anyway (≥ 60 % of pages) — one coherent pass beats stitching most of the deck back together.
 */
function repairScope(findings, pageCount) {
    const pages = new Set();
    for (const f of findings) {
        if (f.slideIdx >= 0 && f.slideIdx < pageCount) {
            pages.add(f.slideIdx);
            continue;
        }
        if (!f.pages?.length)
            return undefined;
        for (const p of f.pages)
            if (p >= 0 && p < pageCount)
                pages.add(p);
    }
    if (!pages.size || pages.size >= Math.ceil(pageCount * 0.6))
        return undefined;
    return [...pages].sort((a, b) => a - b);
}
/**
 * Folio decision, in priority order: explicit `guidance.pageNumbers` → the user's own words in
 * extraNotes / goals ("加页码", "no page numbers") → the organizer's Design Brief → a deck-mode /
 * length default. The result is always a boolean so snap can enforce it.
 */
function withFolioDecision(brief, guidance, pageCount) {
    const folio = guidance.pageNumbers ?? (0, brief_js_1.folioFromNotes)(guidance.extraNotes, guidance.goals) ?? brief.folio ?? (0, brief_js_1.defaultFolio)(brief.mode, pageCount);
    return { ...brief, folio };
}
/**
 * Photo decision, in priority order: the user's own words ("不要配图", "photo-heavy") → the
 * organizer's Design Brief → a deck-mode default. Always set, so `applyPhotoRhythm` can enforce it.
 */
function withPhotoDecision(brief, guidance) {
    const fromNotes = (0, brief_js_1.photoRhythmFromNotes)(guidance.extraNotes, guidance.goals);
    // The organizer may answer "none" to a brief that asked for photographs on the cover (a
    // white-paper skill nudges it there); the user's ask wins, at the anchor-page default.
    const organizer = brief.photoRhythm === "none" && (0, brief_js_1.notesWantPhotos)(guidance.extraNotes, guidance.goals) ? "anchors" : brief.photoRhythm;
    const photoRhythm = fromNotes ?? organizer ?? (0, brief_js_1.defaultPhotoRhythm)(brief.mode);
    return { ...brief, photoRhythm };
}
/**
 * Photo pages whose fetch missed borrow the nearest fetched photograph (cover first, then by page
 * distance). Cover and close sharing one picture is an editorial convention; a paper page between
 * photo anchors is not. Returns the pages that were filled.
 */
function fillMissingPhotos(jobs, images) {
    const have = jobs.filter((j) => images.has(j.index)).map((j) => j.index);
    if (!have.length)
        return [];
    const filled = [];
    for (const j of jobs) {
        if (j.carrier !== "photo" || images.has(j.index))
            continue;
        const donor = have.includes(0) ? 0 : have.reduce((best, i) => (Math.abs(i - j.index) < Math.abs(best - j.index) ? i : best), have[0]);
        images.set(j.index, images.get(donor));
        filled.push(j.index);
    }
    return filled;
}
/** One line per page the later pass must leave alone: index · job · title · composition · folio, plus a short "says" so the next chunk does not repeat those facts. */
function describeUnchangedPages(slides, jobs, scope, system) {
    const skip = new Set(scope);
    return slides
        .map((s, i) => {
        if (!s || skip.has(i))
            return "";
        const job = jobs[i];
        const title = (0, index_js_1.findContentTitle)(s.elements, system)?.text ?? s.elements.find((e) => e.kind === "text" && e.text)?.text ?? "";
        const folio = s.elements.find((e) => e.kind === "text" && e.text && /^\d{1,2}$/.test(e.text.trim()) && e.bbox.y < index_js_1.CANVAS.height / 3)?.text;
        const said = s.elements
            .filter((e) => e.kind === "text" && e.text && e.text.trim() !== title.trim() && !/^\d{1,2}$/.test(e.text.trim()))
            .map((e) => e.text.trim().replace(/\s+/g, " "))
            .slice(0, 3)
            .join(" · ")
            .slice(0, 96);
        return `#${i} · ${job?.job ?? s.layout} · ${title.slice(0, 40)} · ${job?.composition ?? "-"}${folio ? ` · folio ${folio.trim()}` : ""}${said ? ` · says ${said}` : ""}`;
    })
        .filter(Boolean)
        .join("\n");
}
function logCanvasPass(pass, systemId, compiled) {
    const meta = compiled.presentation.meta;
    const stats = meta?.deckgen?.canvasStats;
    const fmt = (r) => Object.entries(r ?? {})
        .map(([k, v]) => `${k}=${v}`)
        .join(" ") || "-";
    console.info(`[ai] canvas ${pass}: system=${systemId} pages=${stats?.pages ?? "?"} passed=${compiled.reflect.passed}\n` +
        `      kinds: ${fmt(stats?.kinds)}\n` +
        `      devices: ${fmt(stats?.devices)} · photo=${stats?.photoPages ?? 0} scrim=${stats?.scrimPages ?? 0}\n` +
        `      drops(${stats?.drops.length ?? 0}): ${stats?.drops.slice(0, 6).join(" | ") || "-"}`);
    for (const f of compiled.reflect.findings.slice(0, 12))
        console.info(`      [${f.kind} #${f.slideIdx}] ${f.issue}`);
}
function rethrowAsUserError(e) {
    if (e instanceof deckgen_ui_js_1.DeckgenUserError)
        throw e;
    const raw = e instanceof Error ? e.message : String(e);
    const kind = raw.includes("cannot pair")
        ? "pairing"
        : /Unknown Layout|invented layout|No skeleton/.test(raw)
            ? "invented-layout"
            : /Variant .+ is not valid|invented variant/.test(raw)
                ? "invented-variant"
                : /Unknown beat intent|page type/.test(raw)
                    ? "invented-page-type"
                    : /exceeds|over.?slot/.test(raw)
                        ? "over-slots"
                        : "unknown";
    if (kind === "unknown") {
        throw new deckgen_ui_js_1.DeckgenUserError("unknown", (0, deckgen_ui_js_1.formatDeckgenUserError)(e));
    }
    throw new deckgen_ui_js_1.DeckgenUserError(kind, raw);
}
/**
 * Sync compile only (no LLM, no images, no QA, no motion). Tests that need a
 * locked Presentation IR without polish should call this.
 */
function compileDeckgenPresentation(guidance, outline) {
    let input;
    try {
        input = toDeckgenInput(guidance, outline);
        assertDeckgenBoundary(input);
    }
    catch (e) {
        rethrowAsUserError(e);
    }
    let result;
    try {
        result = (0, index_js_1.generateDeck)({ ...input, skipReflectAssert: true });
    }
    catch (e) {
        rethrowAsUserError(e);
    }
    for (const slide of result.presentation.slides) {
        const layout = slide.customData?.tags?.layout ?? "";
        const variant = slide.customData?.tags?.variant ?? "";
        if (!(0, index_js_1.isLayoutId)(layout) || !index_js_1.LAYOUT_IDS.includes(layout)) {
            throw new deckgen_ui_js_1.DeckgenUserError("invented-layout", `deckgen emitted invented layout "${layout}".`);
        }
        if (!(0, index_js_1.isVariantForLayout)(layout, variant)) {
            const allowed = index_js_1.LAYOUT_VARIANTS[layout].join(", ");
            throw new deckgen_ui_js_1.DeckgenUserError("invented-variant", `deckgen emitted invented variant "${variant}" for ${layout}. Allowed: ${allowed}.`);
        }
    }
    return result.presentation;
}
function applyMotion(pres, opts, outline) {
    if (opts.enableAnimations === false) {
        emitProgress(opts, { stage: "compile", progress: 0.97, detailKey: "animate.skipped" });
        return;
    }
    emitProgress(opts, { stage: "compile", progress: 0.92, detailKey: "animate.applying" });
    try {
        (0, animations_js_1.autoAnimatePresentation)(pres, {
            ...(opts.motionBundle ? { bundle: opts.motionBundle } : {}),
            ...(opts.motionBundleId ? { bundleId: opts.motionBundleId } : {}),
            ...(opts.maxEffectsPerSlide !== undefined ? { maxEffects: opts.maxEffectsPerSlide } : {}),
            ...(outline
                ? {
                    revealForSlide: (index) => {
                        const item = outline.slides[index];
                        return item ? (0, reveal_order_js_1.speechPlanFromOutlineItem)(item) : undefined;
                    },
                }
                : {}),
        });
        for (const slide of pres.slides) {
            (0, core_1.applyInitialEntranceState)(slide, (0, core_1.computeInitialEntranceState)(slide));
        }
        emitProgress(opts, { stage: "compile", progress: 0.96, detailKey: "animate.ready" });
    }
    catch (e) {
        (0, abort_js_1.rethrowIfAborted)(opts.signal, e);
        if (opts.debug)
            console.warn("[ai] deckgen motion failed (non-fatal):", e);
        emitProgress(opts, { stage: "compile", progress: 0.96, detailKey: "animate.failed" });
    }
}
/**
 * Run deckgen and return the same Presentation IR the editor already loads
 * (`loadPresentation` / `previewGeneratedPresentation`).
 *
 * With a usable text config: research + organize the outline, then compile,
 * enrich images, QA-repair, art-director recolor, motion.
 * Without a key: compile the reviewed outline (or narrative template) only.
 */
async function generatePresentationViaDeckgen(guidance, outline, opts = {}) {
    (0, abort_js_1.throwIfAborted)(opts.signal);
    const usage = new usage_counter_js_1.UsageCounter();
    const ctx = (0, polish_js_1.createPolishContext)({
        ...opts,
        onLlmUsage: (u) => {
            usage.addCall(u);
            opts.onLlmUsage?.(u);
        },
        onProgress: (p) => {
            opts.onProgress?.({ ...p, usage: usage.snapshot() });
        },
    });
    const { skipPlan, skipLayout, skipWrite } = (0, pipeline_p2_policy_js_1.resumeSkipFlags)(opts.resume?.stage);
    let working = skipPlan && opts.resume?.outline ? opts.resume.outline : outline;
    if (working && !skipPlan) {
        working = await (0, polish_js_1.enrichOutlineContent)(working, guidance, opts, ctx);
        opts.onOutlineOrganized?.(working);
    }
    else if (working) {
        opts.onOutlineOrganized?.(working);
    }
    if (!skipPlan)
        (0, pipeline_p2_policy_js_1.throwIfPipelineP2Inject)(opts.pipelineP2Inject, "plan");
    (0, abort_js_1.throwIfAborted)(opts.signal);
    if (!skipPlan)
        ctx.emit({ stage: "outline", progress: 0.15, detailKey: "outline.ready" });
    if (!skipLayout) {
        (0, pipeline_p2_policy_js_1.throwIfPipelineP2Inject)(opts.pipelineP2Inject, "layout");
        ctx.emit({ stage: "compile", progress: 0.45, detailKey: "compile.composing" });
    }
    const config = opts.config ?? (0, types_js_1.defaultConfig)();
    const brand = (0, index_js_1.parseBrandHex)(guidance.extraNotes);
    let pres = skipLayout && opts.resume?.presentation ? structuredClone(opts.resume.presentation) : undefined;
    /** Set when the canvas path already ran the vision review; polish reports it instead of a second call. */
    let visualReview;
    const canvasExtras = (0, canvas_author_js_1.canvasExtraChunks)(working?.slides.length ?? 0, ctx.budget.remaining());
    if (!pres && working?.slides.length && (0, presets_js_1.isConfigUsable)(config) && ctx.budget.tryConsume()) {
        try {
            const jobs = jobsFromOutline(working);
            const look = namedLook(guidance);
            const deckBrief = withPhotoDecision(withFolioDecision((0, brief_js_1.coerceDeckBrief)(working.designBrief), guidance, jobs.length), guidance);
            const lockedBrief = look
                ? {
                    ...deckBrief,
                    systemId: look.systemId,
                    paletteIntent: deckBrief.paletteIntent ?? lookPaletteIntent(look),
                }
                : deckBrief;
            // One photo decision for the whole deck, enforced before acquisition so only the pages that
            // will carry a photograph fetch one.
            (0, jobs_js_1.applyPhotoRhythm)(jobs, deckBrief.photoRhythm);
            const images = await (0, acquire_page_images_js_1.acquirePageImages)(jobs, {
                config,
                topic: working.title || guidance.topic,
                ...(guidance.language ? { language: guidance.language } : {}),
                ...(opts.signal ? { signal: opts.signal } : {}),
                ...(opts.imageEnrichmentPriority ? { imageEnrichmentPriority: opts.imageEnrichmentPriority } : {}),
                onProgress: (p) => {
                    if (p.skippedAll)
                        return;
                    ctx.emit({
                        stage: "compile",
                        progress: 0.35 + 0.1 * (p.done / Math.max(1, p.total)),
                        detailKey: "compile.image",
                        detailParams: { done: p.done, total: p.total },
                    });
                },
            });
            // A photo page whose photograph never arrived borrows a sibling's (the cover's first): the
            // deck keeps one rhythm instead of one paper page among photo anchors. Only when no photo
            // arrived at all is the carrier downgraded — before the brief is derived, so the author
            // prompt and the reflect gate agree and the repair round is not spent on a page nobody can fix.
            fillMissingPhotos(jobs, images);
            for (const j of jobs)
                if (j.carrier === "photo" && !images.has(j.index))
                    j.carrier = "typeOnly";
            const briefs = (0, jobs_js_1.briefsFromJobs)(jobs);
            const { model } = (0, client_js_1.createLlm)(config.text);
            let paidExtras = 0;
            while (paidExtras < canvasExtras && ctx.budget.tryConsume())
                paidExtras += 1;
            const chunks = (0, canvas_author_js_1.canvasChunkIndexes)(jobs.length, paidExtras);
            const lookLock = look
                ? { systemId: look.systemId, palette: index_js_1.COLOR_THEME_PALETTES[look.themeId] }
                : undefined;
            const authorBase = {
                model,
                topic: working.title || guidance.topic,
                jobs,
                images,
                brief: lockedBrief,
                ...(lookLock ? { lock: lookLock } : {}),
                ...(brand ? { brand } : {}),
                ...(opts.hostSkillStore ? { host: opts.hostSkillStore } : {}),
                ...(opts.signal ? { signal: opts.signal } : {}),
                onUsage: ctx.recordUsage,
                ...(opts.sampleComposition ? { sampleComposition: opts.sampleComposition } : {}),
                ...(opts.canvasLayout === "author" ? {} : { slots: true }),
            };
            const slideSlots = new Array(jobs.length);
            const placeChunk = (indexes, slides) => {
                if (!indexes) {
                    slides.forEach((slide, i) => {
                        slideSlots[i] = slide;
                    });
                    return;
                }
                indexes.forEach((pageIdx, n) => {
                    const slide = slides[n];
                    if (slide)
                        slideSlots[pageIdx] = slide;
                });
            };
            let authored = await (0, canvas_author_js_1.authorCanvasDeck)({
                ...authorBase,
                ...(chunks.length > 1 ? { only: chunks[0] } : {}),
                ...(opts.onCanvasAuthored ? { onRaw: (raw) => opts.onCanvasAuthored?.(raw, "author") } : {}),
            });
            placeChunk(chunks.length > 1 ? chunks[0] : undefined, authored.slides);
            for (let c = 1; c < chunks.length; c++) {
                const only = chunks[c];
                const next = await (0, canvas_author_js_1.authorCanvasDeck)({
                    ...authorBase,
                    only,
                    unchanged: describeUnchangedPages(slideSlots, jobs, only, (0, index_js_1.resolveVisualSystem)(authored.systemId)),
                    lock: lookLock ?? {
                        systemId: authored.systemId,
                        ...(authored.palette ? { palette: authored.palette } : {}),
                    },
                    ...(opts.onCanvasAuthored ? { onRaw: (raw) => opts.onCanvasAuthored?.(raw, "author") } : {}),
                });
                placeChunk(only, next.slides);
            }
            if (chunks.length > 1) {
                if (slideSlots.some((slide) => !slide))
                    throw new Error("canvas chunk missing pages");
                authored = { ...authored, slides: slideSlots.filter((slide) => !!slide) };
            }
            let system = (0, index_js_1.resolveVisualSystem)(look ? look.systemId : authored.systemId);
            let theme = look
                ? (0, index_js_1.seedColorTheme)(look.systemId, look.themeId, brand)
                : (0, index_js_1.themeFromAuthoredLook)({
                    systemId: authored.systemId,
                    ...(authored.themeId ? { themeId: authored.themeId } : {}),
                    ...(authored.palette ? { palette: authored.palette } : {}),
                    ...(brand ? { brand } : {}),
                });
            const folio = deckBrief.folio;
            let compiled = (0, index_js_1.compileCanvasDeck)({
                system,
                theme,
                slides: authored.slides,
                title: working.title || guidance.topic,
                briefs,
                ...(folio != null ? { folio } : {}),
            });
            let repaired = false;
            if (opts.debug)
                logCanvasPass("author", authored.systemId, compiled);
            // One re-author pass over the pages `findings` name (the whole deck when a finding does not
            // name its pages), merged per page against the current deck so a repair cannot regress a
            // page that was fine. Shared by the structural gate round and the visual review round.
            const repairPass = async (findings, label, signal = opts.signal, extra) => {
                const repair = findings.map((f) => `[${f.kind} #${f.slideIdx}] ${f.issue}`).join("; ");
                const firstPass = { compiled, slides: authored.slides };
                // Page-scoped repair whenever every finding names its pages: only those pages are
                // re-authored (cheaper, faster, and the pages that passed cannot regress). A deck-level
                // finding without pages (e.g. "every page uses the same composition") forces a full pass.
                const scope = repairScope(findings, authored.slides.length);
                const scopedRepair = await (0, canvas_author_js_1.authorCanvasDeck)({
                    model: extra?.model ?? model,
                    topic: working.title || guidance.topic,
                    jobs,
                    images,
                    brief: lockedBrief,
                    repair,
                    ...(extra?.shots?.length ? { shots: extra.shots } : {}),
                    ...(scope ? { only: scope, unchanged: describeUnchangedPages(firstPass.slides, jobs, scope, system) } : {}),
                    lock: lookLock ?? {
                        systemId: authored.systemId,
                        ...(authored.palette ? { palette: authored.palette } : {}),
                    },
                    ...(brand ? { brand } : {}),
                    ...(opts.hostSkillStore ? { host: opts.hostSkillStore } : {}),
                    ...(signal ? { signal } : {}),
                    onUsage: ctx.recordUsage,
                    ...(opts.sampleComposition ? { sampleComposition: opts.sampleComposition } : {}),
                    ...(opts.canvasLayout === "author" ? {} : { slots: true }),
                    ...(opts.onCanvasAuthored
                        ? { onRaw: (raw) => opts.onCanvasAuthored?.(scope && raw && typeof raw === "object" ? { ...raw, repairPages: scope } : raw, "repair") }
                        : {}),
                });
                if (scope) {
                    // Keep the first pass's look; splice the re-authored pages into it.
                    const slides = firstPass.slides.slice();
                    scope.forEach((pageIdx, n) => {
                        const s = scopedRepair.slides[n];
                        if (s)
                            slides[pageIdx] = s;
                    });
                    authored = { ...authored, slides };
                }
                else {
                    authored = scopedRepair;
                    if (!look) {
                        system = (0, index_js_1.resolveVisualSystem)(authored.systemId);
                        theme = (0, index_js_1.themeFromAuthoredLook)({
                            systemId: authored.systemId,
                            ...(authored.themeId ? { themeId: authored.themeId } : {}),
                            ...(authored.palette ? { palette: authored.palette } : {}),
                            ...(brand ? { brand } : {}),
                        });
                    }
                }
                const repairedCompiled = (0, index_js_1.compileCanvasDeck)({
                    system,
                    theme,
                    slides: authored.slides,
                    title: working.title || guidance.topic,
                    briefs,
                    ...(folio != null ? { folio } : {}),
                });
                // A full repair pass re-authors the whole deck and regularly regresses pages that were fine
                // (moves the table from page 4 to page 6, adds a fifth card under "four …"). Keep, per page,
                // whichever version has fewer findings, then recompile so deck-level gates see the merge.
                const merged = mergeCanvasPages(firstPass, { compiled: repairedCompiled, slides: authored.slides });
                compiled = repairedCompiled;
                if (merged) {
                    const mergedCompiled = (0, index_js_1.compileCanvasDeck)({ system, theme, slides: merged, title: working.title || guidance.topic, briefs, ...(folio != null ? { folio } : {}) });
                    if (mergedCompiled.reflect.findings.length < repairedCompiled.reflect.findings.length) {
                        compiled = mergedCompiled;
                        authored = { ...authored, slides: merged };
                    }
                }
                if (opts.debug) {
                    console.log(`[ai] canvas ${label} scope: ${scope ? `pages ${scope.join(", ")}` : "full deck"}`);
                    logCanvasPass(label === "visual" ? "repair" : label, authored.systemId, compiled);
                }
            };
            // Copy-voice findings are not in this list — those strings are rewritten in place later.
            const structural = compiled.reflect.findings.filter((f) => !(0, copy_rewrite_js_1.isCopyVoiceIssue)(f.issue));
            if (structural.length && ctx.budget.tryConsume()) {
                repaired = true;
                await repairPass(structural, "repair");
            }
            // Look at the pages: render every one, let a vision model judge the pixels, and re-author the
            // worst (≤ 3) it marks high / medium in a layout category. Needs a host that can render
            // (`captureReviewShots`), a model that can see, and two calls left (review + repair).
            const visualRetry = (opts.enableArtDirectorRetry ?? opts.enableArtDirector) !== false;
            // The reviewer is a model that can see: the configured review model, else the text model when
            // it can read images. Neither → skip the round rather than send pixels to a text-only model.
            const visionText = (0, presets_js_1.visionReviewTextConfig)(config);
            // The round is optional: it gets the wall-clock time left after a reserve for copy rewrite and
            // polish, and is skipped or cut short (keeping the deck as it stands) rather than letting a
            // slow reviewer time out the whole generate.
            const wantVisual = visualRetry && opts.enableArtDirector !== false && Boolean(opts.captureReviewShots && visionText) && ctx.budget.remaining() >= 2;
            const box = wantVisual
                ? (0, abort_js_1.optionalStepBox)(opts.signal, opts.wallDeadline, { reserveMs: VISUAL_ROUND_RESERVE_MS, minMs: VISUAL_ROUND_MIN_MS })
                : undefined;
            if (box && opts.captureReviewShots && visionText) {
                const signal = box.signal;
                let beforeVisual;
                try {
                    (0, abort_js_1.throwIfAborted)(signal);
                    ctx.emit({ stage: "compile", progress: 0.6, detailKey: "artDirector.reviewing" });
                    const reviewModel = visionText === config.text ? model : (0, client_js_1.createLlm)(visionText).model;
                    const capture = opts.captureReviewShots;
                    const round = await (0, visual_review_js_1.visualReviewRound)({
                        pageCount: () => authored.slides.length,
                        capture: async () => {
                            const shots = (await capture(compiled.presentation, { all: true })) ?? [];
                            (0, abort_js_1.throwIfAborted)(signal);
                            return shots;
                        },
                        // The first review only picks pages to re-author; the final one (after the repair, or the
                        // only one when nothing was repaired) may also apply its safe recolor edits.
                        review: (screenshots) => (0, art_director_js_1.reviewPresentation)(compiled.presentation, {
                            model: reviewModel,
                            signal,
                            language: (0, prompts_js_1.resolveGuidanceLanguage)(guidance),
                            ...(guidance.topic ? { topic: guidance.topic } : {}),
                            screenshots,
                            applyEdits: false,
                            onUsage: ctx.recordUsage,
                        }),
                        repair: async (findings, shots) => {
                            beforeVisual = { compiled, authored, system, theme, repaired };
                            repaired = true;
                            // The reviewer judged pixels, so the rewrite gets the same pixels. When the text model
                            // cannot read images, let the vision model author these ≤ 3 pages — otherwise the
                            // screenshots are sent to a model that ignores them.
                            await repairPass(findings, "visual", signal, {
                                shots,
                                ...((0, presets_js_1.textModelSupportsVision)(config.text) ? {} : { model: reviewModel }),
                            });
                        },
                        // Whatever the geometry gate still fails after the structural pass joins the visual set:
                        // pages neither channel alone would have sent to the author this round. Slot pages are
                        // skipped — their coordinates come from `layoutPage`, so a re-author can rewrite the
                        // copy but cannot move the carrier; sending them to the author burns a call on a page
                        // whose geometry is fixed. Their voids belong to the layout engine, not the repair pass.
                        surviving: () => compiled.reflect.findings.filter((f) => !(0, copy_rewrite_js_1.isCopyVoiceIssue)(f.issue) &&
                            !(opts.canvasLayout !== "author" && f.slideIdx >= 0 && jobs[f.slideIdx] && (0, canvas_author_js_1.isSlotPage)(jobs[f.slideIdx], images))),
                        revert: () => {
                            if (!beforeVisual)
                                return;
                            ({ compiled, authored, system, theme, repaired } = beforeVisual);
                        },
                        tryConsume: () => ctx.budget.tryConsume(),
                        remaining: () => ctx.budget.remaining(),
                        // keep one call for the copy rewrite after this round
                        reserveAfter: 1,
                        hasTimeFor: (step) => box.left() >= (step === "repair" ? VISUAL_REPAIR_MIN_MS : VISUAL_REREVIEW_MIN_MS),
                        runAborted: () => Boolean(opts.signal?.aborted),
                        ...(opts.debug ? { log: (msg) => console.log(`[ai] visual round: ${msg}`) } : {}),
                    });
                    if (round) {
                        // Recolor edits name shape ids of the deck that was reviewed: apply them only when that
                        // deck is the one being shipped (no repair after the review that produced them).
                        const current = round.scoreBefore != null || !round.repairedPages.length;
                        const edits = current && round.report.edits?.length ? (0, art_director_js_1.applyArtDirectorEdits)(compiled.presentation, round.report.edits) : { applied: 0, skipped: 0 };
                        visualReview = {
                            ...round.report,
                            ...edits,
                            repairedPages: round.repairedPages,
                            ...(round.scoreBefore != null ? { scoreBefore: round.scoreBefore } : {}),
                            ...(round.revertedPages?.length ? { revertedPages: round.revertedPages } : {}),
                        };
                        if (opts.debug)
                            console.log(`[ai] visual review: score ${round.scoreBefore != null ? `${round.scoreBefore} → ` : ""}${round.report.score}${round.repairedPages.length ? ` · re-authored pages ${round.repairedPages.join(", ")}` : ""}${round.revertedPages?.length ? ` · reverted pages ${round.revertedPages.join(", ")}` : ""}`);
                    }
                }
                catch (e) {
                    if (box.expired()) {
                        // Out of time: whatever the round finished (a merged repair) is already in `compiled`.
                        if (opts.debug)
                            console.warn("[ai] visual review ran out of time; keeping the deck as it stands");
                    }
                    else {
                        (0, abort_js_1.rethrowIfAborted)(opts.signal, e);
                        if (opts.debug)
                            console.warn("[ai] visual review failed (non-fatal):", e);
                    }
                }
                finally {
                    box.dispose();
                }
            }
            else if (opts.debug && wantVisual && opts.wallDeadline != null) {
                console.log(`[ai] visual review skipped: ${Math.round((opts.wallDeadline - Date.now()) / 1000)}s left on the wall clock`);
            }
            if (compiled.reflect.findings.some((f) => (0, copy_rewrite_js_1.isCopyVoiceIssue)(f.issue)) &&
                (0, copy_rewrite_js_1.copyTargetsFromSlides)(compiled.painted).length &&
                ctx.budget.tryConsume()) {
                try {
                    const rewritten = await (0, copy_rewrite_js_1.rewriteCopyVoice)({
                        model,
                        slides: compiled.painted,
                        ...(opts.signal ? { signal: opts.signal } : {}),
                        onUsage: ctx.recordUsage,
                    });
                    if (rewritten.elements > 0) {
                        (0, copy_rewrite_js_1.mirrorOutlineCopy)(working.slides, rewritten.rows);
                        const presentation = (0, index_js_1.emitPresentation)(compiled.painted, system, theme, working.title || guidance.topic);
                        const reflect = (0, index_js_1.reflectCanvas)(compiled.painted, system, theme, briefs);
                        presentation.meta = { ...(compiled.presentation.meta ?? {}), ...(presentation.meta ?? {}) };
                        compiled = { ...compiled, presentation, reflect };
                        repaired = true;
                    }
                }
                catch (e) {
                    (0, abort_js_1.rethrowIfAborted)(opts.signal, e);
                    if (opts.debug)
                        console.warn("[ai] copy rewrite failed", e);
                }
            }
            if (compiled.presentation.slides.length) {
                pres = compiled.presentation;
                const meta = (pres.meta ?? {});
                const deckgen = { ...(meta.deckgen ?? {}), repaired, passed: compiled.reflect.passed };
                pres.meta = { ...meta, deckgen };
            }
        }
        catch (e) {
            (0, abort_js_1.rethrowIfAborted)(opts.signal, e);
            console.warn("[ai] canvas author failed, using fill:", e);
        }
    }
    if (!pres) {
        pres = compileDeckgenPresentation(guidance, working);
    }
    if ((0, abort_js_1.shouldCommitGeneratedDeck)(opts.signal))
        opts.onPresentationDraft?.(pres);
    if (!skipWrite) {
        await (0, polish_js_1.polishGeneratedDeck)(pres, working, guidance, opts, ctx, visualReview);
        (0, pipeline_p2_policy_js_1.throwIfPipelineP2Inject)(opts.pipelineP2Inject, "write");
    }
    (0, abort_js_1.throwIfAborted)(opts.signal);
    applyMotion(pres, opts, working);
    if ((0, abort_js_1.shouldCommitGeneratedDeck)(opts.signal))
        opts.onPresentationDraft?.(pres);
    ctx.emit({ stage: "done", progress: 1 });
    return pres;
}
exports.DECKGEN_CANVAS = index_js_1.CANVAS;
/** Outline rows → per-page visual jobs (title, bullets, imageIdea, layout hints, Design Brief). Shared with the offline replay tool. */
function jobsFromOutline(outline) {
    return (0, jobs_js_1.jobsFromPages)(outline.slides.map((s) => ({
        title: s.title,
        ...(s.bullets ? { bullets: s.bullets } : {}),
        ...(s.imageIdea ? { imageIdea: s.imageIdea } : {}),
        ...(s.layoutHint ? { layoutHint: s.layoutHint } : {}),
        ...(s.deckgenLayout ? { deckgenLayout: s.deckgenLayout } : {}),
        ...(0, brief_js_1.coercePageBrief)(s),
    })), outline.title);
}
