import type { Paint, Stroke } from "@sliiu/present-core";
import type { MessageKey } from "./i18n.js";
export interface QuickStylePreset {
    id: string;
    labelKey: MessageKey;
    fill: Paint;
    stroke?: Stroke;
}
/** Home → Drawing quick style presets (fill + outline combos). */
export declare const QUICK_STYLE_PRESETS: QuickStylePreset[];
