import { type Rect, type Shape, type TableMeta } from "@sliiu/present-core";
import { type XmlNode } from "./xml.js";
import type { FillCtx } from "./fill.js";
import { type TextCtx } from "./text.js";
import type { TableStyleMap } from "./table-styles.js";
export interface TableCtx extends FillCtx, TextCtx {
    tableStyleMap?: TableStyleMap;
}
export declare function parseTable(tbl: XmlNode, bbox: Rect, ctx: TableCtx): {
    children: Shape[];
    meta: TableMeta;
};
