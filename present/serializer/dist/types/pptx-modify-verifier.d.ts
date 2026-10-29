import type { Presentation } from "@sliiu/present-core";
import type { RoundTripOptions } from "./pptx-roundtrip.js";
type MutableArchive = {
    files: Map<string, Uint8Array>;
};
/** ECMA-376 §19.2.1.23 — align `<p:modifyVerifier>` with `pres.modifyVerifier`. */
export declare function patchModifyVerifier(pres: Presentation, archive: MutableArchive, opts: RoundTripOptions): void;
export {};
