import type { Presentation, PresentationSource } from "@ppt/core";
import { strFromU8, strToU8 } from "fflate";
import type { RoundTripOptions } from "./pptx-roundtrip";
import {
  DeckEmbeddedFontRegistry,
  embeddedFontsChanged,
  FONT_REL_TYPE,
  groupEmbeddedFontsForExport,
  renderEmbeddedFontLst,
  type EmbeddedFontListItem,
} from "./embedded-font-export";

type MutableArchive = { files: Map<string, Uint8Array> };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeContentTypesOverride(archive: MutableArchive, partName: string): void {
  const ctPath = "[Content_Types].xml";
  const bytes = archive.files.get(ctPath);
  if (!bytes) return;
  const xml = strFromU8(bytes);
  const re = new RegExp(`<Override PartName="${escapeRegExp(partName)}"[^>]*/>`);
  if (!re.test(xml)) return;
  archive.files.set(ctPath, strToU8(xml.replace(re, "")));
}

function appendContentTypesOverride(archive: MutableArchive, partName: string, contentType: string): void {
  const ctPath = "[Content_Types].xml";
  const bytes = archive.files.get(ctPath);
  if (!bytes) return;
  const xml = strFromU8(bytes);
  if (xml.includes(`PartName="${partName}"`)) return;
  const insertion = `<Override PartName="${partName}" ContentType="${contentType}"/>`;
  archive.files.set(ctPath, strToU8(xml.replace(/<\/Types>/, `${insertion}</Types>`)));
}

function removeFontParts(archive: MutableArchive): void {
  for (const path of [...archive.files.keys()]) {
    if (/^ppt\/fonts\/.*\.fntdata$/.test(path)) {
      archive.files.delete(path);
      removeContentTypesOverride(archive, `/${path}`);
    }
  }
}

function patchEmbeddedFontLstNode(
  presPath: string,
  archive: MutableArchive,
  lstXml: string,
): void {
  const presBytes = archive.files.get(presPath);
  if (!presBytes) return;
  let xml = strFromU8(presBytes);
  xml = xml.replace(/<p:embeddedFontLst>[\s\S]*?<\/p:embeddedFontLst>\s*/g, "");
  if (lstXml) {
    xml = xml.replace(/<p:sldSz/, `${lstXml}\n  <p:sldSz`);
  }
  archive.files.set(presPath, strToU8(xml));
}

function patchPresentationFontRels(archive: MutableArchive, fontItems: EmbeddedFontListItem[]): void {
  const relsPath = "ppt/_rels/presentation.xml.rels";
  const bytes = archive.files.get(relsPath);
  if (!bytes) return;
  const fontRelRe = new RegExp(
    `<Relationship[^>]*Type="${escapeRegExp(FONT_REL_TYPE)}"[^>]*/>`,
    "g",
  );
  let xml = strFromU8(bytes).replace(fontRelRe, "");
  if (fontItems.length) {
    const inserts = fontItems
      .map(
        (f) =>
          `<Relationship Id="${f.relId}" Type="${FONT_REL_TYPE}" Target="fonts/${f.name}"/>`,
      )
      .join("");
    xml = xml.replace(/<\/Relationships>/, `${inserts}</Relationships>`);
  }
  archive.files.set(relsPath, strToU8(xml));
}

/** ECMA-376 §15.2.13 — align embeddedFontLst + ppt/fonts/*.fntdata when `pres.fonts` changed. */
export function patchEmbeddedFonts(
  pres: Presentation,
  archive: MutableArchive,
  opts: RoundTripOptions,
): void {
  const source = pres.__source as PresentationSource | undefined;
  if (!embeddedFontsChanged(pres.fonts, source?.fontsSnapshot)) return;

  const presPath = source?.presentationPath ?? "ppt/presentation.xml";
  removeFontParts(archive);

  const groups = groupEmbeddedFontsForExport(pres.fonts ?? []);
  if (!groups.length) {
    patchEmbeddedFontLstNode(presPath, archive, "");
    patchPresentationFontRels(archive, []);
    if (opts.debug) console.log("[roundtrip] embedded fonts cleared");
    return;
  }

  const deckFonts = new DeckEmbeddedFontRegistry();
  const fontTable = deckFonts.createPartTable();
  const lstXml = renderEmbeddedFontLst(groups, fontTable);
  const fontItems = fontTable.list();

  for (const { name, bytes } of deckFonts.fileEntries()) {
    const partPath = `ppt/fonts/${name}`;
    archive.files.set(partPath, bytes);
    appendContentTypesOverride(archive, `/${partPath}`, "application/x-fontdata");
  }

  patchEmbeddedFontLstNode(presPath, archive, lstXml);
  patchPresentationFontRels(archive, fontItems);
  if (opts.debug) {
    console.log(`[roundtrip] embedded fonts patched (${fontItems.length} part(s), ${groups.length} family group(s))`);
  }
}
