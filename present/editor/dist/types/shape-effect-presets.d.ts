import type { ShapeEffectsPatch } from "./commands.js";
import type { MessageKey } from "./i18n.js";
export interface ShapeEffectPreset {
    id: string;
    labelKey: MessageKey;
    /** Short tag for ribbon swatch / icon hint */
    swatch: string;
    patch: ShapeEffectsPatch;
}
/** Format tab / Inspector → shape effect shortcuts (full editor via AI tools). */
export declare const SHAPE_EFFECT_PRESETS: ShapeEffectPreset[];
