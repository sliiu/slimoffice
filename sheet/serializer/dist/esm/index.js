import { strFromU8, strToU8, zipSync } from "fflate";
import { applyWorkbookEdits } from "./cells.js";
export { blankWorkbook } from "./blank.js";
/**
 * Writes the workbook. Edited cells replace worksheet parts and the shared-string table;
 * every other original part goes back unchanged. A formula cell is kept until its shown value changes.
 */
export function writeXlsx(workbook) {
    if (!workbook.source || workbook.source.size === 0) {
        throw new Error("This workbook has no original parts to write back");
    }
    const files = new Map(workbook.source);
    if (workbook.edited)
        applyWorkbookEdits(files, workbook, strFromU8, strToU8);
    return zipSync(Object.fromEntries(files));
}
