import type { CommandStack, Presentation, Slide } from "@sliiu/present-core";
import type { Scene } from "@sliiu/present-renderer";
import { type Effect } from "./store.js";
export interface AnimTimelineOpts {
    pres: Presentation;
    stack: CommandStack;
    currentSlide(): number;
    selectShape?: (shapeId: string | undefined) => void;
    getScene?: () => Scene | null;
    setPlaybackMode?: (on: boolean) => void;
    onSelectEffect?: (id: string | null) => void;
}
export interface AnimTimelineHandle {
    el: HTMLElement;
    destroy(): void;
    refresh(): void;
    selectEffect(id: string | null): void;
}
export declare function computeEffectTimings(effs: Effect[], slide: Slide | undefined): Array<{
    start: number;
    end: number;
}>;
export declare function mountAnimTimeline(parent: HTMLElement, opts: AnimTimelineOpts): AnimTimelineHandle;
