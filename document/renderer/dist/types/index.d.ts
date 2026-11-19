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
    /** Which header of the section this page shows, so an edit lands in the right one. */
    headerKind: StoryKind;
    footerKind: StoryKind;
    /** A border around the page, #rrggbb. */
    border?: string;
    /** Text direction for the section this page belongs to. */
    direction?: "lr" | "tb" | "rl";
    /** The section numbers its lines. */
    lineNumbers?: boolean;
    blocks: DocBlock[];
}
export type StoryKind = "default" | "first" | "even";
/**
 * Breaks each section into pages. A table splits between rows when it is taller than the page.
 * A section that starts continuously continues on the page the previous section left, instead of forcing a new one.
 */
export declare function paginate(document: Document): DocPage[];
//# sourceMappingURL=index.d.ts.map