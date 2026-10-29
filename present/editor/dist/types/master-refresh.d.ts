import type { Presentation } from "@sliiu/present-core";
import type { EditorContext } from "./editor.js";
/** 母版 / 版式编辑后，刷新引用该 master（及可选 layout）的全部 slide 占位符继承。 */
export declare function recomputeSlidesForMasterEdit(pres: Presentation, ctx: Extract<EditorContext, {
    kind: "master";
}>): number;
