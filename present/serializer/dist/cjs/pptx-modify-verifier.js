"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchModifyVerifier = patchModifyVerifier;
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
function modifyVerifierAttrs(mv) {
    const attrs = {};
    if (mv.algorithmName)
        attrs["@_algorithmName"] = mv.algorithmName;
    if (mv.hashValue)
        attrs["@_hashValue"] = mv.hashValue;
    if (mv.hashData)
        attrs["@_hashData"] = mv.hashData;
    if (mv.saltValue)
        attrs["@_saltValue"] = mv.saltValue;
    if (mv.saltData)
        attrs["@_saltData"] = mv.saltData;
    if (mv.spinValue !== undefined)
        attrs["@_spinValue"] = String(mv.spinValue);
    if (mv.spinCount !== undefined)
        attrs["@_spinCount"] = String(mv.spinCount);
    if (mv.cryptProviderType)
        attrs["@_cryptProviderType"] = mv.cryptProviderType;
    if (mv.cryptAlgorithmClass)
        attrs["@_cryptAlgorithmClass"] = mv.cryptAlgorithmClass;
    if (mv.cryptAlgorithmType)
        attrs["@_cryptAlgorithmType"] = mv.cryptAlgorithmType;
    if (mv.cryptAlgorithmSid !== undefined)
        attrs["@_cryptAlgorithmSid"] = String(mv.cryptAlgorithmSid);
    return attrs;
}
function presentationPrefix(rootKids) {
    const sldIdLst = (0, raw_xml_1.findChildByLocal)(rootKids, "sldIdLst");
    const tag = sldIdLst ? (0, raw_xml_1.getTagName)(sldIdLst) : "p:sldIdLst";
    const i = (tag ?? "p:sldIdLst").indexOf(":");
    return i < 0 ? "p:" : tag.slice(0, i + 1);
}
/** ECMA-376 §19.2.1.23 — align `<p:modifyVerifier>` with `pres.modifyVerifier`. */
function patchModifyVerifier(pres, archive, opts) {
    const source = pres.__source;
    const presPath = source?.presentationPath ?? "ppt/presentation.xml";
    const presBytes = archive.files.get(presPath);
    if (!presBytes)
        return;
    const presTree = (0, raw_xml_1.parseXmlPreserveOrder)((0, fflate_1.strFromU8)(presBytes));
    const presRoot = findRootElement(presTree, "presentation");
    if (!presRoot)
        return;
    const rootKids = (0, raw_xml_1.getChildren)(presRoot);
    const withoutMv = rootKids.filter((n) => (0, raw_xml_1.localName)((0, raw_xml_1.getTagName)(n) ?? "") !== "modifyVerifier");
    if (!pres.modifyVerifier) {
        if (withoutMv.length !== rootKids.length) {
            (0, raw_xml_1.setChildren)(presRoot, withoutMv);
            archive.files.set(presPath, (0, fflate_1.strToU8)((0, raw_xml_1.buildXml)(presTree)));
            if (opts.debug)
                console.log("[roundtrip] modifyVerifier removed");
        }
        return;
    }
    const prefix = presentationPrefix(withoutMv);
    const mvNode = {
        [`${prefix}modifyVerifier`]: [],
        ":@": modifyVerifierAttrs(pres.modifyVerifier),
    };
    const extIdx = withoutMv.findIndex((n) => (0, raw_xml_1.localName)((0, raw_xml_1.getTagName)(n) ?? "") === "extLst");
    const nextKids = extIdx >= 0
        ? [...withoutMv.slice(0, extIdx), mvNode, ...withoutMv.slice(extIdx)]
        : [...withoutMv, mvNode];
    (0, raw_xml_1.setChildren)(presRoot, nextKids);
    archive.files.set(presPath, (0, fflate_1.strToU8)((0, raw_xml_1.buildXml)(presTree)));
    if (opts.debug)
        console.log("[roundtrip] modifyVerifier patched");
}
