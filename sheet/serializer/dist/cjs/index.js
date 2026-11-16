"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeXlsx = writeXlsx;
const fflate_1 = require("fflate");
/** Writes the original parts back. Nothing is rebuilt, so an unread part stays byte for byte. */
function writeXlsx(workbook) {
    if (!workbook.source || workbook.source.size === 0) {
        throw new Error("This workbook has no original parts to write back");
    }
    const files = {};
    for (const [path, bytes] of workbook.source)
        files[path] = bytes;
    return (0, fflate_1.zipSync)(files);
}
