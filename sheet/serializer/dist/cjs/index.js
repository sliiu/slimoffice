"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blankWorkbook = void 0;
exports.writeXlsx = writeXlsx;
const fflate_1 = require("fflate");
const cells_1 = require("./cells");
var blank_1 = require("./blank");
Object.defineProperty(exports, "blankWorkbook", { enumerable: true, get: function () { return blank_1.blankWorkbook; } });
/**
 * Writes the workbook. Edited cells replace worksheet parts and the shared-string table;
 * every other original part goes back unchanged. A formula cell is kept until its shown value changes.
 */
function writeXlsx(workbook) {
    if (!workbook.source || workbook.source.size === 0) {
        throw new Error("This workbook has no original parts to write back");
    }
    const files = new Map(workbook.source);
    if (workbook.edited)
        (0, cells_1.applyWorkbookEdits)(files, workbook, fflate_1.strFromU8, fflate_1.strToU8);
    return (0, fflate_1.zipSync)(Object.fromEntries(files));
}
