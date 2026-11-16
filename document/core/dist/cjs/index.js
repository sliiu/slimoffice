"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PAGE = void 0;
exports.isDocTable = isDocTable;
function isDocTable(block) {
    return "rows" in block;
}
exports.DEFAULT_PAGE = {
    width: 12240,
    height: 15840,
    margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
};
