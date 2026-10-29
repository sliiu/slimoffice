import type { DrawingGuide, Presentation, PresentationSource, ViewGuides } from "@ppt/core";
import { pxToGuidePos, viewGuidesHasContent, viewGuidesSnapshot } from "@ppt/core";
import { strFromU8, strToU8 } from "fflate";
import { esc, pxToEmu, xmlHeader } from "./xml-util";

export const REL_TYPE_VIEW_PROPS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps";
export const CT_VIEW_PROPS =
  "application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml";

const PML =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

type MutableArchive = { files: Map<string, Uint8Array> };

function boolAttr(v: boolean | undefined): string {
  if (v === undefined) return "";
  return v ? "1" : "0";
}

function renderGuideLst(guides: DrawingGuide[] | undefined): string {
  const rows = (guides ?? [])
    .map((g) => {
      const pos = pxToGuidePos(g.pos);
      return g.orient === "horz"
        ? `<p:guide orient="horz" pos="${pos}"/>`
        : `<p:guide pos="${pos}"/>`;
    })
    .join("");
  return `<p:guideLst>${rows}</p:guideLst>`;
}

function cSldViewPrOpen(g: ViewGuides | undefined): string {
  const parts: string[] = [];
  const snap = boolAttr(g?.snapToGrid);
  const objs = boolAttr(g?.snapToObjects);
  const show = boolAttr(g?.showGuides);
  if (snap) parts.push(`snapToGrid="${snap}"`);
  if (objs) parts.push(`snapToObjects="${objs}"`);
  if (show) parts.push(`showGuides="${show}"`);
  return parts.length ? `<p:cSldViewPr ${parts.join(" ")}>` : "<p:cSldViewPr>";
}

function gridSpacingXml(g: ViewGuides | undefined): string {
  if (!g?.gridSpacing) return "";
  return `<p:gridSpacing cx="${pxToEmu(g.gridSpacing.x)}" cy="${pxToEmu(g.gridSpacing.y)}"/>`;
}

function defaultCViewPr(): string {
  return `<p:cViewPr><p:scale><a:sx n="100" d="100"/><a:sy n="100" d="100"/></p:scale><p:origin x="0" y="0"/></p:cViewPr>`;
}

