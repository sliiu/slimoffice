import { type DocAlign, type DocBlock, type Document } from "@sliiu/document-core";
/**
 * Puts the edited story back into word/document.xml.
 * Every section is rewritten from the model. Headers, footers, and every other part stay as opened.
 */
export interface Relationship {
    id: string;
    type: string;
    target: string;
    external: boolean;
}
export interface DocumentEdits {
    xml: string;
    /** Relationships the rewritten story points at that the original rels file did not have. */
    added: Relationship[];
}
export declare function applyDocumentEdits(xml: string, document: Document, relationships?: Relationship[]): DocumentEdits;
export type { DocAlign, DocBlock };
