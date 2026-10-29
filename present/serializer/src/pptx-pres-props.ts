import type { Presentation, PresentationSource, ShowProperties } from "@ppt/core";
import { showPropertiesHasContent, showPropertiesSnapshot } from "@ppt/core";
import { strFromU8, strToU8 } from "fflate";
import { esc, xmlHeader } from "./xml-util";

export const REL_TYPE_PRES_PROPS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps";
export const CT_PRES_PROPS =
  "application/vnd.openxmlformats-officedocument.presentationml.presProps+xml";

const PML =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const P14 = "http://schemas.microsoft.com/office/powerpoint/2010/main";
const SHOW_MEDIA_CTRLS_URI = "{2FDB2607-1784-4EEB-B798-7EB5836EED8A}";

type MutableArchive = { files: Map<string, Uint8Array> };

function bool01(v: boolean | undefined, fallback: boolean): "0" | "1" {
  return (v ?? fallback) ? "1" : "0";
}

function showKindXml(s: ShowProperties): string {
  if (s.kind === "kiosk") return "<p:kiosk/>";
  if (s.kind === "browse") {
    const sb = s.browseShowScrollbar === false ? ' showScrollbar="0"' : "";
    return `<p:browse${sb}/>`;
  }
  return "<p:present/>";
}

function slidesXml(s: ShowProperties): string {
  if (s.customShowId !== undefined) return `<p:custShow id="${s.customShowId}"/>`;
  if (s.slides && s.slides !== "all") {
    return `<p:sldRg st="${s.slides.start}" end="${s.slides.end}"/>`;
  }
  return "<p:sldAll/>";
}

