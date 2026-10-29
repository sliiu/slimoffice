import type { Rect } from "@sliiu/present-core";
import { type XmlNode } from "./xml.js";
export type FillMod = "norm" | "lighten" | "lightenLess" | "darken" | "darkenLess" | "none";
export interface SubPath {
    d: string;
    fillMod: FillMod;
    stroke: boolean;
}
export interface CustGeomResult {
    d: string;
    paths?: SubPath[];
    ahPositions?: Array<{
        x: number;
        y: number;
    }>;
    cxnPoints?: Array<{
        x: number;
        y: number;
        ang?: number;
    }>;
}
export declare function parseCustGeom(custGeom: XmlNode, bbox: Rect): string;
export declare function parseCustGeomFull(custGeom: XmlNode, bbox: Rect): CustGeomResult;
export declare function createGuides(w?: number, h?: number): Map<string, number>;
export declare function evalFmla(fmla: string, guides: Map<string, number>): number;
export declare function resolveVar(token: string, guides: Map<string, number>): number;
export type PresetCmdKind = "moveTo" | "lnTo" | "cubicBezTo" | "quadBezTo" | "arcTo" | "close";
export interface PresetCmd {
    kind: PresetCmdKind;
    x?: string;
    y?: string;
    x1?: string;
    y1?: string;
    x2?: string;
    y2?: string;
    x3?: string;
    y3?: string;
    wR?: string;
    hR?: string;
    stAng?: string;
    swAng?: string;
}
export interface PresetPath {
    w?: number;
    h?: number;
    commands: PresetCmd[];
    stroke?: boolean;
    fill?: "none" | "norm" | "lighten" | "lightenLess" | "darken" | "darkenLess";
}
export interface PresetGd {
    name: string;
    formula: string;
}
export interface PresetTxRect {
    l: string;
    t: string;
    r: string;
    b: string;
}
/** ECMA-376 §20.1.9.3 ahXY / §20.1.9.2 ahPolar — 预设几何的黄色调整手柄。 */
export interface PresetAh {
    kind: "xy" | "polar";
    posX: string;
    posY: string;
    gdRefX?: string;
    gdRefY?: string;
    minX?: string;
    maxX?: string;
    minY?: string;
    maxY?: string;
    gdRefR?: string;
    gdRefAng?: string;
    minR?: string;
    maxR?: string;
    minAng?: string;
    maxAng?: string;
}
export interface ResolvedAdjustHandle {
    x: number;
    y: number;
    def: PresetAh;
}
export interface PresetDef {
    name: string;
    avLst?: Record<string, number>;
    gdLst?: PresetGd[];
    pathLst: PresetPath[];
    ahLst?: PresetAh[];
    rect?: PresetTxRect;
}
export declare function evalPresetDef(def: PresetDef, bbox: Rect, adjOverrides?: Record<string, number>): CustGeomResult;
export declare function evalPresetAdjustHandles(def: PresetDef, bbox: Rect, adjOverrides?: Record<string, number>): ResolvedAdjustHandle[];
/**
 * 把调整手柄拖到局部坐标 (localX, localY)（相对 bbox 左上），反解对应 adj。
 * 对 ahXY 按 x/y 分别拟合 gdRef；对 ahPolar 按半径 / 角度拟合。
 */
export declare function adjFromAdjustHandleDrag(def: PresetDef, bbox: Rect, adj: Record<string, number>, handleIndex: number, localX: number, localY: number): Record<string, number>;
export declare function evalPresetTextRect(def: PresetDef, bbox: Rect, adjOverrides?: Record<string, number>): Rect | undefined;
