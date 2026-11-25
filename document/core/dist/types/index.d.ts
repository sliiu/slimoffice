export type DocAlign = "left" | "center" | "right" | "both" | "distribute";
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
    /** CSS pixels for complex-script text, from `szCs`. The latin size is used where this is absent. */
    fontSizeCs?: number;
    /** Bold for complex-script text, from `bCs`. */
    boldCs?: boolean;
    /** Italic for complex-script text, from `iCs`. */
    italicCs?: boolean;
    /** Font family name from rFonts, the ascii face. */
    font?: string;
    /** The east-asian face from rFonts, used when the run holds CJK text. */
    fontEastAsia?: string;
    /** #rrggbb. */
    color?: string;
    /** The color follows the window text, from `w:val="auto"`. It paints as the page's text color. */
    colorAuto?: boolean;
    /** The theme color scheme slot this color came from, such as "accent1". The color itself is the slot resolved. */
    themeColor?: string;
    /** Character style name from rStyle. */
    runStyle?: string;
    /** The underline's own color, #rrggbb, from `u/@w:color`. Absent follows the text. */
    underlineColor?: string;
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
    /** A border around the run, one side at a time. */
    border?: DocBorder;
    /** Shading behind the run, #rrggbb. */
    shading?: string;
    /** Fit the run into this width, in twips, from `fitText`. */
    fitText?: number;
    /** East-asian layout: combined characters, vertical text, or a two-in-one line. */
    eastAsianLayout?: {
        id?: string;
        combine?: boolean;
        vert?: boolean;
        twoInOne?: boolean;
    };
    /** The pronunciation shown above the run, from `ruby`. The run's text is the base. */
    ruby?: string;
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
    /** A move range starts or ends at this run. The id ties the start to its end, and the markup is what gets written back. */
    moveRange?: {
        kind: "moveFrom" | "moveTo";
        edge: "start" | "end";
        id: string;
        raw: string;
    };
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
/** One piece of a formula laid out for the page: stacked, shifted, rooted, delimited, or set in a matrix. */
export type DocFormula = {
    text: string;
} | {
    kind: "frac";
    top: DocFormula[];
    bottom: DocFormula[];
} | {
    kind: "sup" | "sub" | "subsup";
    base: DocFormula[];
    script: DocFormula[];
    upper?: DocFormula[];
} | {
    kind: "root";
    body: DocFormula[];
    degree: DocFormula[];
} | {
    kind: "delim";
    open: string;
    close: string;
    body: DocFormula[];
} | {
    kind: "nary";
    sign: string;
    body: DocFormula[];
    sub?: DocFormula[];
    sup?: DocFormula[];
} | {
    kind: "func";
    name: DocFormula[];
    body: DocFormula[];
} | {
    kind: "bar";
    body: DocFormula[];
    under?: boolean;
} | {
    kind: "matrix";
    rows: DocFormula[][];
};
export interface DocRawBlock {
    raw: string;
    /** The text inside the markup, so the block can be read and edited without touching its structure. */
    text?: string;
    /** Set for a formula, so the page can lay it out instead of showing its text flat. */
    formula?: DocFormula[];
    /** Set for a content control: the paragraphs inside it, edited like any other paragraph. */
    content?: DocParagraph[];
    /** The control's own properties, kept so writing puts them back around the edited paragraphs. */
    control?: string;
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
    /** A border around the paragraph, one side at a time. */
    border?: DocBorder;
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
    /** A frame this paragraph sits in, from `framePr`: where it is and how wide. */
    frame?: DocFrame;
    /** Text direction inside the paragraph. */
    direction?: "lr" | "tb" | "rl";
    /** How the line of text sits on its baseline, from `textAlignment`. */
    textAlign?: string;
    /** How tightly text wraps a shape this paragraph belongs to. */
    tightWrap?: string;
    /** The div this paragraph belongs to. */
    divId?: string;
    /** Conditional formatting of a table style, from `cnfStyle`. */
    rowStyle?: string;
    /** This paragraph is a caption, numbered per kind ("Figure 1"). */
    caption?: string;
    /** Line numbers skip this paragraph, from `suppressLineNumbers`. */
    noLineNumbers?: boolean;
    /** This paragraph is the body of a footnote or an endnote, shown at the bottom of the page. */
    note?: {
        kind: "footnote" | "endnote";
        id: string;
    };
    /** This paragraph is the separator Word draws above the notes, or the one it draws when a note continues onto the next page. */
    noteSeparator?: {
        kind: "footnote" | "endnote";
        type: "separator" | "continuationSeparator";
    };
    /** Tab stops, in twips from the left margin. A leader is the line that fills the gap: dot, hyphen, underscore, middleDot, or none. */
    tabs?: Array<{
        pos: number;
        align?: "left" | "center" | "right" | "decimal";
        leader?: string;
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
    /** A border around the cell, one side at a time. */
    border?: DocBorder;
    /** Where the cell's text sits between its top and bottom. */
    align?: "top" | "center" | "bottom";
}
export interface DocTable {
    rows: DocCell[][];
    /** Column widths, in twips, one per column. */
    widths?: number[];
    /** Row heights, in twips, one per row, from `trHeight`. Absent means the row is as tall as its content. */
    rowHeights?: number[];
    /** "exact" keeps the row at its height; "atLeast" lets it grow past it. One per row, beside `rowHeights`. */
    rowRules?: Array<"exact" | "atLeast" | undefined>;
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
    /** Space between columns, in twips. */
    columnSpace?: number;
    /** A line between columns. */
    columnSeparator?: boolean;
    /** Page background from settings, the background element, or webSettings, #rrggbb. */
    background?: string;
    /** The left margin webSettings stores for the web view, in pixels. */
    webMargin?: number;
    /** Gutter, in twips. */
    gutter?: number;
    /** Distance from the page edge to the header and footer, in twips. */
    headerDistance?: number;
    footerDistance?: number;
    /** Line numbers restart each page. */
    lineNumbers?: boolean;
    /** The first line's number, from `lnNumType/@w:start`. */
    lineStart?: number;
    /** A border around the page, one side at a time. */
    border?: DocBorder;
    /** Text direction for the section. */
    direction?: "lr" | "tb" | "rl";
    /** How this section starts: a new page, a new column, or on the same page. */
    break?: "nextPage" | "continuous" | "evenPage" | "oddPage" | "nextColumn";
    /** Each column's width, in twips, when the columns are not equal. */
    columnWidths?: number[];
    /** Where the page's text sits between the margins. */
    verticalAlign?: "top" | "center" | "both" | "bottom";
    /** The document grid: how many lines and characters the page is ruled for. */
    grid?: {
        type?: string;
        linePitch?: number;
        charSpace?: number;
    };
    /** Page numbering: where it starts, and how it is written. */
    pageNumber?: {
        start?: number;
        format?: string;
    };
    /** The section's text runs right to left, from `bidi`. */
    bidi?: boolean;
    /** The gutter sits on the right, from `rtlGutter`. */
    rtlGutter?: boolean;
    /** Endnotes print at the end of the section instead of the document, from `endnotePr`. */
    endnotesHere?: boolean;
    /** Where footnotes and endnotes start counting, and how they are numbered. */
    notes?: {
        footnoteStart?: number;
        footnoteRestart?: string;
        endnoteStart?: number;
        endnoteRestart?: string;
    };
}
/** One side of a border. `style` is the line, `size` its width in eighths of a point, `color` #rrggbb. */
export interface DocBorderSide {
    style?: string;
    size?: number;
    color?: string;
}
/** A border read one side at a time, so each side keeps its own line and width. */
export interface DocBorder {
    top?: DocBorderSide;
    left?: DocBorderSide;
    bottom?: DocBorderSide;
    right?: DocBorderSide;
}
/** A paragraph frame, from `framePr`. Distances are in twips. */
export interface DocFrame {
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    anchorX?: string;
    anchorY?: string;
    wrap?: string;
    /** A drop cap: how many lines it drops, and how far it sits from the text. */
    dropCap?: {
        lines: number;
        space?: number;
    };
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
    /** The character style linked to this paragraph style, from `w:link`. */
    link?: string;
    /** "paragraph", "character", or "table". A paragraph style is the default. */
    type?: "character" | "table";
    align?: DocAlign;
    bold?: boolean;
    italic?: boolean;
    fontSize?: number;
    font?: string;
    color?: string;
}
/** What styles.xml says to use when a paragraph or a run names nothing. */
export interface DocDefaults {
    font?: string;
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
    color?: string;
}
/** One latent style: a style Word knows about and builds the first time it is used. */
export interface DocLatentStyle {
    name: string;
    /** How many of them are built in. */
    count?: number;
}
/** Named styles from styles.xml, keyed by styleId, plus the defaults and the latent styles beside them. */
export interface DocStyleTable {
    styles: Record<string, DocStyle>;
    defaults?: DocDefaults;
    latent?: DocLatentStyle[];
}
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
/** The theme's color scheme. Names are the scheme's own: dk1, lt1, accent1, and so on. Values are #rrggbb. */
export type DocThemeColors = Record<string, string>;
/** The theme's font scheme: one face for latin text, one for east-asian text. */
export interface DocThemeFonts {
    latin?: string;
    eastAsia?: string;
}
/** word/theme/theme1.xml, read so a run that names a theme color or a theme font can resolve it. */
export interface DocTheme {
    colors: DocThemeColors;
    fonts: DocThemeFonts;
}
/** The mail merge Word stored in settings.xml: what kind of document this is, and where the data comes from. */
export interface DocMailMerge {
    /** mainDocumentType: formLetters, mailingLabels, envelopes, catalog, or email. */
    document?: string;
    /** dataType: textFile, database, spreadsheet, native, or odso. */
    data?: string;
    /** The data source the merge reads from. */
    source?: string;
    /** How the source connects: file, or a connection string. */
    link?: string;
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
    /** The theme, so a theme color or a theme font resolves to a real one. */
    theme?: DocTheme;
    /** The bibliography a citation draws from. */
    sources?: DocSource[];
    /** The people a mail merge writes one copy each for. */
    recipients?: DocRecipient[];
    /** The mail merge Word stored in settings.xml. */
    mailMerge?: DocMailMerge;
    /** When set, typing records each change as a tracked insertion or deletion. */
    tracking?: boolean;
    /** Comments anchored in the story. */
    comments?: DocComment[];
    /** The document hyphenates words at line ends. */
    hyphenation?: boolean;
    /** How the document is shown: print, web (reading), outline, or normal (draft). Print is the default. */
    view?: "print" | "web" | "outline" | "normal";
    /** Zoom in percent. 100 is the default. */
    zoom?: number;
    /** The file contains a macro project. It is never run. */
    macros?: boolean;
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
    /** A picture used as the bullet, from `numPicBullet`. `image` is its relationship id. */
    picture?: {
        image: string;
        imageBytes?: Uint8Array;
        imageType?: string;
    };
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
/** A page number written in the format the section asks for. Decimal is the plain number. */
export declare function formatPageNumber(value: number, format: string | undefined): string;
/** Fills PAGE and NUMPAGES fields with the page they fall on and the page count. Other fields keep the text they already show. */
export declare function resolvePageFields(document: Document, pages: number[]): void;
/** What a table formula shows. SUM, AVERAGE, MIN, MAX, and COUNT each take LEFT, RIGHT, ABOVE, or BELOW; anything else stays as written. */
export declare function formulaResult(rows: DocCell[][], row: number, col: number, instruction: string): string;
/** The words a spell check would flag: tokens that are not in the dictionary. */
export declare function misspellings(text: string, dictionary: ReadonlySet<string>): string[];
/** The formatting a style contributes, following `basedOn` so the named style wins over the one it inherits. Document defaults sit underneath. */
export declare function styleOf(styles: DocStyleTable | undefined, name: string | undefined): DocStyle;
//# sourceMappingURL=index.d.ts.map