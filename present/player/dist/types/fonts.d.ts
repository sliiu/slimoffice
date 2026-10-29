import type { Presentation } from "@sliiu/present-core";
export declare function registerEmbeddedFonts(doc: Document, pres: Presentation): void;
/** Await embedded OOXML fonts before high-DPI raster export (PDF / PNG). */
export declare function loadEmbeddedFonts(doc: Document, pres: Presentation): Promise<void>;
