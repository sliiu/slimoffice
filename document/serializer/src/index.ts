import type { Document } from "@sliiu/document-core";
import { zipSync } from "fflate";

/** Writes the original parts back. Nothing is rebuilt, so an unread part stays byte for byte. */
export function writeDocx(document: Document): Uint8Array {
  if (!document.source || document.source.size === 0) {
    throw new Error("This document has no original parts to write back");
  }
  const files: Record<string, Uint8Array> = {};
  for (const [path, bytes] of document.source) files[path] = bytes;
  return zipSync(files);
}