export function renderViewPropsXml(g: ViewGuides): string {
  const notesLst = g.notes?.length
    ? `<p:notesViewPr><p:cSldViewPr>${defaultCViewPr()}${renderGuideLst(g.notes)}</p:cSldViewPr></p:notesViewPr>`
    : "";
  return `${xmlHeader()}
<p:viewPr ${PML} lastView="sldView">
  <p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr>
  <p:slideViewPr>${cSldViewPrOpen(g)}${defaultCViewPr()}${renderGuideLst(g.slide)}</p:cSldViewPr></p:slideViewPr>
  <p:outlineViewPr>${defaultCViewPr()}</p:outlineViewPr>
  <p:notesTextViewPr>${defaultCViewPr()}</p:notesTextViewPr>
  <p:sorterViewPr>${defaultCViewPr()}</p:sorterViewPr>
  ${notesLst}
  ${gridSpacingXml(g)}
</p:viewPr>`;
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

function ensureViewPropsPart(
  archive: MutableArchive,
  xml: string,
  presSrc?: PresentationSource,
): void {
  const path = presSrc?.viewPropsPartPath ?? "ppt/viewProps.xml";
  archive.files.set(path, strToU8(xml));
  const relsPath = "ppt/_rels/presentation.xml.rels";
  const relsXml = archive.files.has(relsPath) ? strFromU8(archive.files.get(relsPath)!) : "";
  if (!relsXml.includes(`Type="${REL_TYPE_VIEW_PROPS}"`)) {
    const relId = allocRelId(relsXml);
    archive.files.set(relsPath, strToU8(insertRel(relsXml, relId, REL_TYPE_VIEW_PROPS, "viewProps.xml")));
  }
  const ctPath = "[Content_Types].xml";
  const ctBytes = archive.files.get(ctPath);
  if (ctBytes) {
    archive.files.set(ctPath, strToU8(insertContentTypeOverride(strFromU8(ctBytes), `/${path}`, CT_VIEW_PROPS)));
  }
  if (presSrc) presSrc.viewPropsPartPath = path;
}

function patchSlideViewSection(xml: string, g: ViewGuides): string {
  const start = xml.indexOf("<p:slideViewPr");
  const end = xml.indexOf("</p:slideViewPr>");
  if (start < 0 || end < 0 || end < start) {
    const block = `<p:slideViewPr>${cSldViewPrOpen(g)}${defaultCViewPr()}${renderGuideLst(g.slide)}</p:cSldViewPr></p:slideViewPr>`;
    return xml.replace(/<\/p:viewPr>/, `${block}</p:viewPr>`);
  }
  let section = xml.slice(start, end + "</p:slideViewPr>".length);
  section = section.replace(/<p:cSldViewPr\b[^>]*>/, cSldViewPrOpen(g));
  if (/<p:guideLst\b/.test(section)) {
    section = section.replace(/<p:guideLst\b[^>]*\/>/, renderGuideLst(g.slide));
    section = section.replace(/<p:guideLst\b[\s\S]*?<\/p:guideLst>/, renderGuideLst(g.slide));
  } else if (section.includes("</p:cSldViewPr>")) {
    section = section.replace("</p:cSldViewPr>", `${renderGuideLst(g.slide)}</p:cSldViewPr>`);
  }
  if (g.gridSpacing) {
    const grid = gridSpacingXml(g);
    if (/<p:gridSpacing\b/.test(xml)) {
      xml = xml.replace(/<p:gridSpacing\b[^/]*\/>/, grid);
    } else {
      xml = xml.replace(/<\/p:viewPr>/, `${grid}</p:viewPr>`);
    }
  }
  return xml.slice(0, start) + section + xml.slice(end + "</p:slideViewPr>".length);
}

/** from-scratch：把 `pres.viewGuides` 写成 `ppt/viewProps.xml`。 */
export function injectScratchViewProps(pres: Presentation, files: Record<string, string>): void {
  if (!viewGuidesHasContent(pres.viewGuides)) return;
  const path = "ppt/viewProps.xml";
  files[path] = renderViewPropsXml(pres.viewGuides!);
  const relsPath = "ppt/_rels/presentation.xml.rels";
  const relId = allocRelId(files[relsPath] ?? "");
  files[relsPath] = insertRel(files[relsPath] ?? "", relId, REL_TYPE_VIEW_PROPS, "viewProps.xml");
  files["[Content_Types].xml"] = insertContentTypeOverride(
    files["[Content_Types].xml"] ?? "",
    `/${path}`,
    CT_VIEW_PROPS,
  );
}

/** round-trip：仅当参考线 / 网格开关相对解析快照有改动时 patch viewProps。 */
export function patchViewProps(
  pres: Presentation,
  archive: MutableArchive,
  opts: { debug?: boolean } = {},
): void {
  const presSrc = pres.__source as PresentationSource | undefined;
  const nextSnap = viewGuidesSnapshot(pres.viewGuides);
  const prevSnap = presSrc?.viewGuidesSnapshot ?? "";
  if (nextSnap === prevSnap) return;

  if (!viewGuidesHasContent(pres.viewGuides)) {
    return;
  }

  const path = presSrc?.viewPropsPartPath ?? "ppt/viewProps.xml";
  const existing = archive.files.get(path);
  if (!existing) {
    ensureViewPropsPart(archive, renderViewPropsXml(pres.viewGuides!), presSrc);
  } else {
    const patched = patchSlideViewSection(strFromU8(existing), pres.viewGuides!);
    archive.files.set(path, strToU8(patched));
  }
  if (opts.debug) console.log(`[roundtrip] ${path} view guides patched`);
}
