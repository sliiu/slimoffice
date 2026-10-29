import type { BuildSpec } from "@ppt/core";
import { attr, findByLocalName, orderedChildren, stripNs, type XmlNode } from "./xml";

export function parseBuildList(timingEl: XmlNode | undefined): BuildSpec[] {
  if (!timingEl) return [];
  const bldLst = findByLocalName(timingEl, "bldLst");
  if (!bldLst) return [];
  const out: BuildSpec[] = [];
  for (const c of orderedChildren(bldLst)) {
    const local = stripNs(c.tag);
    const node = c.node;
    const spId = attr(node, "spid");
    if (!spId) continue;
    const grpIdRaw = attr(node, "grpId");
    const grpId = grpIdRaw ? Number(grpIdRaw) : undefined;
    // §19.5.3 animBg / autoUpdateAnimBg / rev：xsd:boolean，PowerPoint 写 "1"/"true"/"0"。
    const animBg = attr(node, "animBg") === "1" || attr(node, "animBg") === "true";
    const autoUpdate =
      attr(node, "autoUpdateAnimBg") === "1" || attr(node, "autoUpdateAnimBg") === "true";
    const rev = attr(node, "rev") === "1" || attr(node, "rev") === "true";
    const uiExpand = attr(node, "uiExpand") === "1" || attr(node, "uiExpand") === "true";
    const bldLvlRaw = attr(node, "bldLvl");
    const bldLvl = bldLvlRaw ? Number(bldLvlRaw) : undefined;
    const build = attr(node, "build");
    const shapeId = `sp_${spId}`;
    if (local === "bldP") {
      out.push({
        kind: "para",
        shapeId,
        grpId,
        build: build ?? "p",
        bldLvl,
        animBg,
        autoUpdateAnimBg: autoUpdate,
        rev,
        uiExpand,
      });
    } else if (local === "bldDgm") {
      out.push({ kind: "diagram", shapeId, grpId, build: build ?? "allAtOnce" });
    } else if (local === "bldChart") {
      out.push({ kind: "chart", shapeId, grpId, build: build ?? "allAtOnce", animBg });
    } else if (local === "bldGraphic") {
      out.push({ kind: "graphic", shapeId, grpId, build: build ?? "allAtOnce" });
    } else if (local === "bldOleChart") {
      out.push({ kind: "ole", shapeId, grpId, build: build ?? "allAtOnce" });
    }
  }
  return out;
}