function penClrXml(s: ShowProperties): string {
  const hex = (s.penColor ?? "#FF0000").replace(/^#/, "").toUpperCase();
  return `<p:penClr><a:srgbClr val="${esc(hex)}"/></p:penClr>`;
}

function mediaCtrlsExt(s: ShowProperties): string {
  const val = bool01(s.showMediaControls, true);
  return `<p:ext uri="${SHOW_MEDIA_CTRLS_URI}"><p14:showMediaCtrls xmlns:p14="${P14}" val="${val}"/></p:ext>`;
}

function mergeExtLst(existing: string | undefined, s: ShowProperties): string {
  let ext = existing ?? "";
  if (/showMediaCtrls/.test(ext)) {
    ext = ext.replace(
      /<p14:showMediaCtrls\b[^>]*(?:\/>|>\s*<\/p14:showMediaCtrls>)/,
      `<p14:showMediaCtrls xmlns:p14="${P14}" val="${bool01(s.showMediaControls, true)}"/>`,
    );
  } else if (/<\/p:extLst>/.test(ext)) {
    ext = ext.replace("</p:extLst>", `${mediaCtrlsExt(s)}</p:extLst>`);
  } else {
    ext = `<p:extLst>${mediaCtrlsExt(s)}</p:extLst>`;
  }
  return ext;
}

export function renderShowPrXml(s: ShowProperties, existingExtLst?: string): string {
  const attrs = [
    `loop="${bool01(s.loop, false)}"`,
    `showNarration="${bool01(s.showNarration, true)}"`,
    `showAnimation="${bool01(s.showAnimation, true)}"`,
    `useTimings="${bool01(s.useTimings, true)}"`,
  ].join(" ");
  return `<p:showPr ${attrs}>${showKindXml(s)}${slidesXml(s)}${penClrXml(s)}${mergeExtLst(existingExtLst, s)}</p:showPr>`;
}

export function renderPresPropsXml(s: ShowProperties): string {
  return `${xmlHeader()}
<p:presentationPr ${PML}>${renderShowPrXml(s)}</p:presentationPr>`;
}

function allocRelId(relsXml: string): string {
  const used = new Set<string>();
  for (const m of relsXml.matchAll(/Id="([^"]+)"/g)) used.add(m[1]!);
  let n = 1;
  while (used.has(`rId${n}`)) n++;
  return `rId${n}`;
}

function insertRel(relsXml: string, relId: string, type: string, target: string): string {
  if (relsXml.includes(`Type="${type}"`)) return relsXml;
  const rel = `<Relationship Id="${relId}" Type="${type}" Target="${target}"/>`;
  if (!relsXml) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rel}
</Relationships>`;
  }
  return relsXml.replace(/<\/Relationships>/, `${rel}</Relationships>`);
}

function insertContentTypeOverride(ctXml: string, partName: string, contentType: string): string {
  if (ctXml.includes(`PartName="${partName}"`)) return ctXml;
  const row = `<Override PartName="${partName}" ContentType="${esc(contentType)}"/>`;
  if (!ctXml.includes("</Types>")) return ctXml;
  return ctXml.replace("</Types>", `${row}</Types>`);
}

function ensurePresPropsPart(archive: MutableArchive, xml: string, presSrc?: PresentationSource): void {
  const path = presSrc?.presPropsPartPath ?? "ppt/presProps.xml";
  archive.files.set(path, strToU8(xml));
  const relsPath = "ppt/_rels/presentation.xml.rels";
  const relsXml = archive.files.has(relsPath) ? strFromU8(archive.files.get(relsPath)!) : "";
  if (!relsXml.includes(`Type="${REL_TYPE_PRES_PROPS}"`)) {
    const relId = allocRelId(relsXml);
    archive.files.set(relsPath, strToU8(insertRel(relsXml, relId, REL_TYPE_PRES_PROPS, "presProps.xml")));
  }
  const ctPath = "[Content_Types].xml";
  const ctBytes = archive.files.get(ctPath);
  if (ctBytes) {
    archive.files.set(ctPath, strToU8(insertContentTypeOverride(strFromU8(ctBytes), `/${path}`, CT_PRES_PROPS)));
  }
  if (presSrc) presSrc.presPropsPartPath = path;
}

function patchShowPrInXml(xml: string, s: ShowProperties): string {
  const m = xml.match(/<p:showPr\b[\s\S]*?<\/p:showPr>/);
  const ext = m?.[0]?.match(/<p:extLst>[\s\S]*?<\/p:extLst>/)?.[0];
  const next = renderShowPrXml(s, ext);
  if (m) return xml.replace(m[0], next);
  return xml.replace(/<p:presentationPr([^>]*)>/, `<p:presentationPr$1>${next}`);
}

export function injectScratchPresProps(pres: Presentation, files: Record<string, string>): void {
  if (!showPropertiesHasContent(pres.showPr)) return;
  const path = "ppt/presProps.xml";
  files[path] = renderPresPropsXml(pres.showPr!);
  const relsPath = "ppt/_rels/presentation.xml.rels";
  const relId = allocRelId(files[relsPath] ?? "");
  files[relsPath] = insertRel(files[relsPath] ?? "", relId, REL_TYPE_PRES_PROPS, "presProps.xml");
  files["[Content_Types].xml"] = insertContentTypeOverride(
    files["[Content_Types].xml"] ?? "",
    `/${path}`,
    CT_PRES_PROPS,
  );
}

export function patchPresProps(
  pres: Presentation,
  archive: MutableArchive,
  opts: { debug?: boolean } = {},
): void {
  const presSrc = pres.__source as PresentationSource | undefined;
  const nextSnap = showPropertiesSnapshot(pres.showPr);
  const prevSnap = presSrc?.showPrSnapshot ?? "";
  if (nextSnap === prevSnap) return;
  if (!showPropertiesHasContent(pres.showPr)) return;

  const path = presSrc?.presPropsPartPath ?? "ppt/presProps.xml";
  const existing = archive.files.get(path);
  if (!existing) {
    ensurePresPropsPart(archive, renderPresPropsXml(pres.showPr!), presSrc);
  } else {
    archive.files.set(path, strToU8(patchShowPrInXml(strFromU8(existing), pres.showPr!)));
  }
  if (opts.debug) console.log(`[roundtrip] ${path} showPr patched`);
}
