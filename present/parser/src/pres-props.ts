import type { RelMap } from "./parts";
import { loadXmlPart } from "./parts";
import type { PptxArchive } from "./zip";
import type { ShowKind, ShowProperties, ShowSlideRange } from "@ppt/core";
import { boolish } from "./units";
import { attr, findAllByLocalName, findByLocalName, type XmlNode } from "./xml";

const TYPE_PRES_PROPS = "/presProps";
const SHOW_MEDIA_CTRLS_URI = "{2FDB2607-1784-4EEB-B798-7EB5836EED8A}";

function followPresPropsPath(rels: RelMap): string | undefined {
  for (const r of rels.list) {
    if (r.type.endsWith(TYPE_PRES_PROPS) || r.type.includes(TYPE_PRES_PROPS)) {
      return rels.resolve(r.id);
    }
  }
  return undefined;
}

function parsePenColor(pen: XmlNode | undefined): string | undefined {
  const srgb = findByLocalName(pen, "srgbClr");
  const hex = attr(srgb, "val");
  if (hex && /^[0-9A-Fa-f]{6}$/.test(hex)) return `#${hex.toUpperCase()}`;
  const prst = attr(findByLocalName(pen, "prstClr"), "val");
  if (prst === "red") return "#FF0000";
  if (prst === "black") return "#000000";
  if (prst === "white") return "#FFFFFF";
  return undefined;
}

function parseShowKind(showPr: XmlNode): { kind: ShowKind; browseShowScrollbar?: boolean } {
  if (findByLocalName(showPr, "kiosk")) return { kind: "kiosk" };
  const browse = findByLocalName(showPr, "browse");
  if (browse) {
    const sb = boolish(attr(browse, "showScrollbar"));
    return { kind: "browse", browseShowScrollbar: sb };
  }
  return { kind: "present" };
}

function parseSlides(showPr: XmlNode): ShowProperties["slides"] | { customShowId: number } {
  const rg = findByLocalName(showPr, "sldRg");
  if (rg) {
    const start = Number(attr(rg, "st") ?? "1");
    const end = Number(attr(rg, "end") ?? start);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      const range: ShowSlideRange = { start, end };
      return range;
    }
  }
  const cust = findByLocalName(showPr, "custShow");
  if (cust) {
    const id = Number(attr(cust, "id") ?? "0");
    if (Number.isFinite(id)) return { customShowId: id };
  }
  return "all";
}

function parseShowMediaControls(showPr: XmlNode): boolean | undefined {
  const extLst = findByLocalName(showPr, "extLst");
  if (!extLst) return undefined;
  for (const ext of findAllByLocalName(extLst, "ext")) {
    const uri = attr(ext, "uri") ?? "";
    const ctrls = findByLocalName(ext, "showMediaCtrls");
    if (ctrls || uri === SHOW_MEDIA_CTRLS_URI) {
      const v = boolish(attr(ctrls, "val"));
      return v ?? true;
    }
  }
  return undefined;
}

function parseShowPr(showPr: XmlNode): ShowProperties {
  const out: ShowProperties = {};
  const loop = boolish(attr(showPr, "loop"));
  out.loop = loop ?? false;
  const narr = boolish(attr(showPr, "showNarration"));
  out.showNarration = narr ?? true;
  const anim = boolish(attr(showPr, "showAnimation"));
  out.showAnimation = anim ?? true;
  const timings = boolish(attr(showPr, "useTimings"));
  out.useTimings = timings ?? true;
  const { kind, browseShowScrollbar } = parseShowKind(showPr);
  out.kind = kind;
  if (browseShowScrollbar !== undefined) out.browseShowScrollbar = browseShowScrollbar;
  const slides = parseSlides(showPr);
  if (slides && typeof slides === "object" && "customShowId" in slides) {
    out.customShowId = slides.customShowId;
    out.slides = "all";
  } else {
    out.slides = slides as ShowProperties["slides"];
  }
  const pen = parsePenColor(findByLocalName(showPr, "penClr"));
  if (pen) out.penColor = pen;
  const media = parseShowMediaControls(showPr);
  if (media !== undefined) out.showMediaControls = media;
  else out.showMediaControls = true;
  return out;
}

/** ECMA-376 §19.2.2 `ppt/presProps.xml` — 放映方式。 */
export function parseShowProperties(
  archive: PptxArchive,
  presRels: RelMap,
): { showPr?: ShowProperties; presPropsPartPath?: string } {
  const path = followPresPropsPath(presRels);
  if (!path) return {};
  const xml = loadXmlPart(archive, path);
  const root = findByLocalName(xml, "presentationPr");
  const showEl = findByLocalName(root, "showPr");
  if (!showEl) return { presPropsPartPath: path };
  return { showPr: parseShowPr(showEl), presPropsPartPath: path };
}
