"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchPhotoAlbum = patchPhotoAlbum;
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
function photoAlbumSnapshot(album) {
    if (!album)
        return "";
    return JSON.stringify(album);
}
function photoAlbumAttrs(album) {
    const attrs = {};
    if (album.bw)
        attrs["@_bw"] = "1";
    if (album.showCaptions)
        attrs["@_showCaptions"] = "1";
    if (album.layout)
        attrs["@_layout"] = album.layout;
    if (album.frame)
        attrs["@_frame"] = album.frame;
    return attrs;
}
/** ECMA-376 §19.2.1.27 — align `<p:photoAlbum>` on presentation.xml with `pres.photoAlbum`. */
function patchPhotoAlbum(pres, archive, opts) {
    const source = pres.__source;
    if (photoAlbumSnapshot(pres.photoAlbum) === (source?.photoAlbumSnapshot ?? ""))
        return;
    if (pres.photoAlbum === undefined)
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
    const withoutPa = rootKids.filter((n) => (0, raw_xml_1.localName)((0, raw_xml_1.getTagName)(n) ?? "") !== "photoAlbum");
    const sldIdLst = (0, raw_xml_1.findChildByLocal)(rootKids, "sldIdLst");
    const prefix = (() => {
        const tag = sldIdLst ? (0, raw_xml_1.getTagName)(sldIdLst) : "p:sldIdLst";
        const i = (tag ?? "p:sldIdLst").indexOf(":");
        return i < 0 ? "p:" : tag.slice(0, i + 1);
    })();
    const paNode = {
        [`${prefix}photoAlbum`]: [],
        ":@": photoAlbumAttrs(pres.photoAlbum),
    };
    const insertAfter = sldIdLst ? rootKids.indexOf(sldIdLst) : -1;
    const nextKids = insertAfter >= 0
        ? [...withoutPa.slice(0, insertAfter + 1), paNode, ...withoutPa.slice(insertAfter + 1)]
        : [...withoutPa, paNode];
    (0, raw_xml_1.setChildren)(presRoot, nextKids);
    archive.files.set(presPath, (0, fflate_1.strToU8)((0, raw_xml_1.buildXml)(presTree)));
    if (opts.debug)
        console.log("[roundtrip] photoAlbum patched");
}
