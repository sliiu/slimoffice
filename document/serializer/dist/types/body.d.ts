import { type DocAlign, type DocBlock, type DocParagraph, type Document } from "@sliiu/document-core";
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
    /** Header and footer parts created for a story that had none, so the package can declare their type. */
    parts: string[];
}
export declare function applyDocumentEdits(xml: string, document: Document, relationships?: Relationship[]): DocumentEdits;
export declare function spacingXml(spacing: NonNullable<DocParagraph["spacing"]>): string;
export declare function indentXml(indent: NonNullable<DocParagraph["indent"]>): string;
/** A header or footer part, rewritten from the paragraphs the model holds. */
export declare function storyPartXml(root: "hdr" | "ftr", paragraphs: DocParagraph[]): string;
export type { DocAlign, DocBlock };
//# sourceMappingURL=body.d.ts.map