import { DEFAULT_DIRECTION, DIRECTION_VECTORS, PRESET_MOTION_PATHS, PRESET_TABLE, type PresetClassKey } from "./presets.data.js";
import type { AtomTrack } from "./compile.js";
import type { PresetClass, SlideEnv, TargetBox } from "./types.js";
export interface PresetCompileCtx extends SlideEnv {
    duration: number;
    bbox: TargetBox;
}
export interface PresetSummary {
    classKey: PresetClassKey;
    id: number;
    ids: number[];
    name: string;
    supportsSubtype?: boolean;
}
export declare function listPresets(classKey: PresetClassKey): PresetSummary[];
export declare function compilePresetTracks(presetClass: PresetClass | undefined, presetId: number | undefined, presetSubtype: number | undefined, ctx: PresetCompileCtx): AtomTrack[];
export { DIRECTION_VECTORS, DEFAULT_DIRECTION, PRESET_MOTION_PATHS, PRESET_TABLE };
export type { PresetClassKey };
