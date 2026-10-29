import { kinsokuSnapshot } from "@sliiu/present-core";
import { strFromU8, strToU8 } from "fflate";
import { buildXml, findChildByLocal, getChildren, getTagName, localName, parseXmlPreserveOrder, setChildren, } from "./raw-xml.js";
function findRootElement(tree, rootLocal) {
    for (const n of tree) {
        const tag = getTagName(n);
        if (tag && localName(tag) === rootLocal)
            return n;
    }
    return undefined;
}
function presentationPrefix(rootKids) {
    const sldIdLst = findChildByLocal(rootKids, "sldIdLst");
    const tag = sldIdLst ? getTagName(sldIdLst) : "p:sldIdLst";
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
export function patchKinsoku(pres, archive, opts) {
    const source = pres.__source;
    const nextSnap = kinsokuSnapshot(pres.kinsoku);
    const prevSnap = source?.kinsokuSnapshot ?? "";
    if (nextSnap === prevSnap)
        return;
    const presPath = source?.presentationPath ?? "ppt/presentation.xml";
    const presBytes = archive.files.get(presPath);
    if (!presBytes)
        return;
    const presTree = parseXmlPreserveOrder(strFromU8(presBytes));
    const presRoot = findRootElement(presTree, "presentation");
    if (!presRoot)
        return;
    const rootKids = getChildren(presRoot);
    const withoutK = rootKids.filter((n) => localName(getTagName(n) ?? "") !== "kinsoku");
    if (!pres.kinsoku) {
        if (withoutK.length !== rootKids.length) {
            setChildren(presRoot, withoutK);
            archive.files.set(presPath, strToU8(buildXml(presTree)));
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
    const extIdx = withoutK.findIndex((n) => localName(getTagName(n) ?? "") === "extLst");
    const nextKids = extIdx >= 0
        ? [...withoutK.slice(0, extIdx), kNode, ...withoutK.slice(extIdx)]
        : [...withoutK, kNode];
    setChildren(presRoot, nextKids);
    archive.files.set(presPath, strToU8(buildXml(presTree)));
    if (opts.debug)
        console.log("[roundtrip] kinsoku patched");
}
