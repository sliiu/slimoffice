"use strict";
/**
 * Locked editor chrome: the Slide properties group only offers the 9
 * OOXML “standard” layouts PowerPoint ships on a blank deck.
 *
 * Types follow ECMA-376 ST_SlideLayoutType. Template masters in this repo
 * use a few aliases (`sectionHead` vs `secHead`); those map to the same 9.
 *
 * If a deck has none of the 9 (odd imported masters), the picker falls
 * back to the full list so layout capability is not lost.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SLIDE_LAYOUT_WHITELIST = void 0;
exports.canonicalSlideLayoutType = canonicalSlideLayoutType;
exports.isWhitelistedSlideLayout = isWhitelistedSlideLayout;
exports.filterLayoutsToWhitelist = filterLayoutsToWhitelist;
exports.SLIDE_LAYOUT_WHITELIST = [
    "title",
    "obj",
    "secHead",
    "twoObj",
    "twoTxTwoObj",
    "titleOnly",
    "blank",
    "objTx",
    "picTx",
];
const ALIASES = {
    titleSlide: "title",
    titleAndContent: "obj",
    sectionHead: "secHead",
    sectionHeader: "secHead",
    twoContent: "twoObj",
    comparison: "twoTxTwoObj",
    twoTxTwoObj: "twoTxTwoObj",
    contentWithCaption: "objTx",
    picAndCaption: "picTx",
    pictureCaption: "picTx",
    picTx: "picTx",
};
function canonicalSlideLayoutType(type) {
    if (!type)
        return undefined;
    const key = type.trim();
    if (!key)
        return undefined;
    return ALIASES[key] ?? key;
}
function isWhitelistedSlideLayout(type) {
    const canonical = canonicalSlideLayoutType(type);
    return !!canonical && exports.SLIDE_LAYOUT_WHITELIST.includes(canonical);
}
function filterLayoutsToWhitelist(layouts) {
    const filtered = layouts.filter((entry) => isWhitelistedSlideLayout(entry.type));
    return filtered.length > 0 ? filtered : layouts;
}
