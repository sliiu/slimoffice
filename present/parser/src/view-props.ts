import type { DrawingGuide, ViewGuides } from "@ppt/core";
import { guidePosToPx } from "@ppt/core";
import { boolish, emuToPx } from "./units";
import { attr, findAllByLocalName, findByLocalName, type XmlNode } from "./xml";
import { loadXmlPart, type RelMap } from "./parts";
import type { PptxArchive } from "./zip";

const TYPE_VIEW_PROPS = "/viewProps";

function followViewPropsPath(rels: RelMap): string | undefined {
  for (const r of rels.list) {
    if (r.type.endsWith(TYPE_VIEW_PROPS) || r.type.includes(TYPE_VIEW_PROPS)) {
      return rels.resolve(r.id);
    }
  }
  return undefined;
}

function parseGuideLst(lst: XmlNode | undefined): DrawingGuide[] {
  if (!lst) return [];
  const out: DrawingGuide[] = [];
  for (const g of findAllByLocalName(lst, "guide")) {
    const posRaw = attr(g, "pos");
    const pos = posRaw !== undefined ? Number(posRaw) : 0;
    if (!Number.isFinite(pos)) continue;
    const orient = attr(g, "orient") === "horz" ? "horz" : "vert";
    out.push({ orient, pos: guidePosToPx(pos) });
  }
  return out;
}

function parseCSldView(viewPr: XmlNode | undefined, local: string): {
  guides: DrawingGuide[];
  showGuides?: boolean;
  snapToGrid?: boolean;
  snapToObjects?: boolean;
} {
  const view = findByLocalName(viewPr, local);
  const cSld = findByLocalName(view, "cSldViewPr");
  const guides = parseGuideLst(findByLocalName(cSld, "guideLst"));
  const showGuides = boolish(attr(cSld, "showGuides"));
  const snapToGrid = boolish(attr(cSld, "snapToGrid"));
  const snapToObjects = boolish(attr(cSld, "snapToObjects"));
  return { guides, showGuides, snapToGrid, snapToObjects };
}

/** ECMA-376 §19.2.2 `ppt/viewProps.xml` — 幻灯片/备注视图参考线与网格。 */
export function parseViewGuides(
  archive: PptxArchive,
  presRels: RelMap,
): { viewGuides?: ViewGuides; viewPropsPartPath?: string } {
  const path = followViewPropsPath(presRels);
  if (!path) return {};
  const xml = loadXmlPart(archive, path);
  const viewPr = findByLocalName(xml, "viewPr");
  if (!viewPr) return { viewPropsPartPath: path };

  const slide = parseCSldView(viewPr, "slideViewPr");
  const notes = parseCSldView(viewPr, "notesViewPr");
  const gridEl = findByLocalName(viewPr, "gridSpacing");
  const gx = emuToPx(attr(gridEl, "cx"));
  const gy = emuToPx(attr(gridEl, "cy"));

  const out: ViewGuides = { slide: slide.guides };
  if (notes.guides.length) out.notes = notes.guides;
  if (slide.showGuides !== undefined) out.showGuides = slide.showGuides;
  if (slide.snapToGrid !== undefined) out.snapToGrid = slide.snapToGrid;
  if (slide.snapToObjects !== undefined) out.snapToObjects = slide.snapToObjects;
  if (gx > 0 || gy > 0) out.gridSpacing = { x: gx || gy, y: gy || gx };
  return { viewGuides: out, viewPropsPartPath: path };
}
