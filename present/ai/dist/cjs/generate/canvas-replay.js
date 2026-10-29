"use strict";
/**
 * Offline replay of a raw canvas-author dump (what `onCanvasAuthored` wrote) through
 * normalize → zod → toFilled → snap/reflect. No LLM call. This is how a live-run
 * finding gets turned into a normalizer / gate fix without paying for another run:
 * every "why did this element drop" or "why did the gate fire" is answerable here.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplaySchemaError = void 0;
exports.replayCanvasDump = replayCanvasDump;
const pipeline_js_1 = require("../deckgen/pipeline.js");
const visual_system_js_1 = require("../deckgen/visual-system.js");
const color_theme_js_1 = require("../deckgen/color-theme.js");
const jobs_js_1 = require("../deckgen/jobs.js");
const canvas_schema_js_1 = require("./canvas-schema.js");
const canvas_author_js_1 = require("./canvas-author.js");
const deckgen_adapter_js_1 = require("./deckgen-adapter.js");
/** 1×1 transparent PNG; only has to pass `realImageSrc`. */
const PLACEHOLDER_PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
function replayCanvasDump(input) {
    const jobs = (0, deckgen_adapter_js_1.jobsFromOutline)(input.outline);
    const briefs = (0, jobs_js_1.briefsFromJobs)(jobs);
    const normalized = (0, canvas_schema_js_1.normalizeCanvasDeck)(input.raw);
    const parsed = canvas_schema_js_1.CanvasDeckSchema.safeParse(normalized);
    if (!parsed.success) {
        const issues = parsed.error.issues.slice(0, 20).map((iss) => `${iss.path.join(".")}: ${iss.message}`);
        throw new ReplaySchemaError(issues);
    }
    const deck = parsed.data;
    // Live runs hand the author real photos; offline we have none, so stand in a 1×1 PNG on every
    // page the model made a photo page. Otherwise every photo-dependent gate (full-bleed, anchor
    // weight, scrim) fires spuriously and the replay stops matching the live findings.
    const images = input.images ?? new Map();
    if (!input.images) {
        deck.slides.forEach((s, i) => {
            if (s.background?.kind === "image")
                images.set(jobs[i]?.index ?? i, PLACEHOLDER_PHOTO);
        });
    }
    const slides = (0, canvas_author_js_1.toFilled)(deck, jobs, images);
    const system = (0, visual_system_js_1.resolveVisualSystem)(deck.systemId);
    const theme = (0, color_theme_js_1.themeFromAuthoredLook)({
        systemId: deck.systemId,
        ...(deck.themeId ? { themeId: deck.themeId } : {}),
        ...(deck.palette ? { palette: deck.palette } : {}),
        ...(input.brand ? { brand: input.brand } : {}),
    });
    const compiled = (0, pipeline_js_1.compileCanvasDeck)({ system, theme, slides, title: input.outline.title, briefs });
    const meta = (compiled.presentation.meta ?? {});
    const stats = meta.deckgen?.canvasStats ?? { pages: slides.length, kinds: {}, devices: {}, scrimPages: 0, photoPages: 0, drops: [], findings: compiled.reflect.findings.length };
    return { systemId: deck.systemId, compiled, stats, schemaIssues: [] };
}
class ReplaySchemaError extends Error {
    issues;
    constructor(issues) {
        super(`canvas dump failed schema validation after normalize:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
        this.issues = issues;
        this.name = "ReplaySchemaError";
    }
}
exports.ReplaySchemaError = ReplaySchemaError;
