/**
 * Offline / no-key deckgen pipeline:
 * narrative outline → lock VisualSystem → assign Layout+Variant
 * → fill slots → apply ColorTheme → Content/Design/Coherence → emit.
 *
 * Live generate (API key) goes through canvas-author + snap instead; this
 * path remains for tests and keyless builds.
 */
import type { Presentation } from "@sliiu/present-core";
import { type ColorThemeId, type VisualSystemId } from "./ids.js";
import { type VisualSystem } from "./visual-system.js";
import { type ColorTheme } from "./color-theme.js";
import { type NarrativeInput, type NarrativeOutline } from "./narrative.js";
import { type SlidePlan } from "./page-plan.js";
import { type PaintedSlide } from "./apply-theme.js";
import { type ReflectResult } from "./reflect.js";
import { type SnapDrop } from "./snap.js";
import type { FilledSlide } from "./ir.js";
import type { PageBrief } from "./brief.js";
export interface GenerateDeckInput extends NarrativeInput {
    systemId: VisualSystemId;
    /** Must pair with systemId. Defaults to editorial/ink or swiss/ikb. */
    themeId?: ColorThemeId;
    /**
     * Locked Layout+Variant pages from the wizard outline.
     * When set, skip narrative auto-assign and use these (whitelist re-asserted).
     */
    pages?: SlidePlan[];
    /** Product fill fallback: still emit if catalog reflect finds issues. */
    skipReflectAssert?: boolean;
}
export interface GenerateDeckResult {
    outline: NarrativeOutline;
    system: VisualSystem;
    theme: ColorTheme;
    plan: SlidePlan[];
    painted: PaintedSlide[];
    presentation: Presentation;
    reflect: ReflectResult;
}
export declare function lockColorTheme(systemId: VisualSystemId, themeId?: string): ColorTheme;
export declare function generateDeck(input: GenerateDeckInput): GenerateDeckResult;
/** What the author actually used — surfaced in meta so live smoke runs can measure vocabulary hit-rate. */
export interface CanvasStats {
    pages: number;
    /** Authored element kinds (pre-snap): text, device, icon, shape, diagram, … */
    kinds: Record<string, number>;
    /** device.type tally. */
    devices: Record<string, number>;
    /** Pages whose background is a photo with a scrim. */
    scrimPages: number;
    /** Pages carrying a photo background at all. */
    photoPages: number;
    drops: string[];
    findings: number;
}
export declare function canvasStats(slides: FilledSlide[], drops: SnapDrop[], findings: number): CanvasStats;
export declare function compileCanvasDeck(input: {
    system: VisualSystem;
    theme: ColorTheme;
    slides: FilledSlide[];
    title: string;
    /** Per-page Design Brief (same order as slides) — enables relationship / rhythm / carrier checks. */
    briefs?: Array<PageBrief | undefined>;
    /** Folio decision: true = every content page numbered, false = no page numerals; undefined = leave the author's. */
    folio?: boolean;
}): GenerateDeckResult;
export declare function generateDeckPair(input: Omit<GenerateDeckInput, "themeId">, themeA: ColorThemeId, themeB: ColorThemeId): {
    a: GenerateDeckResult;
    b: GenerateDeckResult;
};
