import type { SlideTransition } from "@sliiu/present-core";
import type { TransitionFactory } from "./types.js";
export declare function getTransition(kind: string): TransitionFactory | undefined;
export declare function listTransitions(): string[];
export declare function registerTransition(kind: string, fn: TransitionFactory): void;
export declare function runTransition(ghost: HTMLElement, stage: HTMLElement, transition: SlideTransition): Promise<void>;
