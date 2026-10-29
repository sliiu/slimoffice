import type { PhotoAlbum, Presentation, PresentationSource } from "@ppt/core";
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

function photoAlbumSnapshot(album: PhotoAlbum | undefined): string {
  if (!album) return "";
  return JSON.stringify(album);
}

function photoAlbumAttrs(album: PhotoAlbum): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (album.bw) attrs["@_bw"] = "1";
  if (album.showCaptions) attrs["@_showCaptions"] = "1";
  if (album.layout) attrs["@_layout"] = album.layout;
  if (album.frame) attrs["@_frame"] = album.frame;
  return attrs;
}

/** ECMA-376 §19.2.1.27 — align `<p:photoAlbum>` on presentation.xml with `pres.photoAlbum`. */
export function patchPhotoAlbum(
  pres: Presentation,
  archive: MutableArchive,
  opts: RoundTripOptions,
): void {
  const source = pres.__source as PresentationSource | undefined;
  if (photoAlbumSnapshot(pres.photoAlbum) === (source?.photoAlbumSnapshot ?? "")) return;
  if (pres.photoAlbum === undefined) return;

  const presPath = source?.presentationPath ?? "ppt/presentation.xml";
  const presBytes = archive.files.get(presPath);
  if (!presBytes) return;

  const presTree = parseXmlPreserveOrder(strFromU8(presBytes));
  const presRoot = findRootElement(presTree, "presentation");
  if (!presRoot) return;

  const rootKids = getChildren(presRoot);
  const withoutPa = rootKids.filter((n) => localName(getTagName(n) ?? "") !== "photoAlbum");

  const sldIdLst = findChildByLocal(rootKids, "sldIdLst");
  const prefix = (() => {
    const tag = sldIdLst ? getTagName(sldIdLst) : "p:sldIdLst";
    const i = (tag ?? "p:sldIdLst").indexOf(":");
    return i < 0 ? "p:" : tag!.slice(0, i + 1);
  })();

  const paNode = {
    [`${prefix}photoAlbum`]: [],
    ":@": photoAlbumAttrs(pres.photoAlbum),
  };

  const insertAfter = sldIdLst ? rootKids.indexOf(sldIdLst) : -1;
  const nextKids =
    insertAfter >= 0
      ? [...withoutPa.slice(0, insertAfter + 1), paNode, ...withoutPa.slice(insertAfter + 1)]
      : [...withoutPa, paNode];

  setChildren(presRoot, nextKids);
  archive.files.set(presPath, strToU8(buildXml(presTree)));
  if (opts.debug) console.log("[roundtrip] photoAlbum patched");
}
