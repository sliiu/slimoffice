import type { ViewGuides } from "@sliiu/present-core";
import { type RelMap } from "./parts.js";
import type { PptxArchive } from "./zip.js";
/** ECMA-376 §19.2.2 `ppt/viewProps.xml` — 幻灯片/备注视图参考线与网格。 */
export declare function parseViewGuides(archive: PptxArchive, presRels: RelMap): {
    viewGuides?: ViewGuides;
    viewPropsPartPath?: string;
};
