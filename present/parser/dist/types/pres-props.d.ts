import type { RelMap } from "./parts.js";
import type { PptxArchive } from "./zip.js";
import type { ShowProperties } from "@sliiu/present-core";
/** ECMA-376 §19.2.2 `ppt/presProps.xml` — 放映方式。 */
export declare function parseShowProperties(archive: PptxArchive, presRels: RelMap): {
    showPr?: ShowProperties;
    presPropsPartPath?: string;
};
