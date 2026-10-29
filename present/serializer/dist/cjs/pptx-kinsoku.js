"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchKinsoku = patchKinsoku;
const core_1 = require("@sliiu/present-core");
const fflate_1 = require("fflate");
const raw_xml_1 = require("./raw-xml");
function findRootElement(tree, rootLocal) {
    for (const n of tree) {
        const tag = (0, raw_xml_1.getTagName)(n);
        if (tag && (0, raw_xml_1.localName)(tag) === rootLocal)
            return n;
    }
    return undefined;
}
function presentationPrefix(rootKids) {
    const sldIdLst = (0, raw_xml_1.findChildByLocal)(rootKids, "sldIdLst");
    const tag = sldIdLst ? (0, raw_xml_1.getTagName)(sldIdLst) : "p:sldIdLst";
    const i = (tag ?? "p:sldIdLst").indexOf(":");
    return i < 0 ? "p:" : tag.slice(0, i + 1);
}
function kinsokuAttrs(k) {
    const attrs = {};
    if (k.lang)
        attrs["@_lang"] = k.lang;
    if (k.invalStChars)
        attrs["@_invalStChars"] = k.invalStChars;
    if (k.invalEndChars)
        attrs["@_invalEndChars"] = k.invalEndChars;
    return attrs;
}
/** ECMA-376 §19.2.1.20 — align `<p:kinsoku>` on presentation.xml with `pres.kinsoku`. */
function patchKinsoku(pres, archive, opts) {
    const source = pres.__source;
    const nextSnap = (0, core_1.kinsokuSnapshot)(pres.kinsoku);
    const prevSnap = source?.kinsokuSnapshot ?? "";
    if (nextSnap === prevSnap)
        return;
    const presPath = source?.presentationPath ?? "ppt/presentation.xml";
    const presBytes = archive.files.get(presPath);
    if (!presBytes)
        return;
    const presTree = (0, raw_xml_1.parseXmlPreserveOrder)((0, fflate_1.strFromU8)(presBytes));
    const presRoot = findRootElement(presTree, "presentation");
    if (!presRoot)
        return;
    const rootKids = (0, raw_xml_1.getChildren)(presRoot);
    const withoutK = rootKids.filter((n) => (0, raw_xml_1.localName)((0, raw_xml_1.getTagName)(n) ?? "") !== "kinsoku");
    if (!pres.kinsoku) {
        if (withoutK.length !== rootKids.length) {
            (0, raw_xml_1.setChildren)(presRoot, withoutK);
            archive.files.set(presPath, (0, fflate_1.strToU8)((0, raw_xml_1.buildXml)(presTree)));
            if (opts.debug)
                console.log("[roundtrip] kinsoku removed");
        }
        return;
    }
    const prefix = presentationPrefix(withoutK);
    const kNode = {
        [`${prefix}kinsoku`]: [],
        ":@": kinsokuAttrs(pres.kinsoku),
    };
    const extIdx = withoutK.findIndex((n) => (0, raw_xml_1.localName)((0, raw_xml_1.getTagName)(n) ?? "") === "extLst");
    const nextKids = extIdx >= 0
        ? [...withoutK.slice(0, extIdx), kNode, ...withoutK.slice(extIdx)]
        : [...withoutK, kNode];
    (0, raw_xml_1.setChildren)(presRoot, nextKids);
    archive.files.set(presPath, (0, fflate_1.strToU8)((0, raw_xml_1.buildXml)(presTree)));
    if (opts.debug)
        console.log("[roundtrip] kinsoku patched");
}
