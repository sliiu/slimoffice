import type { OoxmlTiming, TimeNode } from "../types.js";
import type { TnTimeEntry } from "./types.js";
export declare function buildTnIndex(timing: OoxmlTiming): Map<string, TnTimeEntry>;
export declare function walkTn(node: TimeNode, base: number, out: Map<string, TnTimeEntry>, refIndex?: Map<string, TnTimeEntry>): TnTimeEntry;
