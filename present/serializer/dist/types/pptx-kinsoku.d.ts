import type { Presentation } from "@sliiu/present-core";
import type { RoundTripOptions } from "./pptx-roundtrip.js";
type MutableArchive = {
    files: Map<string, Uint8Array>;
};
/** ECMA-376 §19.2.1.20 — align `<p:kinsoku>` on presentation.xml with `pres.kinsoku`. */
export declare function patchKinsoku(pres: Presentation, archive: MutableArchive, opts: RoundTripOptions): void;
export {};
