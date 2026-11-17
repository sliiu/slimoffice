import type { Document } from "@sliiu/document-core";
import { strFromU8, strToU8, zipSync } from "fflate";
import { applyDocumentEdits } from "./body";

export { blankDocument } from "./blank";

/**
 * Writes the document. Edited paragraph and table text replaces word/document.xml;
 * every other original part goes back unchanged.
 */
export function writeDocx(document: Document): Uint8Array {
  if (!document.source || document.source.size === 0) {
    throw new Error("This document has no original parts to write back");
  }
  const files: Record<string, Uint8Array> = {};
  for (const [path, bytes] of document.source) files[path] = bytes;
  const story = document.source.get("word/document.xml");
  if (document.edited && story) files["word/document.xml"] = strToU8(applyDocumentEdits(strFromU8(story), document));
  return zipSync(files);
}
