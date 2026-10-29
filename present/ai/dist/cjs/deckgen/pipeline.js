"use strict";
/**
 * Offline / no-key deckgen pipeline:
 * narrative outline → lock VisualSystem → assign Layout+Variant
 * → fill slots → apply ColorTheme → Content/Design/Coherence → emit.
 *
 * Live generate (API key) goes through canvas-author + snap instead; this
 * path remains for tests and keyless builds.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.lockColorTheme = lockColorTheme;
exports.generateDeck = generateDeck;
exports.canvasStats = canvasStats;
exports.compileCanvasDeck = compileCanvasDeck;
exports.generateDeckPair = generateDeckPair;
const ids_js_1 = require("./ids.js");
const visual_system_js_1 = require("./visual-system.js");
const color_theme_js_1 = require("./color-theme.js");
const narrative_js_1 = require("./narrative.js");
const page_plan_js_1 = require("./page-plan.js");
const layouts_js_1 = require("./layouts.js");
const fill_js_1 = require("./fill.js");
const apply_theme_js_1 = require("./apply-theme.js");
const emit_js_1 = require("./emit.js");
const reflect_js_1 = require("./reflect.js");
const reflect_canvas_js_1 = require("./reflect-canvas.js");
const snap_js_1 = require("./snap.js");
function assertLockedPlans(pages) {
    for (const p of pages)
        (0, layouts_js_1.resolveLayout)(p.layout, p.variant);
    return pages;
}
function lockColorTheme(systemId, themeId) {
    const id = themeId ?? (0, color_theme_js_1.defaultColorThemeId)(systemId);
    if (!(0, ids_js_1.isColorThemeId)(id)) {
        throw new Error(`Unknown ColorTheme "${id}".`);
    }
    (0, ids_js_1.assertThemePairing)(systemId, id);
    return (0, color_theme_js_1.resolveColorTheme)(id, systemId);
}
function generateDeck(input) {
    const system = (0, visual_system_js_1.resolveVisualSystem)(input.systemId);
    const theme = lockColorTheme(input.systemId, input.themeId ?? ids_js_1.DEFAULT_COLOR_THEME[input.systemId]);
    const outline = (0, narrative_js_1.buildNarrativeOutline)(input);
    const locked = input.pages?.length ? assertLockedPlans(input.pages) : (0, page_plan_js_1.assignPagePlan)(outline);
    const plan = (0, page_plan_js_1.enforceSlotCaps)(locked);
    const filled = (0, fill_js_1.fillPlans)(plan, system);
    const painted = (0, apply_theme_js_1.applyColorTheme)(filled, theme);
    const reflect = (0, reflect_js_1.reflectPainted)(painted, system, theme);
    if (!input.skipReflectAssert)
        (0, reflect_js_1.assertReflect)(reflect);
    const presentation = (0, emit_js_1.emitPresentation)(painted, system, theme, outline.title);
    return { outline, system, theme, plan, painted, presentation, reflect };
}
function canvasStats(slides, drops, findings) {
    const kinds = {};
    const devices = {};
    let scrimPages = 0;
    let photoPages = 0;
    for (const s of slides) {
        if (s.background?.kind === "image") {
            photoPages += 1;
            if (s.background.scrim)
                scrimPages += 1;
        }
        for (const el of s.elements) {
            kinds[el.kind] = (kinds[el.kind] ?? 0) + 1;
            if (el.kind === "device" && el.device?.type)
                devices[el.device.type] = (devices[el.device.type] ?? 0) + 1;
        }
    }
    return {
        pages: slides.length,
        kinds,
        devices,
        scrimPages,
        photoPages,
        drops: drops.map((d) => `#${d.slideIdx} ${d.slot}: ${d.reason}`),
        findings,
    };
}
function compileCanvasDeck(input) {
    const snapped = (0, snap_js_1.snapCanvasReport)(input.slides, input.system, { briefs: input.briefs ?? [], ...(input.folio != null ? { folio: input.folio } : {}) });
    const painted = (0, apply_theme_js_1.applyColorTheme)(snapped.slides, input.theme);
    const reflect = (0, reflect_canvas_js_1.reflectCanvas)(painted, input.system, input.theme, input.briefs);
    for (const d of snapped.drops) {
        reflect.findings.push({ kind: "content", slideIdx: d.slideIdx, issue: `dropped ${d.slot}: ${d.reason}` });
    }
    reflect.passed = reflect.findings.length === 0;
    const presentation = (0, emit_js_1.emitPresentation)(painted, input.system, input.theme, input.title);
    const meta = (presentation.meta ?? {});
    const deckgen = {
        ...(meta.deckgen ?? {}),
        canvas: true,
        canvasStats: canvasStats(input.slides, snapped.drops, reflect.findings.length),
        // The deck-level page-number decision that was applied (undefined = the author's own numerals kept).
        ...(input.folio != null ? { folio: input.folio } : {}),
    };
    presentation.meta = { ...meta, deckgen };
    const outline = (0, narrative_js_1.buildNarrativeOutline)({ topic: input.title });
    return {
        outline,
        system: input.system,
        theme: input.theme,
        plan: [],
        painted,
        presentation,
        reflect,
    };
}
function generateDeckPair(input, themeA, themeB) {
    return {
        a: generateDeck({ ...input, themeId: themeA }),
        b: generateDeck({ ...input, themeId: themeB }),
    };
}
