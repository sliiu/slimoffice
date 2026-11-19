import { type DocBlock, type DocPageSetup, type DocParagraph, type Document } from "@sliiu/document-core";
export interface DocPage {
    width: number;
    height: number;
    margin: DocPageSetup["margin"];
    /** Page background, #rrggbb, when the document sets one. */
    background?: string;
    columns: number;
    landscape: boolean;
    header: DocParagraph[];
    footer: DocParagraph[];
    blocks: DocBlock[];
}
/** Breaks each section into pages. A table stays on one page. */
export declare function paginate(document: Document): DocPage[];
