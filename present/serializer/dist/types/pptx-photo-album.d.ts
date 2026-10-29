import type { Presentation } from "@sliiu/present-core";
import type { RoundTripOptions } from "./pptx-roundtrip.js";
type MutableArchive = {
    files: Map<string, Uint8Array>;
};
/** ECMA-376 §19.2.1.27 — align `<p:photoAlbum>` on presentation.xml with `pres.photoAlbum`. */
export declare function patchPhotoAlbum(pres: Presentation, archive: MutableArchive, opts: RoundTripOptions): void;
export {};
