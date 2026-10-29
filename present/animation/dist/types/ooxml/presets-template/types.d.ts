import type { TimeNode } from "../types.js";
export interface PresetTemplate {
    ids: number[];
    name: string;
    supportsSubtype?: boolean;
    template: TimeNode;
    _subtypes?: Record<number, TimeNode>;
}
export interface PresetRegistry {
    entr: PresetTemplate[];
    exit: PresetTemplate[];
    emph: PresetTemplate[];
    path: PresetTemplate[];
}
export interface PresetExpandCtx {
    tgtSpid: string;
    pRg?: {
        st: number;
        end: number;
    };
    charRg?: {
        st: number;
        end: number;
    };
    presetSubtype?: number;
    durMs?: number;
    delayMs?: number;
}
