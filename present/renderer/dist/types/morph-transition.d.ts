import type { Scene } from "./scene-node.js";
export interface MorphTransitionMount {
    ghost: HTMLElement;
    target: HTMLElement;
    cleanup(): void;
}
/**
 * Mount SVG shape layers for morph (FLIP) when the live stage lacks per-shape DOM
 * ids (canvas / hybrid bitmap segments). Pure-SVG stages only need the ghost overlay.
 */
export declare function mountMorphTransitionLayers(stageWrap: HTMLElement, stage: HTMLElement, prevScene: Scene, curScene: Scene, opts?: {
    ghostZIndex?: number;
    stageZIndex?: number;
    chromeBg?: string;
}): MorphTransitionMount;
