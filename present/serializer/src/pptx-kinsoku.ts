import type { Kinsoku, Presentation, PresentationSource } from "@ppt/core";
import { kinsokuSnapshot } from "@ppt/core";
import { strFromU8, strToU8 } from "fflate";
import type { RoundTripOptions } from "./pptx-roundtrip";
import {
  buildXml,
  findChildByLocal,
  getChildren,
  getTagName,
  localName,
  parseXmlPreserveOrder,
  setChildren,
  type RawNode,
  type RawTree,
} from "./raw-xml";

type MutableArchive = { files: Map<string, Uint8Array> };

function findRootElement(tree: RawTree, rootLocal: string): RawNode | undefined {
  for (const n of tree) {
    const tag = getTagName(n);
    if (tag && localName(tag) === rootLocal) return n;
  }
  return undefined;
}

function presentationPrefix(rootKids: RawNode[]): string {
  const sldIdLst = findChildByLocal(rootKids, "sldIdLst");
  const tag = sldIdLst ? getTagName(sldIdLst) : "p:sldIdLst";
  const i = (tag ?? "p:sldIdLst").indexOf(":");
  return i < 0 ? "p:" : tag!.slice(0, i + 1);
}

function kinsokuAttrs(k: Kinsoku): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (k.lang) attrs["@_lang"] = k.lang;
  if (k.invalStChars) attrs["@_invalStChars"] = k.invalStChars;
  if (k.invalEndChars) attrs["@_invalEndChars"] = k.invalEndChars;
  return attrs;
}

/** ECMA-376 §19.2.1.20 — align `<p:kinsoku>` on presentation.xml with `pres.kinsoku`. */
export function patchKinsoku(
  pres: Presentation,
  archive: MutableArchive,
  opts: RoundTripOptions,
): void {
  const source = pres.__source as PresentationSource | undefined;
  const nextSnap = kinsokuSnapshot(pres.kinsoku);
  const prevSnap = source?.kinsokuSnapshot ?? "";
  if (nextSnap === prevSnap) return;

  const presPath = source?.presentationPath ?? "ppt/presentation.xml";
  const presBytes = archive.files.get(presPath);
  if (!presBytes) return;

  const presTree = parseXmlPreserveOrder(strFromU8(presBytes));
  const presRoot = findRootElement(presTree, "presentation");
  if (!presRoot) return;

  const rootKids = getChildren(presRoot);
  const withoutK = rootKids.filter((n) => localName(getTagName(n) ?? "") !== "kinsoku");

  if (!pres.kinsoku) {
    if (withoutK.length !== rootKids.length) {
      setChildren(presRoot, withoutK);
      archive.files.set(presPath, strToU8(buildXml(presTree)));
      if (opts.debug) console.log("[roundtrip] kinsoku removed");
    }
    return;
  }

  const prefix = presentationPrefix(withoutK);
  const kNode = {
    [`${prefix}kinsoku`]: [],
    ":@": kinsokuAttrs(pres.kinsoku),
  };

  const extIdx = withoutK.findIndex((n) => localName(getTagName(n) ?? "") === "extLst");
  const nextKids =
    extIdx >= 0
      ? [...withoutK.slice(0, extIdx), kNode, ...withoutK.slice(extIdx)]
      : [...withoutK, kNode];

  setChildren(presRoot, nextKids);
  archive.files.set(presPath, strToU8(buildXml(presTree)));
  if (opts.debug) console.log("[roundtrip] kinsoku patched");
}
