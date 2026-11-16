import type { Document } from "@sliiu/document-core";
/** Writes the original parts back. Nothing is rebuilt, so an unread part stays byte for byte. */
export declare function writeDocx(document: Document): Uint8Array;
