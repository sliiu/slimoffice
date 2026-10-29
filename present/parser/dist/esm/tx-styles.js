import { findByLocalName } from "./xml.js";
import { parsePPrDefaults, readRunProps } from "./text.js";
export function emptyTxStyles() {
    return { title: [], body: [], other: [] };
}
export function parseTxStyles(masterRoot, ctx) {
    const out = emptyTxStyles();
    const node = findByLocalName(masterRoot, "txStyles");
    if (!node)
        return out;
    out.title = readStyle(findByLocalName(node, "titleStyle"), ctx);
    out.body = readStyle(findByLocalName(node, "bodyStyle"), ctx);
    out.other = readStyle(findByLocalName(node, "otherStyle"), ctx);
    return out;
}
/** `<p:notesStyle>` / lstStyle 同构：lvl1pPr..lvl9pPr。 */
export function parseLstStyle(node, ctx) {
    return readStyle(node, ctx);
}
function readStyle(node, ctx) {
    if (!node)
        return [];
    const out = [];
    for (let i = 1; i <= 9; i++) {
        const lvl = findByLocalName(node, `lvl${i}pPr`);
        out.push(lvl ? extractLevelStyle(lvl, ctx) : { pPr: {}, rPr: {} });
    }
    return out;
}
function extractLevelStyle(lvlPPr, ctx) {
    const pPrDefaults = parsePPrDefaults(lvlPPr, ctx);
    const defRPr = findByLocalName(lvlPPr, "defRPr");
    const rPr = readRunProps(defRPr, ctx);
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
export function pickStyle(styles, phType) {
    if (phType === "title" || phType === "ctrTitle")
        return styles.title;
    if (phType === "body" || phType === "subTitle" || phType === "obj" || phType === undefined)
        return styles.body;
    return styles.other;
}
