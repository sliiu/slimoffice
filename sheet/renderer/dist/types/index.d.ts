import type { SheetAlign, ConsolidateFunc, SheetCell, SheetCfRule, SheetChartKind, SheetFormControl, SheetPageSetup, SheetShapeKind, SheetSparklineKind, SheetTheme, SheetVAlign, SheetValidation, Workbook } from "@sliiu/sheet-core";
export interface SheetEditOptions {
    locale?: "zh-CN" | "en";
    onChange?: () => void;
    onStatus?: (text: string) => void;
    onSelection?: () => void;
}
export interface SheetGrid {
    destroy(): void;
    undo(): void;
    redo(): void;
    canUndo(): boolean;
    canRedo(): boolean;
    bold(): void;
    boldOn(): boolean;
    italic(): void;
    italicOn(): boolean;
    underline(): void;
    underlineOn(): boolean;
    strike(): void;
    strikeOn(): boolean;
    clearCell(): void;
    clearFormat(): void;
    insertRow(): void;
    insertColumn(): void;
    deleteRow(): void;
    deleteColumn(): void;
    find(query: string): number;
    replace(query: string, next: string): number;
    sum(): void;
    autoSum(): void;
    formatNumbers(): void;
    numFmt(pattern: string): void;
    align(value: SheetAlign): void;
    valign(value: SheetVAlign): void;
    wrap(): void;
    wrapOn(): boolean;
    merge(): void;
    unmerge(): void;
    fillDown(): void;
    fillRight(): void;
    sort(ascending?: boolean): void;
    freeze(): void;
    color(hex: string): void;
    fill(hex: string): void;
    font(name: string): void;
    fontSize(pixels: number): void;
    hyperlink(url: string): void;
    comment(text: string): void;
    addSheet(name?: string): void;
    symbol(text: string): void;
    applyStyle(name: string): void;
    formatCell(patch: {
        numFmt?: string;
        font?: string;
        fontSize?: number;
        color?: string;
        fill?: string;
        align?: SheetCell["align"];
        bold?: boolean;
    }): void;
    printArea(): void;
    fitTo(width: number, height?: number): void;
    recalculate(): void;
    zoom(factor: number): void;
    zoomOn(): number;
    toggleGrid(): void;
    gridOn(): boolean;
    toggleFormulaBar(): void;
    formulaBarOn(): boolean;
    removeDuplicates(): number;
    textToColumns(delimiter?: string): void;
    protect(on?: boolean): void;
    protectedOn(): boolean;
    filter(): void;
    filterOn(): boolean;
    /** Keep only the rows whose cell in the current column is one of these values. Omit to clear that column. */
    filterBy(values?: string[]): void;
    /** Keep the rows whose cell in the slicer's field is one of these values. Omit to show them all. */
    slicerBy(name: string, values?: string[]): void;
    hideRow(): void;
    hideColumn(): void;
    unhide(): void;
    indent(delta?: number): void;
    listMacros(): string[];
    addChart(kind?: SheetChartKind, range?: string, title?: string): void;
    addSparkline(kind?: SheetSparklineKind, data?: string): void;
    addConditionalFormat(rule: SheetCfRule, rows?: number, cols?: number): void;
    addTable(name?: string): void;
    /** Add a totals row to the table under the selection, or take it off. Returns whether it is on. */
    toggleTotals(): boolean;
    /** Show or hide the header row of the table under the selection. Returns whether it is on. */
    toggleHeader(): boolean;
    /** Rename the table under the selection. A blank name leaves it, and a taken name gains a suffix. */
    renameTable(name: string): boolean;
    /** Move the table under the selection to a new range. The range must cover at least one cell. */
    resizeTable(range: {
        r1: number;
        c1: number;
        r2: number;
        c2: number;
    }): boolean;
    /** Remove the table under the selection. The cells stay. */
    deleteTable(): boolean;
    /** Keep the rows whose cell in the selected column is one of these values. Omit to show them all. */
    tableFilter(values?: string[]): boolean;
    /** Keep the rows whose cell in the selected column passes this comparison. A second one joins it, and `and` makes both required. Omit to drop them. */
    tableFilterRule(rule?: {
        op: "eq" | "ne" | "gt" | "gte" | "lt" | "lte";
        value: string;
        and?: boolean;
    }, other?: {
        op: "eq" | "ne" | "gt" | "gte" | "lt" | "lte";
        value: string;
    }): boolean;
    /** Keep the largest numbers in the selected column, or the smallest when `bottom` is set. Omit to stop ranking. */
    tableFilterTop(spec?: {
        count: number;
        percent?: boolean;
        bottom?: boolean;
    }): boolean;
    /** Keep the numbers above or below the selected column's average. Omit to stop. */
    tableFilterAverage(kind?: "aboveAverage" | "belowAverage"): boolean;
    /** How the totals row reduces the column under the selection. A sum is the default. */
    totalsFunction(fn: "sum" | "count" | "average" | "max" | "min" | "none"): boolean;
    addPivot(name?: string): void;
    pageSetup(patch: SheetPageSetup): void;
    pageSetupOn(): SheetPageSetup | undefined;
    printPreview(): void;
    setRowHeight(points?: number): void;
    setColumnWidth(chars?: number): void;
    insertCells(shift?: "right" | "down"): void;
    deleteCells(shift?: "left" | "up"): void;
    increaseDecimals(): void;
    decreaseDecimals(): void;
    thousandSeparator(): void;
    defineName(name?: string, refersTo?: string): void;
    goToSpecial(kind?: "blanks" | "formulas" | "constants" | "comments" | "validation" | "conditional"): number;
    border(style?: "thin" | "medium" | "thick" | "dashed" | "dotted", color?: string): void;
    copyCell(): void;
    cutCell(): void;
    pasteCell(): void;
    formatPainter(): void;
    workbookStats(): {
        sheets: number;
        cells: number;
        formulas: number;
    };
    addShape(kind?: SheetShapeKind, text?: string): void;
    setTheme(theme: SheetTheme): void;
    themeOn(): SheetTheme | undefined;
    addValidation(rule?: Partial<SheetValidation>): void;
    addFormControl(kind?: SheetFormControl["kind"], label?: string): void;
    addSlicer(field?: string): void;
    addXmlMap(name?: string): void;
    groupRows(): void;
    ungroupRows(): void;
    subtotal(): void;
    pageBreak(): void;
    alignObjects(mode?: "left" | "center" | "right"): void;
    spellCheck(): number;
    tracePrecedents(): string[];
    traceDependents(): string[];
    errorCheck(): string[];
    allowEditRange(name?: string, range?: string): void;
    setArrayFormula(formula?: string): void;
    whatIf(target?: number): void;
    consolidate(spec?: {
        func?: ConsolidateFunc;
        sources?: string[];
        dest?: string;
        topRow?: boolean;
        leftCol?: boolean;
        links?: boolean;
    }): void;
    forecast(): void;
    reload(): void;
    selected(): {
        row: number;
        col: number;
        sheet: number;
    };
}
/** Editable grid with Home-tab commands and formula recalculation. */
export declare function mountWorkbook(host: HTMLElement, workbook: Workbook, options?: SheetEditOptions): SheetGrid;
