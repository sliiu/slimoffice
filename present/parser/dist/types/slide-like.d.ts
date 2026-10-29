import type { ClrMap, HeaderFooter, Paint, Shape, BackgroundRef } from "@sliiu/present-core";
import { type XmlNode } from "./xml.js";
import { type RelMap } from "./parts.js";
import type { PptxArchive } from "./zip.js";
import { type ThemeData } from "./theme.js";
import type { MediaResolver } from "./media.js";
export interface SlideLikePart {
    path: string;
    rels: RelMap;
    shapes: Shape[];
    background?: Paint;
    bgRef?: BackgroundRef;
    xml?: XmlNode;
    rootEl?: XmlNode;
    cSld?: XmlNode;
    rootAttrs?: {
        type?: string;
        preserve?: boolean;
        matchingName?: string;
        show?: boolean;
        showMasterSp?: boolean;
        showMasterPhAnim?: boolean;
    };
    hf?: HeaderFooter;
    /** 该 part 生效的槽位映射：master 自带 clrMap / slide-layout 的 overrideClrMapping / 继承。 */
    clrMap?: ClrMap;
    /** 仅当该 part 显式写了 `<p:clrMapOvr><a:overrideClrMapping …/>` 时存在。 */
    clrMapOvr?: ClrMap;
}
export declare function parseSlideLikePart(archive: PptxArchive, path: string, baseTheme: ThemeData | undefined, media: MediaResolver, rootElementName: "sld" | "sldLayout" | "sldMaster" | "notesMaster" | "handoutMaster", embeddedFontFamilies?: string[], tableStyleMap?: import("./table-styles.js").TableStyleMap, inheritedClrMap?: ClrMap, resolveSlideNumber?: (partPath: string) => number | undefined): SlideLikePart | undefined;
export declare function followFirstRelByType(rels: RelMap, typeSuffix: string): string | undefined;
