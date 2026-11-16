import type { Workbook } from "@sliiu/sheet-core";
export interface SheetGrid {
    destroy(): void;
}
/** Read-only grid. Editing and formula evaluation come later, so this view never changes the workbook. */
export declare function mountWorkbook(host: HTMLElement, workbook: Workbook): SheetGrid;
