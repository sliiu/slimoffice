import { type SlideTransition } from "@sliiu/present-core";
import type { RelMap } from "./parts.js";
import { type XmlNode } from "./xml.js";
export interface TransitionParseCtx {
    rels?: RelMap;
    resolveMedia?: (mediaPath: string) => string | undefined;
}
export declare function parseSlideTransition(rootEl: XmlNode | undefined, ctx?: TransitionParseCtx): SlideTransition | undefined;
