export type DocAlign = "left" | "center" | "right" | "both";
export type DocUnderline = "single" | "double" | "dotted" | "dash" | "wave";
export type DocBreak = "page" | "column" | "line";
export interface DocRun {
    text: string;
    bold?: boolean;
    italic?: boolean;
    underline?: DocUnderline;
    strike?: boolean;
    /** "superscript" or "subscript". */
    vertAlign?: "superscript" | "subscript";
    /** #rrggbb highlight behind the run. */
    highlight?: string;
    /** CSS pixels. */
    fontSize?: number;
    /** Font family name from rFonts. */
    font?: string;
    /** #rrggbb. */
    color?: string;
    /** Relationship id of an embedded picture. */
    image?: string;
    /** Decoded picture bytes, filled in while parsing so the view can paint it. */
    imageBytes?: Uint8Array;
    /** MIME type guessed from the picture part. */
    imageType?: string;
    /** A break that sits before this run's text. */
    breakBefore?: DocBreak;
    /** w:tab before this run's text. */
    tabBefore?: boolean;
    /** External or internal target of a hyperlink wrapping this run. */
    link?: string;
    /** Bookmark name that starts at this run. */
    bookmark?: string;
}
export interface DocNumbering {
    /** numbering.xml numId. */
    id: string;
    /** Level, zero based. */
    level: number;
}
export interface DocSpacing {
    /** Twips before the paragraph. */
    before?: number;
    /** Twips after the paragraph. */
    after?: number;
    /** Line spacing in twips when rule is "exact" or "atLeast"; a 240-based multiple when "auto". */
    line?: number;
    lineRule?: "auto" | "exact" | "atLeast";
}
export interface DocIndent {
    /** Twips. */
    left?: number;
    right?: number;
    firstLine?: number;
    hanging?: number;
}
export interface DocParagraph {
    style?: string;
    align?: DocAlign;
    numbering?: DocNumbering;
    spacing?: DocSpacing;
    indent?: DocIndent;
    /** Paragraph shading, #rrggbb. */
    shading?: string;
    /** A page break sits before this paragraph. */
    pageBreakBefore?: boolean;
    runs: DocRun[];
}
export interface DocCell {
    paragraphs: DocParagraph[];
    /** How many columns this cell covers. */
    span?: number;
    /** "restart" begins a vertical merge, "continue" extends the one above. */
    vMerge?: "restart" | "continue";
    shading?: string;
}
export interface DocTable {
    rows: DocCell[][];
}
export type DocBlock = DocParagraph | DocTable;
export declare function isDocTable(block: DocBlock): block is DocTable;
export interface DocPageSetup {
    /** Twips. Defaults are US Letter with one-inch margins. */
    width: number;
    height: number;
    landscape?: boolean;
    margin: {
        top: number;
        bottom: number;
        left: number;
        right: number;
    };
    /** Column count. 1 means a single column. */
    columns?: number;
    /** Page background from settings or the background element, #rrggbb. */
    background?: string;
}
export interface DocSection {
    page: DocPageSetup;
    header: DocParagraph[];
    footer: DocParagraph[];
    blocks: DocBlock[];
}
export interface Document {
    sections: DocSection[];
    /** numbering.xml resolved by numId, so a list can paint its marker. */
    numbering?: DocNumberingTable;
    /** Original package parts, keyed by path. Writing puts these back unchanged. */
    source?: Map<string, Uint8Array>;
    /** Set when the story changed. Until then, writing puts the original bytes back. */
    edited?: boolean;
}
export declare const DEFAULT_PAGE: DocPageSetup;
/** One level of a numbering definition, enough to paint a bullet or a number. */
export interface DocNumberingLevel {
    /** "%1." style text. Empty means a bullet. */
    text: string;
    /** Bullet glyph when there is no number text. */
    bullet?: string;
}
/** Resolved numbering, keyed by numId. Filled in by the parser from numbering.xml. */
export type DocNumberingTable = Record<string, DocNumberingLevel[]>;
/** The marker a list paragraph shows, taken from its numbering definition. */
export declare function listMarker(numbering: DocNumberingTable | undefined, paragraph: DocParagraph): string;
