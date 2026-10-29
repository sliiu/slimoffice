/**
 * Offline / no-key deckgen pipeline:
 * narrative outline → lock VisualSystem → assign Layout+Variant
 * → fill slots → apply ColorTheme → Content/Design/Coherence → emit.
 *
 * Live generate (API key) goes through canvas-author + snap instead; this
 * path remains for tests and keyless builds.
 */
import { DEFAULT_COLOR_THEME, assertThemePairing, isColorThemeId, } from "./ids.js";
import { resolveVisualSystem } from "./visual-system.js";
import { defaultColorThemeId, resolveColorTheme } from "./color-theme.js";
import { buildNarrativeOutline } from "./narrative.js";
import { assignPagePlan, enforceSlotCaps } from "./page-plan.js";
import { resolveLayout } from "./layouts.js";
import { fillPlans } from "./fill.js";
import { applyColorTheme } from "./apply-theme.js";
import { emitPresentation } from "./emit.js";
import { assertReflect, reflectPainted } from "./reflect.js";
import { reflectCanvas } from "./reflect-canvas.js";
import { snapCanvasReport } from "./snap.js";
function assertLockedPlans(pages) {
    for (const p of pages)
        resolveLayout(p.layout, p.variant);
    return pages;
}
export function lockColorTheme(systemId, themeId) {
    const id = themeId ?? defaultColorThemeId(systemId);
    if (!isColorThemeId(id)) {
        throw new Error(`Unknown ColorTheme "${id}".`);
    }
    assertThemePairing(systemId, id);
    return resolveColorTheme(id, systemId);
}
export function generateDeck(input) {
    const system = resolveVisualSystem(input.systemId);
    const theme = lockColorTheme(input.systemId, input.themeId ?? DEFAULT_COLOR_THEME[input.systemId]);
    const outline = buildNarrativeOutline(input);
    const locked = input.pages?.length ? assertLockedPlans(input.pages) : assignPagePlan(outline);
    const plan = enforceSlotCaps(locked);
    const filled = fillPlans(plan, system);
    const painted = applyColorTheme(filled, theme);
    const reflect = reflectPainted(painted, system, theme);
    if (!input.skipReflectAssert)
        assertReflect(reflect);
    const presentation = emitPresentation(painted, system, theme, outline.title);
    return { outline, system, theme, plan, painted, presentation, reflect };
}
export function canvasStats(slides, drops, findings) {
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
export function compileCanvasDeck(input) {
    const snapped = snapCanvasReport(input.slides, input.system, { briefs: input.briefs ?? [], ...(input.folio != null ? { folio: input.folio } : {}) });
    const painted = applyColorTheme(snapped.slides, input.theme);
    const reflect = reflectCanvas(painted, input.system, input.theme, input.briefs);
    for (const d of snapped.drops) {
        reflect.findings.push({ kind: "content", slideIdx: d.slideIdx, issue: `dropped ${d.slot}: ${d.reason}` });
    }
    reflect.passed = reflect.findings.length === 0;
    const presentation = emitPresentation(painted, input.system, input.theme, input.title);
    const meta = (presentation.meta ?? {});
    const deckgen = {
        ...(meta.deckgen ?? {}),
        canvas: true,
        canvasStats: canvasStats(input.slides, snapped.drops, reflect.findings.length),
        // The deck-level page-number decision that was applied (undefined = the author's own numerals kept).
        ...(input.folio != null ? { folio: input.folio } : {}),
    };
    presentation.meta = { ...meta, deckgen };
    const outline = buildNarrativeOutline({ topic: input.title });
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
export function generateDeckPair(input, themeA, themeB) {
    return {
        a: generateDeck({ ...input, themeId: themeA }),
        b: generateDeck({ ...input, themeId: themeB }),
    };
}
