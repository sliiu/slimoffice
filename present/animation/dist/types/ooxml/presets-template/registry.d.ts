import type { PresetClass } from "../types.js";
import type { PresetRegistry, PresetTemplate } from "./types.js";
export declare function registerPresetTemplate(classKey: keyof PresetRegistry, template: PresetTemplate): void;
export declare function findPresetTemplate(presetClass: PresetClass, presetID: number): PresetTemplate | undefined;
export declare function hasPresetTemplate(presetClass: PresetClass, presetID: number): boolean;
export declare function listPresetTemplates(classKey: keyof PresetRegistry): PresetTemplate[];
