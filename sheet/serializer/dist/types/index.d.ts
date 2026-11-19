import type { Workbook } from "@sliiu/sheet-core";
export { blankWorkbook } from "./blank.js";
/**
 * Writes the workbook. Edited cells replace worksheet parts and the shared-string table;
 * every other original part goes back unchanged. A formula cell is kept until its shown value changes.
 */
export declare function writeXlsx(workbook: Workbook): Uint8Array;
