"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZipBombError = void 0;
exports.loadArchive = loadArchive;
const fflate_1 = require("fflate");
const MAX_UNCOMPRESSED = 200 * 1024 * 1024;
const MAX_ENTRIES = 20_000;
const MAX_RATIO = 100;
const RATIO_MIN_BYTES = 1_000_000;
class ZipBombError extends Error {
    constructor() {
        super("ZIP_TOO_LARGE");
        this.name = "ZipBombError";
    }
}
exports.ZipBombError = ZipBombError;
function loadArchive(input) {
    let count = 0;
    let total = 0;
    const entries = (0, fflate_1.unzipSync)(input, {
        filter(file) {
            count += 1;
            total += file.originalSize;
            if (count > MAX_ENTRIES || total > MAX_UNCOMPRESSED)
                throw new ZipBombError();
            if (file.size > 0 && file.originalSize > RATIO_MIN_BYTES && file.originalSize / file.size > MAX_RATIO) {
                throw new ZipBombError();
            }
            return true;
        },
    });
    const files = new Map();
    for (const [name, data] of Object.entries(entries))
        files.set(normalize(name), data);
    return {
        files,
        getText: (path) => {
            const bytes = files.get(normalize(path));
            return bytes ? (0, fflate_1.strFromU8)(bytes) : undefined;
        },
    };
}
function normalize(path) {
    let next = path.replace(/\\/g, "/");
    if (next.startsWith("/"))
        next = next.slice(1);
    return next;
}
