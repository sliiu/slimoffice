"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeDocx = writeDocx;
const fflate_1 = require("fflate");
/** Writes the original parts back. Nothing is rebuilt, so an unread part stays byte for byte. */
function writeDocx(document) {
    if (!document.source || document.source.size === 0) {
        throw new Error("This document has no original parts to write back");
    }
    const files = {};
    for (const [path, bytes] of document.source)
        files[path] = bytes;
    return (0, fflate_1.zipSync)(files);
}
