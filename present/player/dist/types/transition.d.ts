import type { SlideTransition } from "@sliiu/present-core";
export declare function clampTransitionForPlan(transition: SlideTransition | undefined, advancedAllowed: boolean): SlideTransition | undefined;
export declare function snapshotStage(stage: HTMLElement): HTMLElement;
export declare function runTransition(ghost: HTMLElement, stage: HTMLElement, transition: SlideTransition): Promise<void>;
