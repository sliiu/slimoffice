import { ooxml } from "@sliiu/present-animation";
import { type XmlNode } from "./xml.js";
import type { RelMap } from "./parts.js";
export declare function parseTimingOoxml(timingEl: XmlNode | undefined): ooxml.OoxmlTiming | undefined;
export type TimingMediaCtx = {
    rels?: RelMap;
    resolveMedia?: (path: string) => string | undefined;
};
/** 把 `<p:sndTgt r:embed>` 解成可重登记的媒体 src，供 from-scratch / 放映使用。 */
export declare function resolveTimingSoundTargets(timing: ooxml.OoxmlTiming, ctx: TimingMediaCtx): void;
