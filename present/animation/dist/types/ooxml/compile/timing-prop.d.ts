import type { CTn } from "../types.js";
export declare function resolveHold(cTn: CTn, ancestorFill?: string): boolean;
export declare function resolveIterations(cTn: CTn, durationSec: number): number;
export declare function resolveSpdRatio(spd: string | undefined): number;
/** cTn@spd 为负时，这一段从末态播回起点。命名速度没有负号。 */
export declare function spdReverses(spd: string | undefined): boolean;
/** 反向时 t=0 落在时长末尾，t=duration 落在起点。 */
export declare function reversedLocalTime(t: number, duration: number, reverse: boolean): number;
export declare function parseTmFilter(s: string | undefined): import("../../types.js").EasingFn | undefined;
