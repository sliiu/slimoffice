import type { Paint, Stroke } from "@sliiu/present-core";
import { type XmlNode } from "./xml.js";
import { type FillCtx } from "./fill.js";
import type { PptxArchive } from "./zip.js";
export type TableStyleRegion = "wholeTbl" | "band1H" | "band2H" | "band1V" | "band2V" | "firstRow" | "lastRow" | "firstCol" | "lastCol" | "nwCell" | "neCell" | "swCell" | "seCell";
export interface TableStylePart {
    fill?: Paint;
    textColor?: string;
    border?: {
        left?: Stroke;
        right?: Stroke;
        top?: Stroke;
        bottom?: Stroke;
        insideH?: Stroke;
        insideV?: Stroke;
    };
}
export interface TableStyleEntry {
    id: string;
    name?: string;
    parts: Partial<Record<TableStyleRegion, TableStylePart>>;
}
export interface TableStyleMap {
    default?: string;
    byId: Map<string, TableStyleEntry>;
}
export declare function loadTableStyles(archive: PptxArchive, partPath: string | undefined, ctx: FillCtx): TableStyleMap | undefined;
/** 解析 `<a:tblStyleLst>`（文档根或 lst 节点本身均可）。 */
export declare function parseTableStyleList(xml: XmlNode, ctx: FillCtx): TableStyleMap | undefined;
