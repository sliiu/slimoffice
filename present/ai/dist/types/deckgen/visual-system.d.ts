/**
 * L1 VisualSystem — typography, grid, alignment, bans.
 * No colors. ColorTheme is applied later and must not change these rules.
 *
 * Type stacks:
 *   editorial = serif display (Playfair / Noto Serif SC) + Noto Sans SC + IBM Plex Mono
 *   swiss     = International Typographic Style (Inter ExtraLight + JetBrains Mono)
 *
 * Canvas-only systems (live author path, not in the locked fill catalog):
 *   dark-tech · soft-rounded · photo-editorial · data-dense · brutalist
 * Each one is a type voice + grid + radius / shadow / glow policy. No hex.
 *
 * User-defined systems: an enabled skill may carry a ```visual-system JSON block
 * (see custom-system.ts). Those are registered here for the session and join the
 * author whitelist next to the builtins; `resolveVisualSystem` / `listCanvasSystems`
 * see both.
 */
import { type BuiltinCanvasSystemId, type CanvasSystemId, type PaintRole } from "./ids.js";
import type { TextTreatment } from "./ir.js";
export interface TypeScale {
    /** Latin / default display size. */
    display: number;
    /** CJK display override (swiss: 56). Falls back to `display`. */
    displayCjk?: number;
    h1: number;
    h2: number;
    body: number;
    caption: number;
}
export interface VisualGrid {
    columns: number;
    gutter: number;
    /** Safe margin as a fraction of canvas (both axes). */
    margin: number;
}
export interface VisualBans {
    roundedCorners: boolean;
    shadows: boolean;
    gradients: boolean;
    /** When true, display-sized titles must not be center-aligned. */
    centeredDisplay: boolean;
}
export interface VisualFonts {
    display: string;
    body: string;
    mono: string;
}
export type TypeRole = "display" | "h1" | "h2" | "body" | "caption" | "kicker" | "index" | "numeral";
export interface TypeRoleStyle {
    fontWeight: number;
    fontFamily: string;
    lineHeight: number;
    letterSpacing?: number;
    caps?: "all";
}
/**
 * Type voice drives weight / tracking / line-height per role.
 *   serif       = editorial: 700 serif display, 400 sans body, mono kicker
 *   grotesk     = swiss: the bigger the lighter (200 display), mono index
 *   humanist    = friendly sans: 700 display, 600 heads, 400 body
 *   neo-grotesk = product keynote: 600 display with tight tracking, 500 heads,
 *                 400 body, sentence-case kicker in the display face (no mono, no caps)
 */
export type TypeVoice = "serif" | "grotesk" | "humanist" | "neo-grotesk";
export declare const TYPE_VOICES: readonly ["serif", "grotesk", "humanist", "neo-grotesk"];
/**
 * Canvas-path policy — how the live author and the device expanders may
 * dress surfaces on this system. Colors still come from the ColorTheme.
 */
export interface CanvasPolicy {
    /** Default corner radius for surfaces / cards / chips (0 = square). */
    radius: number;
    /** Floating objects may carry an outer shadow. */
    shadow: boolean;
    /** Display type / accent shapes may carry a soft glow. */
    glow: boolean;
    /** Expected paper tone. The seed palette follows it; authored hex may override. */
    tone: "light" | "dark";
    /** Hairline weight for rules and connectors. */
    ruleWidth: number;
    /**
     * Default art treatment for the display line on anchor pages (cover / section / close /
     * statement) when the author did not pick one. `none` = plain type is the look.
     */
    displayTreatment: TextTreatment | "none";
    /** One-line character for the author prompt (no hex). */
    character: string;
}
export interface VisualSystem {
    id: CanvasSystemId;
    name: string;
    voice: TypeVoice;
    typeScale: TypeScale;
    grid: VisualGrid;
    /** Title / body alignment. Systems in this whitelist are left-aligned. */
    alignment: {
        title: "start";
        body: "start";
    };
    density: "airy" | "tight";
    bans: VisualBans;
    fonts: VisualFonts;
    canvas: CanvasPolicy;
}
export declare const CANVAS: {
    readonly width: 1280;
    readonly height: 720;
};
/** Below this, running copy is unreadable on a projected 1280×720 canvas (devices and the gate both use it). */
export declare const MIN_READABLE_PX = 13;
/** Text up to this many characters counts as a label and may sit at caption size. */
export declare const MAX_CAPTION_CHARS = 24;
/** Google Font families this system must load (Playfair/Inter/Noto/IBM Plex/JetBrains). */
export declare const DECKGEN_FONT_FAMILIES: Record<BuiltinCanvasSystemId, readonly string[]>;
export declare const VISUAL_SYSTEMS: Record<BuiltinCanvasSystemId, VisualSystem>;
/** A custom system as registered: the resolved VisualSystem plus what the builtin tables carry. */
export interface RegisteredVisualSystem {
    system: VisualSystem;
    /** Google Font families to load (only names `findFontPreset` knows are loaded). */
    fontFamilies: readonly string[];
    /** Seed palette when the author does not write hex; follows `canvas.tone`. */
    seedPalette?: Record<PaintRole, string>;
    /** Extra words `normalizeSystemId` may match ("apple", "keynote"). */
    aliases: readonly string[];
    /** Skill id that contributed this system (for UI / diagnostics). */
    skillId?: string;
}
/**
 * Replace the session's custom systems. Called whenever the enabled skill set is
 * (re)read — a disabled or removed skill takes its systems with it. Builtin ids
 * cannot be shadowed.
 */
export declare function registerCustomVisualSystems(entries: Iterable<RegisteredVisualSystem>): void;
export declare function getRegisteredVisualSystem(id: string): RegisteredVisualSystem | undefined;
export declare function listCustomVisualSystems(): RegisteredVisualSystem[];
export declare function resolveVisualSystem(id: string): VisualSystem;
/** Google Font families a system (builtin or custom) needs loaded. */
export declare function fontFamiliesForSystem(id: CanvasSystemId): readonly string[];
/**
 * Model / organizer output → a known system id, or undefined.
 * "Dark Tech" / "dark_tech" / "darktech" → "dark-tech"; "Apple Keynote" → "apple_keynote"
 * when such a custom system is registered (its `aliases` match too). Custom systems are
 * tried before the builtin partial-word guesses so "apple keynote" is not read as "editorial".
 */
export declare function normalizeSystemId(raw: unknown): string | undefined;
/** Builtin canvas systems followed by the session's custom systems. */
export declare function listCanvasSystems(): VisualSystem[];
export declare function displaySize(system: VisualSystem, text: string): number;
export declare function typeScaleValues(system: VisualSystem): number[];
/**
 * Locked type role → weight / face / tracking / line-height.
 * Editorial: 700 serif display, 400 sans body, mono kicker + caps.
 * Swiss: 越大越细 — display ExtraLight 200, body 300–400, labels 500, tracking -.04em.
 */
export declare function typeRole(sys: VisualSystem, role: TypeRole, fontSize: number, text?: string): TypeRoleStyle;
