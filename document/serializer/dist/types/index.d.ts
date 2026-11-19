import { type Document } from "@sliiu/document-core";
export { blankDocument } from "./blank.js";
/**
 * Writes the document. An edited story replaces word/document.xml, one section at a time;
 * every other original part goes back unchanged, plus a relationship for each new link.
 */
export declare function writeDocx(document: Document): Uint8Array;
//# sourceMappingURL=index.d.ts.map