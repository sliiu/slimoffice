import type { Paint, ShadowEffect, ShapeEffect, Stroke } from "@sliiu/present-core";
import { type XmlNode } from "./xml.js";
import { type ThemeData } from "./theme.js";
import type { RelMap } from "./parts.js";
export interface FillCtx {
    theme?: ThemeData;
    rels?: RelMap;
    resolveImage?: (relPath: string) => string | undefined;
}
export declare function parseFill(spPr: XmlNode | undefined, ctx: FillCtx): Paint | undefined;
export declare function resolveBgRef(node: XmlNode, ctx: FillCtx): Paint | undefined;
export declare function resolveFillRef(idx: number, ctx: FillCtx, phClrHex?: string): Paint | undefined;
export declare function resolveLnRef(idx: number, ctx: FillCtx, phClrHex?: string): Stroke | undefined;
export declare function resolveEffectRef(idx: number, ctx: FillCtx, phClrHex?: string): ShapeEffect[];
export declare function parseColorAdjust(blipEl: XmlNode): import("@sliiu/present-core").ImageColorAdjust | undefined;
export declare function resolveShapeStroke(spPr: XmlNode | undefined, ctx: FillCtx, baseStroke: Stroke | undefined): Stroke | undefined;
export declare function parseStroke(spPr: XmlNode | undefined, ctx: FillCtx): Stroke | undefined;
export declare function parseEffectLst(spPr: XmlNode | undefined, ctx: FillCtx): ShadowEffect | undefined;
export declare function parseEffectListWithPresence(spPr: XmlNode | undefined, ctx: FillCtx): ShapeEffect[] | undefined;
export declare function parseEffectListFull(spPr: XmlNode | undefined, ctx: FillCtx): ShapeEffect[];
export declare function parseEffectDag(spPr: XmlNode | undefined, ctx: FillCtx): ShapeEffect[];
export declare function modulateColor(hex: string, mod: "lighten" | "lightenLess" | "darken" | "darkenLess"): string;
export declare function modulatePaint(paint: Paint | undefined, mod: "norm" | "lighten" | "lightenLess" | "darken" | "darkenLess" | "none"): Paint | undefined;
