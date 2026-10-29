import type { Presentation } from "@sliiu/present-core";
import type { RoundTripOptions } from "./pptx-roundtrip.js";
type MutableArchive = {
    files: Map<string, Uint8Array>;
};
/** ECMA-376 §15.2.13 — align embeddedFontLst + ppt/fonts/*.fntdata when `pres.fonts` changed. */
export declare function patchEmbeddedFonts(pres: Presentation, archive: MutableArchive, opts: RoundTripOptions): void;
export {};
