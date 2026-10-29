import type { Paint } from "@sliiu/present-core";
import type { MessageKey } from "./i18n.js";
export interface FillGradientPreset {
    id: string;
    labelKey: MessageKey;
    /** CSS gradient for ribbon swatch preview */
    preview: string;
    fill: Paint;
}
/** Format tab → Shape Fill gradient shortcuts (Inspector still has full editor). */
export declare const FILL_GRADIENT_PRESETS: FillGradientPreset[];
