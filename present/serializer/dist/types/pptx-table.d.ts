import type { GroupShape, Shape } from "@sliiu/present-core";
import { type ShapeCtx } from "./pptx-shapes.js";
/** 仅 `<a:tbl>…</a:tbl>` 片段（round-trip patch 用）。 */
export declare function tableTblXml(g: GroupShape, ctx: ShapeCtx): string;
/** tableMeta group → `<p:graphicFrame>` + `<a:tbl>`（from-scratch / 新增 shape）。 */
export declare function tableGroupToXml(g: Extract<Shape, {
    kind: "group";
}>, ctx: ShapeCtx): string;
