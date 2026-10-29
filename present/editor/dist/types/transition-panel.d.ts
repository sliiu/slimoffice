import type { CommandStack, Presentation } from "@sliiu/present-core";
import { type MessageKey } from "./i18n.js";
export interface TransitionPatch {
    kind: string;
    duration?: number;
    params?: Record<string, unknown>;
}
export interface TransitionOption {
    kind: string;
    labelKey: MessageKey;
    category: "subtle" | "exciting" | "dynamic";
    dirs?: Array<"left" | "right" | "up" | "down" | "topLeft" | "topRight" | "bottomLeft" | "bottomRight" | "horz" | "vert" | "in" | "out" | "vertOut" | "vertIn" | "horzOut" | "horzIn">;
    patterns?: string[];
    pickThruBlk?: boolean;
    dirToward?: boolean;
    dirParam?: "dir" | "orient";
}
export declare const TRANSITION_OPTIONS: TransitionOption[];
export declare function transitionKindLabel(o: TransitionOption): string;
export declare function dirLabel(d: string, toward?: boolean): string;
export interface TransitionPanelOpts {
    pres: Presentation;
    stack: CommandStack;
    currentSlide(): number;
    preview?: () => void;
}
export interface TransitionPanelHandle {
    el: HTMLElement;
    destroy(): void;
    refresh(): void;
}
export declare function mountTransitionPanel(parent: HTMLElement, opts: TransitionPanelOpts): TransitionPanelHandle;
