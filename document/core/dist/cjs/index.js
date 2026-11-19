"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PAGE = void 0;
exports.isDocTable = isDocTable;
exports.listMarker = listMarker;
function isDocTable(block) {
    return "rows" in block;
}
exports.DEFAULT_PAGE = {
    width: 12240,
    height: 15840,
    margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
};
/** The marker a list paragraph shows, taken from its numbering definition. */
function listMarker(numbering, paragraph) {
    if (!paragraph.numbering)
        return "";
    const level = numbering?.[paragraph.numbering.id]?.[paragraph.numbering.level];
    if (level?.bullet)
        return level.bullet;
    if (level?.text && !level.text.includes("%"))
        return level.text;
    return `${paragraph.numbering.level + 1}.`;
}
