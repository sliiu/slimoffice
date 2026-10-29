import type { PathShape, Shape } from "@sliiu/present-core";
import { type ShapeCtx } from "./pptx-shapes.js";
export declare const INK_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml";
export declare const INK_CONTENT_TYPE = "application/inkml+xml";
export type InkRel = {
    relId: string;
    idx: number;
};
export declare function isInkPath(s: Shape): s is PathShape;
export declare function inkPartPath(idx: number): string;
export declare function inkSlideRelsXml(items: Array<{
    idx: number;
    relId: string;
}>): string;
export declare function inkContentTypeRows(idx: number): Array<{
    part: string;
    ct: string;
}>;
/** SVG path `M/L` 折线 → 点列（Draw 笔迹只写折线）。 */
export declare function svgPathToPoints(d: string): Array<[number, number]>;
export declare function buildInkMlXml(s: PathShape): string;
export declare function inkContentPartToXml(s: PathShape, rel: InkRel, ctx: ShapeCtx): string;
