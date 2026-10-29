import type { EffectClass } from "./store.js";
export interface PresetItem {
    classKey: EffectClass;
    presetId: number;
    presetIds: number[];
    name: string;
    supportsSubtype: boolean;
}
export declare function listPresetsByClass(classKey: "entr" | "emph" | "exit" | "path"): PresetItem[];
export declare function mountPresetPicker(doc: Document, onPick: (item: PresetItem) => void): {
    el: HTMLElement;
    destroy: () => void;
};
