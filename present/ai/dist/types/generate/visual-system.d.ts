/**
 * Design P1 visual systems (wizard default A).
 * Locked palettes — no free color invent. Design-gate assert #4 matches these.
 */
export declare const VISUAL_SYSTEM_IDS: readonly ["A", "B"];
export type VisualSystemId = (typeof VISUAL_SYSTEM_IDS)[number];
export interface VisualSystemPalette {
    id: VisualSystemId;
    /** Primary canvas / page background. */
    bg: string[];
    /** Accent (champagne gold for A; single accent for B). */
    accent: string[];
    /** Title / major type colors. */
    title: string[];
    /** Body type colors. */
    body: string[];
}
/** A dark-launch: midnight + champagne + white titles */
export declare const VISUAL_SYSTEM_A: VisualSystemPalette;
/** B light-magazine: paper white/light gray + one accent + dark type */
export declare const VISUAL_SYSTEM_B: VisualSystemPalette;
export declare const VISUAL_SYSTEMS: Record<VisualSystemId, VisualSystemPalette>;
export declare function resolveVisualSystem(id: string | undefined | null): VisualSystemId;
export declare function visualSystemPalette(id: string | undefined | null): VisualSystemPalette;
/** Stamp solid slide backgrounds from the locked Design visual-system palette.
 *  Skip full-bleed structural slides (cover/hero/section/closing) and existing
 *  image backgrounds — P0 cover-visual requires image + dark overlay there. */
export declare function applyVisualSystemBackgrounds(slides: Array<{
    name?: string | null;
    background?: {
        kind: string;
        color?: string;
    } | null | undefined;
}>, system: string | undefined | null): void;
/**
 * Remap out-of-palette solid fills on non-text shapes to the locked visual-system
 * palette (Design visual-system gate). Mutates in place.
 */
export declare function ensureVisualSystemFills(slides: Array<{
    layers: Array<{
        shapes: Array<{
            visible?: boolean;
            kind?: string;
            fill?: {
                kind?: string;
                color?: string;
                alpha?: number;
            } | null;
            children?: unknown[];
        }>;
    }>;
}>, system: string | undefined | null): void;
