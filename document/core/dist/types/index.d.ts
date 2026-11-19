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
    /** Font family name from rFonts, the ascii face. */
    font?: string;
    /** The east-asian face from rFonts, used when the run holds CJK text. */
    fontEastAsia?: string;
    /** #rrggbb. */
    color?: string;
    /** Character style name from rStyle. */
    runStyle?: string;
    /** Shown in capitals. */
    caps?: boolean;
    /** Shown in small capitals. */
    smallCaps?: boolean;
    /** A double strikethrough. */
    doubleStrike?: boolean;
    /** Hidden text. It is kept and written back, but not shown. */
    hidden?: boolean;
    /** Emphasis mark under the run: dot, comma, circle, underDot. */
    emphasis?: string;
    /** Language tag from `lang`, such as "zh-CN". */
    lang?: string;
    /** Extra space between characters and the next, in twips, from `kern`. */
    kern?: number;
    /** Switches Word stores on the run and this model only keeps: outline, shadow, emboss, imprint, effect. */
    marks?: string[];
    /** Markup this model does not edit, kept so a rewrite puts it back: a border, shading, fit text, east-asian layout. */
    kept?: string[];
    /** Character scale in percent. 100 is unchanged. */
    scale?: number;
    /** Extra space between characters, in twips. */
    spacing?: number;
    /** Raise or lower the run, in half-points. Positive raises. */
    position?: number;
    /** Id of a comment anchored at this run. */
    comment?: string;
    /** Relationship id of an embedded picture. */
    image?: string;
    /** Decoded picture bytes, filled in while parsing so the view can paint it. */
    imageBytes?: Uint8Array;
    /** MIME type guessed from the picture part. */
    imageType?: string;
    /** Picture size in EMUs (914400 per inch), from the drawing extent. */
    imageWidth?: number;
    imageHeight?: number;
    /** How much of each edge is cropped away, in percent of the picture. */
    crop?: {
        left?: number;
        top?: number;
        right?: number;
        bottom?: number;
    };
    /** A break that sits before this run's text. */
    breakBefore?: DocBreak;
    /** w:tab before this run's text. */
    tabBefore?: boolean;
    /** External or internal target of a hyperlink wrapping this run. */
    link?: string;
    /** Bookmark name that starts at this run. */
    bookmark?: string;
    /** Markup kept as it was read, for a run the model does not edit (a symbol, a field, a footnote reference). */
    raw?: string;
    /** This run came from a tracked insertion. */
    inserted?: boolean;
    /** This run came from a tracked deletion. The text is kept so it can be read; writing puts the original markup back. */
    deleted?: boolean;
    /** A field instruction, such as " TOC \\o "1-3" \\h " or " REF Heading1 \\h ". The run's text is the result Word would show. */
    field?: string;
    /** This run is a watermark, painted faintly behind the page. */
    watermark?: boolean;
    /** How text wraps around this run's drawing: inline, square, tight, behind, or in front. */
    wrap?: "inline" | "square" | "tight" | "behind" | "front";
    /** Where the drawing sits across the page. */
    align?: "center" | "right";
    /** The drawings grouped into this one, by their relationship id. */
    grouped?: string[];
    /** How far the drawing is turned, in degrees. */
    rotation?: number;
    /** A citation. `source` is the source's tag; `pages` is the cited page range. */
    citation?: {
        source: string;
        pages?: string;
    };
    /** An index entry. `text` is the term; `see` points at another entry instead of a page number. */
    indexEntry?: {
        text: string;
        see?: string;
    };
    /** The kind a SEQ field numbers, such as "Figure". */
    caption?: string;
}
/** A block kept as markup: a content control, a formula, or tracked changes. Editing the story leaves it where it was. */
/** One piece of a formula laid out for the page: stacked for a fraction, shifted for a script, rooted for a radical. */
export type DocFormula = {
    text: string;
} | {
    kind: "frac";
    top: DocFormula[];
    bottom: DocFormula[];
} | {
    kind: "sup" | "sub";
    base: DocFormula[];
    script: DocFormula[];
} | {
    kind: "root";
    body: DocFormula[];
    degree: DocFormula[];
};
export interface DocRawBlock {
    raw: string;
    /** The text inside the markup, so the block can be read and edited without touching its structure. */
    text?: string;
    /** Set for a formula, so the page can lay it out instead of showing its text flat. */
    formula?: DocFormula[];
}
export declare function isDocRaw(block: DocBlock): block is DocRawBlock;
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
    /** A border around the paragraph, #rrggbb. */
    border?: string;
    /** A page break sits before this paragraph. */
    pageBreakBefore?: boolean;
    /** Kept on the same page as the paragraph after it. */
    keepNext?: boolean;
    /** Kept on one page, not split across a page break. */
    keepLines?: boolean;
    /** Widow and orphan control is on. */
    widowControl?: boolean;
    /** Outline level, 0 for the top. */
    outline?: number;
    /** Switches Word stores on the paragraph and this model only keeps, such as wordWrap, bidi, snapToGrid. */
    marks?: string[];
    /** Markup this model does not edit, kept so a rewrite puts it back: frame properties, text direction, a div id. */
    kept?: string[];
    /** This paragraph is a caption, numbered per kind ("Figure 1"). */
    caption?: string;
    /** This paragraph is the body of a footnote or an endnote, shown at the bottom of the page. */
    note?: {
        kind: "footnote" | "endnote";
        id: string;
    };
    /** Tab stops, in twips from the left margin. */
    tabs?: Array<{
        pos: number;
        align?: "left" | "center" | "right" | "decimal";
    }>;
    runs: DocRun[];
}
export interface DocCell {
    paragraphs: DocParagraph[];
    /** How many columns this cell covers. */
    span?: number;
    /** "restart" begins a vertical merge, "continue" extends the one above. */
    vMerge?: "restart" | "continue";
    shading?: string;
    /** A border around the cell, #rrggbb. */
    border?: string;
}
export interface DocTable {
    rows: DocCell[][];
    /** Column widths, in twips, one per column. */
    widths?: number[];
    /** The first row repeats as a header on each page. */
    header?: boolean;
    /** Set when pagination splits the table across pages: the table it was cut from, and the first row's index there. */
    source?: {
        table: DocTable;
        from: number;
    };
}
export type DocBlock = DocParagraph | DocTable | DocRawBlock;
export declare function isDocTable(block: DocBlock): block is DocTable;
export declare function isDocParagraph(block: DocBlock): block is DocParagraph;
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
    /** Gutter, in twips. */
    gutter?: number;
    /** Distance from the page edge to the header and footer, in twips. */
    headerDistance?: number;
    footerDistance?: number;
    /** Line numbers restart each page. */
    lineNumbers?: boolean;
    /** A border around the page, #rrggbb. */
    border?: string;
    /** Text direction for the section. */
    direction?: "lr" | "tb" | "rl";
    /** How this section starts: a new page, a new column, or on the same page. */
    break?: "nextPage" | "continuous" | "evenPage" | "oddPage" | "nextColumn";
}
export interface DocSection {
    page: DocPageSetup;
    header: DocParagraph[];
    footer: DocParagraph[];
    /** Shown on the first page when `titlePage` is set. */
    firstHeader?: DocParagraph[];
    firstFooter?: DocParagraph[];
    /** Shown on even pages. */
    evenHeader?: DocParagraph[];
    evenFooter?: DocParagraph[];
    /** This section's first page uses the first header and footer. */
    titlePage?: boolean;
    /** Package path of each header and footer part, so an edit can be written back to it. */
    headerPart?: string;
    footerPart?: string;
    firstHeaderPart?: string;
    evenHeaderPart?: string;
    firstFooterPart?: string;
    evenFooterPart?: string;
    blocks: DocBlock[];
}
/** A comment anchored in the story. */
export interface DocComment {
    id: string;
    author: string;
    text: string;
}
/** Formatting a named style contributes. A paragraph's own formatting wins. */
export interface DocStyle {
    basedOn?: string;
    align?: DocAlign;
    bold?: boolean;
    italic?: boolean;
    fontSize?: number;
    font?: string;
    color?: string;
}
/** Named styles from styles.xml, keyed by styleId. */
export type DocStyleTable = Record<string, DocStyle>;
/** One work a citation can point at. */
export interface DocSource {
    /** The tag a citation uses, for example "Smith2020". */
    tag: string;
    /** "book", "article", "report", or whatever the user typed. */
    type: string;
    /** Author names, shown as written. */
    authors: string;
    title: string;
    year: string;
    /** Where it was published: a journal, a publisher, a place. */
    publisher?: string;
}
/** One person a mail merge writes a copy for. */
export interface DocRecipient {
    /** Column name to value, matching the fields in the story ("FirstName", "Address"). */
    fields: Record<string, string>;
}
export interface Document {
    sections: DocSection[];
    /** numbering.xml resolved by numId, so a list can paint its marker. */
    numbering?: DocNumberingTable;
    /** styles.xml, so a paragraph style can paint what the runs do not say themselves. */
    styles?: DocStyleTable;
    /** The bibliography a citation draws from. */
    sources?: DocSource[];
    /** The people a mail merge writes one copy each for. */
    recipients?: DocRecipient[];
    /** When set, typing records each change as a tracked insertion or deletion. */
    tracking?: boolean;
    /** Comments anchored in the story. */
    comments?: DocComment[];
    /** The document hyphenates words at line ends. */
    hyphenation?: boolean;
    /** Editing is turned off, so the story can be read but not changed. */
    readOnly?: boolean;
    /** Every file under word/media/, keyed by its package path, whether or not the story shows it. */
    media?: Map<string, Uint8Array>;
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
    /** First value at this level. Defaults to 1. */
    start?: number;
    /** Number format: decimal, lowerLetter, upperRoman, and the rest Word stores. */
    format?: string;
}
/** Resolved numbering, keyed by numId. Filled in by the parser from numbering.xml. */
export type DocNumberingTable = Record<string, DocNumberingLevel[]>;
/** The marker a list paragraph shows. "%1" is this paragraph's own count; "%2" and beyond come from `counts`, one per level. */
export declare function listMarker(numbering: DocNumberingTable | undefined, paragraph: DocParagraph, counts?: number | number[]): string;
/** The text a citation shows: "(Smith, 2020, p. 12)". */
export declare function citationText(sources: DocSource[] | undefined, citation: {
    source: string;
    pages?: string;
}): string;
/** The bibliography, one line per source, in the order the sources were added. */
export declare function bibliographyLines(sources: DocSource[] | undefined): string[];
/** One paragraph of the story with every merge field filled in for one recipient. Missing fields stay blank. */
export declare function mergedText(paragraph: DocParagraph, recipient: DocRecipient): string;
/** The column a MERGEFIELD instruction names. */
export declare function mergeFieldName(instruction: string): string;
/** One copy of the story per recipient, paragraphs joined by blank lines. */
export declare function mergedCopies(document: Document): string[];
/** A table of contents: one line per heading, with its outline level and the page it falls on. */
export declare function tableOfContents(document: Document, pages: number[], depth?: number): Array<{
    level: number;
    text: string;
    page: number;
}>;
/** The outline level of a heading paragraph, or 0 when it is not a heading. */
export declare function headingLevel(paragraph: DocParagraph): number;
/** The index: one line per term, with the pages it appears on. A "see" entry points elsewhere instead. */
export declare function indexLines(document: Document, pages: number[]): Array<{
    term: string;
    pages: number[];
    see?: string;
}>;
/** The number a page field shows. Word numbers pages from 1 through the whole document. */
export declare function pageNumber(pages: number[], index: number): number;
/** Fills PAGE and NUMPAGES fields with the page they fall on and the page count. Other fields keep the text they already show. */
export declare function resolvePageFields(document: Document, pages: number[]): void;
/** What a table formula shows. `=SUM(LEFT)` and `=SUM(ABOVE)` add the numbers in that direction; anything else stays as written. */
export declare function formulaResult(rows: DocCell[][], row: number, col: number, instruction: string): string;
/** The words a spell check would flag: tokens that are not in the dictionary. */
export declare function misspellings(text: string, dictionary: ReadonlySet<string>): string[];
/** The formatting a style contributes, following `basedOn` so the named style wins over the one it inherits. */
export declare function styleOf(styles: DocStyleTable | undefined, name: string | undefined): DocStyle;
//# sourceMappingURL=index.d.ts.map