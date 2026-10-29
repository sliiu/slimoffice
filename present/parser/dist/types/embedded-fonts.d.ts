import type { EmbeddedFont } from "@sliiu/present-core";
import { type XmlNode } from "./xml.js";
import type { RelMap } from "./parts.js";
import type { PptxArchive } from "./zip.js";
import type { MediaResolver } from "./media.js";
export declare function parseEmbeddedFonts(presEl: XmlNode | undefined, presRels: RelMap, archive: PptxArchive, media: MediaResolver): EmbeddedFont[];
