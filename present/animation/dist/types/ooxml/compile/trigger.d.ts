import type { Cond, TimeNode } from "../types.js";
import type { StepTrigger } from "./types.js";
export declare const CLICK_LIKE_EVTS: Set<string>;
export declare function hasOnClick(conds: Cond[] | undefined): boolean;
export declare function shapeClickTarget(conds: Cond[] | undefined): string | undefined;
export declare function triggerOf(node: TimeNode): StepTrigger;
export declare function containsClick(n: TimeNode): boolean;
