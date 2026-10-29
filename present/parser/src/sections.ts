// PowerPoint 2010+ `<p14:sectionLst>` → `pres.sections`。
import type { DeckSection } from "@ppt/core";
import { normalizeDeckSections } from "@ppt/core";
import { attr, findAllByLocalName, findByLocalName, type XmlNode } from "./xml";

export const SECTION_LST_URI = "{521415D9-36F7-43E2-AB2F-B90AF26B5E84}";

export function parsePresentationSectionLst(
  presEl: XmlNode | undefined,
  slideCount: number,
): DeckSection[] {
  if (!presEl) return [];
  const sldIdLst = findByLocalName(presEl, "sldIdLst");
  const sldIdNodes = findAllByLocalName(sldIdLst, "sldId");
  const indexBySldId = new Map<number, number>();
  sldIdNodes.forEach((n, i) => {
    const id = Number(attr(n, "id"));
    if (Number.isFinite(id) && !indexBySldId.has(id)) indexBySldId.set(id, i);
  });

  const extLst = findByLocalName(presEl, "extLst");
  let sectionLst: XmlNode | undefined;
  for (const ext of findAllByLocalName(extLst, "ext")) {
    if (attr(ext, "uri") === SECTION_LST_URI) {
      sectionLst = findByLocalName(ext, "sectionLst");
      break;
    }
  }
  if (!sectionLst) return [];

  const out: DeckSection[] = [];
  for (const sec of findAllByLocalName(sectionLst, "section")) {
    const name = (attr(sec, "name") ?? "").trim();
    const id = (attr(sec, "id") ?? "").trim();
    if (!name) continue;
    const ids = findAllByLocalName(findByLocalName(sec, "sldIdLst"), "sldId");
    let start = Number.POSITIVE_INFINITY;
    for (const n of ids) {
      const sid = Number(attr(n, "id"));
      const idx = indexBySldId.get(sid);
      if (idx !== undefined && idx < start) start = idx;
    }
    if (!Number.isFinite(start)) continue;
    out.push({
      id: id || `sec_${start}`,
      name,
      startIndex: start,
    });
  }
  return normalizeDeckSections(out, slideCount);
}
