"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emptyTxStyles = emptyTxStyles;
exports.parseTxStyles = parseTxStyles;
exports.parseLstStyle = parseLstStyle;
exports.pickStyle = pickStyle;
const xml_1 = require("./xml");
const text_1 = require("./text");
function emptyTxStyles() {
    return { title: [], body: [], other: [] };
}
function parseTxStyles(masterRoot, ctx) {
    const out = emptyTxStyles();
    const node = (0, xml_1.findByLocalName)(masterRoot, "txStyles");
    if (!node)
        return out;
    out.title = readStyle((0, xml_1.findByLocalName)(node, "titleStyle"), ctx);
    out.body = readStyle((0, xml_1.findByLocalName)(node, "bodyStyle"), ctx);
    out.other = readStyle((0, xml_1.findByLocalName)(node, "otherStyle"), ctx);
    return out;
}
/** `<p:notesStyle>` / lstStyle 同构：lvl1pPr..lvl9pPr。 */
function parseLstStyle(node, ctx) {
    return readStyle(node, ctx);
}
function readStyle(node, ctx) {
    if (!node)
        return [];
    const out = [];
    for (let i = 1; i <= 9; i++) {
        const lvl = (0, xml_1.findByLocalName)(node, `lvl${i}pPr`);
        out.push(lvl ? extractLevelStyle(lvl, ctx) : { pPr: {}, rPr: {} });
    }
    return out;
}
function extractLevelStyle(lvlPPr, ctx) {
    const pPrDefaults = (0, text_1.parsePPrDefaults)(lvlPPr, ctx);
    const defRPr = (0, xml_1.findByLocalName)(lvlPPr, "defRPr");
    const rPr = (0, text_1.readRunProps)(defRPr, ctx);
    const out = {
        pPr: { ...pPrDefaults },
        rPr,
    };
    if (pPrDefaults.bullet) {
        out.bullet = pPrDefaults.bullet;
        delete out.pPr.bullet;
    }
    return out;
}
function pickStyle(styles, phType) {
    if (phType === "title" || phType === "ctrTitle")
        return styles.title;
    if (phType === "body" || phType === "subTitle" || phType === "obj" || phType === undefined)
        return styles.body;
    return styles.other;
}
