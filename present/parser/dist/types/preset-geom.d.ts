import type { Rect } from "@sliiu/present-core";
import { type FillMod, type ResolvedAdjustHandle } from "./cust-geom.js";
export type { FillMod };
export interface PresetSubPath {
    d: string;
    fillMod: FillMod;
    stroke: boolean;
}
export interface PresetResult {
    kind: "rect" | "ellipse" | "path" | "polygon" | "line" | "multiPath";
    rx?: number;
    ry?: number;
    d?: string;
    points?: Array<[number, number]>;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    paths?: PresetSubPath[];
}
export declare function pathHasSubPaths(d: string): boolean;
export declare function presetToShape(name: string, bbox: Rect, adj?: Record<string, number>): PresetResult;
export declare function officialPresetAdjDefaults(name: string): Record<string, number> | undefined;
export declare function listOfficialAdjustHandles(name: string, bbox: Rect, adj?: Record<string, number>): ResolvedAdjustHandle[];
export declare function dragOfficialAdjustHandle(name: string, bbox: Rect, adj: Record<string, number>, handleIndex: number, localX: number, localY: number): Record<string, number>;
