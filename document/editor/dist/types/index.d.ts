import { type DocAlign, type DocSource, type DocUnderline, type Document } from "@sliiu/document-core";
export interface DocumentEditOptions {
    locale?: "zh-CN" | "en";
    onChange?: () => void;
    onStatus?: (text: string) => void;
    onSelection?: () => void;
}
export type RunMark = "bold" | "italic" | "strike";
export interface DocumentView {
    destroy(): void;
    undo(): void;
    redo(): void;
    canUndo(): boolean;
    canRedo(): boolean;
    bold(): void;
    boldOn(): boolean;
    italic(): void;
    italicOn(): boolean;
    underline(style?: DocUnderline): void;
    underlineOn(): boolean;
    strike(): void;
    strikeOn(): boolean;
    superscript(): void;
    subscript(): void;
    vertAlignOn(value: "superscript" | "subscript"): boolean;
    highlight(color: string): void;
    highlightOn(): string | undefined;
    fontSize(pixels: number): void;
    fontSizeOn(): number | undefined;
    growFont(): void;
    shrinkFont(): void;
    font(name: string): void;
    fontOn(): string | undefined;
    color(value: string): void;
    colorOn(): string | undefined;
    clearFormat(): void;
    align(value: DocAlign): void;
    alignOn(value: DocAlign): boolean;
    indent(direction: 1 | -1): void;
    bullet(): void;
    number(): void;
    insertParagraph(): void;
    insertTable(rows?: number, cols?: number): void;
    addRow(): void;
    addColumn(): void;
    deleteRow(): void;
    deleteColumn(): void;
    mergeCells(down?: boolean): void;
    insertImage(file: Blob): Promise<void>;
    link(target: string): void;
    unlink(): void;
    linkOn(): string | undefined;
    bookmark(name: string): void;
    pageBreak(): void;
    pageSize(width: number, height: number): void;
    landscape(): void;
    landscapeOn(): boolean;
    margins(narrow: boolean, edge?: number): void;
    columns(count: number): void;
    columnsOn(): number;
    pageColor(color: string): void;
    pageColorOn(): string | undefined;
    find(query: string): number;
    findNext(): void;
    replace(query: string, replacement: string): number;
    replaceAll(query: string, replacement: string): number;
    /** Keeps a tracked insertion and drops a tracked deletion, at the caret or through the whole story. */
    acceptChange(): number;
    /** Drops a tracked insertion and restores a tracked deletion. */
    rejectChange(): number;
    /** How the current story differs from the copy taken when it was opened: insertions and deletions, one line each. */
    compare(): string[];
    /** Inserts a table of contents built from the headings, in place of an existing one. Returns how many entries it has. */
    tableOfContents(): number;
    /** Marks the current paragraph as a caption of the given kind, numbered through the story ("Figure 1"). */
    caption(kind: string): void;
    /** Inserts a cross-reference to a caption or a heading, shown as its text. */
    crossReference(target: string): void;
    /** The captions and headings a cross-reference can point at. */
    referenceTargets(): string[];
    /** Adds a source and returns its tag. */
    addSource(source: DocSource): string;
    /** Inserts a citation to one source, optionally with a page range. */
    cite(tag: string, pages?: string): void;
    /** Inserts the bibliography, replacing one already in the story. Returns how many works it lists. */
    bibliography(): number;
    /** Marks the selected text as an index entry. `see` points at another entry instead of a page. */
    indexEntry(see?: string): void;
    /** Inserts the index, one line per term, replacing one already in the story. Returns how many terms it lists. */
    insertIndex(): number;
    /** Adds one recipient. The fields are the columns the merge fills in. */
    addRecipient(fields: Record<string, string>): void;
    /** The column names the recipients use. */
    recipientFields(): string[];
    /** Inserts a merge field, filled from one column of each recipient. */
    mergeField(name: string): void;
    /** One copy of the story per recipient, with the merge fields filled in. */
    merge(): string[];
    /** Lays the current paragraph out as an envelope: the recipient's address, then the return address. */
    envelope(): void;
    /** Lays the story out as one label per recipient. Returns how many labels it made. */
    labels(): number;
    /** Adds a footnote after the caret and returns its number. */
    footnote(text: string): number;
    /** Adds an endnote after the caret and returns its number. */
    endnote(text: string): number;
    /** Inserts a page number field at the caret. It shows the page it falls on. */
    pageNumber(): void;
    /** Inserts a `=SUM(LEFT)` formula in the current cell. */
    formula(): void;
    /** Applies a named style to the current paragraph. */
    style(name: string): void;
    /** The named styles the document defines. */
    styles(): string[];
    /** Switches tracked changes on or off. While on, typing is recorded as an insertion or a deletion. */
    track(on: boolean): void;
    /** Whether typing is being recorded. */
    tracking(): boolean;
    /** Copies the current run's formatting. The next call applies it, then clears it. */
    painter(): void;
    /** Whether copied formatting is waiting to be applied. */
    painterOn(): boolean;
    /** Sets the character scale, in percent. 100 leaves the run unchanged. */
    scale(percent: number): void;
    /** Sets the extra space between characters, in twips. */
    charSpacing(twips: number): void;
    /** Raises or lowers the run, in half-points. Positive raises. */
    position(halfPoints: number): void;
    /** Shows the run in capitals without changing the stored letters. */
    caps(): void;
    capsOn(): boolean;
    /** Shows the run in small capitals. */
    smallCaps(): void;
    smallCapsOn(): boolean;
    /** Draws a double line through the run. */
    doubleStrike(): void;
    doubleStrikeOn(): boolean;
    /** Hides the run. */
    hidden(): void;
    hiddenOn(): boolean;
    /** Puts a dot emphasis mark on the run. Pressing again clears it. */
    emphasis(): void;
    emphasisOn(): boolean;
    /** Rewrites the current text: upper, lower, sentence, title, or toggle. */
    changeCase(mode: "upper" | "lower" | "sentence" | "title" | "toggle"): void;
    /** Sets the run's language. An empty value clears it. */
    lang(value: string): void;
    /** Sets the point size below which the run is not kerned. Zero clears it. */
    kern(points: number): void;
    /** Names the character style the run uses. An empty name clears it. */
    runStyle(name: string): void;
    /** Turns one run switch on or off: shadow, outline, emboss, imprint, or effect. */
    runSwitch(name: string, on: boolean): void;
    /** Whether the shadow switch is on for the current run. */
    shadowOn(): boolean;
    /** Keeps this paragraph on the same page as the next one. */
    keepWithNext(): void;
    keepWithNextOn(): boolean;
    /** Keeps the paragraph's lines on one page. */
    keepLines(): void;
    keepLinesOn(): boolean;
    /** Keeps the paragraph's first and last lines with the paragraph. */
    widowControl(): void;
    widowControlOn(): boolean;
    /** Sets the outline level, from 0. A negative value clears it. */
    outline(level: number): void;
    outlineOn(): number | undefined;
    /** Turns one paragraph switch on or off, such as word wrap or bidirectional text. */
    paragraphSwitch(name: string, on: boolean): void;
    /** Whether the word wrap switch is on for the current paragraph. */
    wordWrapOn(): boolean;
    /** Whether the paragraph runs right to left. */
    bidiOn(): boolean;
    /** Adds a tab stop to the current paragraph, in twips from the left margin. */
    tabStop(pos: number, align?: "left" | "center" | "right" | "decimal"): void;
    /** Inserts a cover page and makes the first page show its own header. */
    cover(title: string): void;
    /** Inserts a rectangle. The text is its label. */
    shape(label: string): void;
    /** Inserts an icon. `name` picks the preset geometry. */
    icon(name: string): void;
    /** Inserts one labeled box per item. */
    smartArt(labels: string[]): void;
    /** Inserts one bar per value. */
    chart(values: number[]): void;
    /** Adds a comment anchored at the caret and returns its id. */
    comment(text: string): string;
    /** The comments anchored in the story. */
    comments(): Array<{
        id: string;
        author: string;
        text: string;
    }>;
    /** The words in the story that are not in the dictionary. */
    spelling(dictionary: ReadonlySet<string>): string[];
    /** Sorts the current paragraph's lines. `ascending` is false for reverse order. */
    sort(ascending?: boolean): void;
    /** Sets the line spacing. `240` with `"auto"` is single spacing; exact and at least are in twips. */
    lineSpacing(line: number, rule?: "auto" | "exact" | "atLeast"): void;
    /** Sets the space before and after the current paragraph, in twips. */
    paragraphSpacing(before: number, after: number): void;
    /** Shades the current paragraph. An empty color clears it. */
    shading(color: string): void;
    /** Puts a border on the current paragraph. An empty color clears it. */
    border(color: string): void;
    /** Inserts an empty page after the current one. */
    blankPage(): void;
    /** Inserts one character, such as a symbol the font supplies. */
    symbol(char: string): void;
    /** Inserts the date and time as a field, showing the text given. */
    dateTime(text: string): void;
    /** Inserts a text box. The text is what it shows. */
    textBox(text: string): void;
    /** Sets the paper size, in twips. */
    paper(width: number, height: number): void;
    /** Sets the gutter and the header and footer distance, in twips. */
    pageEdges(gutter: number, header: number, footer: number): void;
    /** Turns line numbers on or off for the current section. */
    lineNumbers(on: boolean): void;
    /** Puts a border around the page. An empty color clears it. */
    pageBorder(color: string): void;
    /** Sets the text direction of the current section. */
    direction(flow: "lr" | "tb" | "rl"): void;
    /** Puts a watermark in the header. An empty text clears it. */
    watermark(text: string): void;
    /** Splits the story into a new section at the caret. */
    sectionBreak(): void;
    /** Sets the width of the current table's columns, in twips. */
    columnWidth(twips: number): void;
    /** Marks the current row as a header row, or clears it. */
    headerRow(on: boolean): void;
    /** Puts a border on the current cell. An empty color clears it. */
    cellBorder(color: string): void;
    /** Shades the current cell. An empty color clears it. */
    cellShading(color: string): void;
    /** Turns hyphenation on or off for the whole document. */
    hyphenate(on: boolean): void;
    /** Whether hyphenation is on. */
    hyphenateOn(): boolean;
    /** Reads a caption's SEQ field, so "Figure 1" numbers as the first figure. */
    readCaption(instruction: string): {
        kind: string;
        number: number;
    } | undefined;
    /** Sets how text wraps around the current picture. */
    wrap(mode: "inline" | "square" | "tight" | "behind" | "front"): void;
    /** Raises or lowers the current picture one step. Returns its new order. */
    order(direction: 1 | -1): number;
    /** Aligns the current picture to the left, center, or right of the page. */
    alignObject(edge: "left" | "center" | "right"): void;
    /** Groups the selected pictures into one. Returns how many it grouped. */
    group(): number;
    /** Turns the current picture by a quarter turn. */
    rotate(): void;
    /** Crops the current picture. Each edge is a percent of the picture; zero clears it. */
    crop(left: number, top: number, right: number, bottom: number): void;
    /** Translates the current paragraph into the target language and returns the text. */
    translate(language: string): string;
    /** Turns editing off, so the story can be read but not changed. */
    protect(on: boolean): void;
    /** Whether editing is turned off. */
    protected(): boolean;
    selectAll(): void;
    wordCount(): void;
    speak(): void;
    copy(): Promise<void>;
    cut(): Promise<void>;
    paste(): Promise<void>;
    reload(): void;
}
/** Pages you can edit. Headers and footers stay as opened; the story is what gets written back. */
export declare function mountDocument(host: HTMLElement, doc: Document, options?: DocumentEditOptions): DocumentView;
//# sourceMappingURL=index.d.ts.map