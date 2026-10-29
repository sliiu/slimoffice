// SmartArt 写出：ECMA-376 §21.4 diagram + Office drawing 扩展。
//
// 内存 IR 仍是 group + smartArtMeta（编辑器按卡片改文本）。序列化时写成
// `<p:graphicFrame>` + `dgm:relIds`，并产出 data/layout/colors/quickStyle/drawing
// 五件套。PowerPoint / WPS 把它当 SmartArt 对象打开；我们自己再 parse 时走
// 已有的 parseSmartArtByRel（drawing spTree → group children）。

import type { Shape, SmartArtItem, SmartArtLayoutKind } from "@ppt/core";
import { SMARTART_LAYOUT_LABELS, translatePathD } from "@ppt/core";
import { esc, pxToEmu, xmlHeader } from "./xml-util";

export const DGM_GRAPHIC_URI = "http://schemas.openxmlformats.org/drawingml/2006/diagram";

export const REL_DIAGRAM_DATA =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData";
export const REL_DIAGRAM_LAYOUT =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramLayout";
export const REL_DIAGRAM_STYLE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramQuickStyle";
export const REL_DIAGRAM_COLORS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramColors";
export const REL_DIAGRAM_DRAWING =
  "http://schemas.microsoft.com/office/2007/relationships/diagramDrawing";

export const CT_DIAGRAM_DATA =
  "application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml";
export const CT_DIAGRAM_LAYOUT =
  "application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml";
export const CT_DIAGRAM_COLORS =
  "application/vnd.openxmlformats-officedocument.drawingml.diagramColors+xml";
export const CT_DIAGRAM_STYLE =
  "application/vnd.openxmlformats-officedocument.drawingml.diagramStyle+xml";
export const CT_DIAGRAM_DRAWING = "application/vnd.ms-office.drawingml.diagramDrawing+xml";

const DSP_NS = "http://schemas.microsoft.com/office/drawing/2008/diagram";
const DATA_MODEL_EXT_URI = "{28A0092B-C50C-407E-A947-70E740481C1C}";
export const SLIMPPT_LAYOUT_URN = "urn:slimppt:smartart/";

/** 把 slide 绝对坐标折成 graphicFrame / drawing 局部坐标。 */
export function offsetShapeTree(s: Shape, dx: number, dy: number): Shape {
  const bbox = { ...s.bbox, x: s.bbox.x + dx, y: s.bbox.y + dy };
  if (s.kind === "group") {
    return { ...s, bbox, children: s.children.map((c) => offsetShapeTree(c, dx, dy)) };
  }
  // line 的 xfrm 由端点 (x1,y1)-(x2,y2) 推导而不是 bbox，连接符也要一起平移，
  // 否则写进 drawing.xml 的仍是 slide 坐标，重新打开后整体向右下偏移一个 host 原点。
  if (s.kind === "line") {
    return { ...s, bbox, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
  }
  // polygon.points / 无 presetType 的 path.d 是绝对坐标，custGeom 写出时按 bbox 原点
  // 减回去；bbox 动了几何不动就会错位一个 (dx, dy)。preset path 由 prstGeom + bbox 表达，
  // d 不参与写出，跳过。
  if (s.kind === "polygon") {
    return { ...s, bbox, points: s.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
  }
  if (s.kind === "path" && !s.presetType) {
    return { ...s, bbox, d: translatePathD(s.d, dx, dy) };
  }
  return { ...s, bbox };
}

export interface DiagramRelIds {
  dm: string;
  lo: string;
  qs: string;
  cs: string;
}

export function layoutUniqueId(layout: SmartArtLayoutKind): string {
  return `${SLIMPPT_LAYOUT_URN}${layout}`;
}

export function catForSmartArtLayout(layout: SmartArtLayoutKind): string {
  switch (layout) {
    case "process":
    case "processVertical":
    case "chevron":
    case "arrowRibbon":
    case "timeline":
      return "process";
    case "cycle":
    case "blockCycle":
      return "cycle";
    case "pyramid":
    case "funnel":
      return "pyramid";
    case "hierarchy":
    case "orgChart":
      return "hierarchy";
    case "matrix":
      return "matrix";
    case "radial":
    case "target":
    case "venn":
      return "relationship";
    case "equation":
      return "equation";
    case "horizontalList":
      return "horizontal";
    case "stacked":
      return "stacked";
    case "pictureAccent":
    case "pictureCaption":
      return "picture";
    case "alternating":
    case "hexagon":
      return "process";
    case "invertedPyramid":
      return "pyramid";
    case "pie":
    case "balance":
    case "opposingArrows":
    case "converging":
      return "relationship";
    case "gear":
      return "cycle";
    case "horizontalHierarchy":
      return "hierarchy";
    default:
      return "list";
  }
}

function newGuid(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `{${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}}`.toUpperCase();
}

function presentationMlToDsp(xml: string): string {
  return xml.replace(
    /<\/?p:(sp|pic|grpSp|cxnSp|graphicFrame|nvSpPr|nvPicPr|nvGrpSpPr|nvGraphicFramePr|cNvPr|cNvSpPr|cNvPicPr|cNvGrpSpPr|cNvGraphicFramePr|nvPr|spPr|grpSpPr|txBody|blipFill|xfrm)\b/g,
    (m) => m.replace("p:", "dsp:"),
  );
}

export function renderSmartArtDrawingXml(
  bbox: { w: number; h: number },
  childrenPmlXml: string,
): string {
  const cx = pxToEmu(Math.max(1, bbox.w));
  const cy = pxToEmu(Math.max(1, bbox.h));
  const body = presentationMlToDsp(childrenPmlXml);
  return `${xmlHeader()}
<dsp:drawing xmlns:dsp="${DSP_NS}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dsp:spTree>
    <dsp:nvGrpSpPr><dsp:cNvPr id="1" name=""/><dsp:cNvGrpSpPr/><dsp:nvPr/></dsp:nvGrpSpPr>
    <dsp:grpSpPr>
      <a:xfrm>
        <a:off x="0" y="0"/>
        <a:ext cx="${cx}" cy="${cy}"/>
        <a:chOff x="0" y="0"/>
        <a:chExt cx="${cx}" cy="${cy}"/>
      </a:xfrm>
    </dsp:grpSpPr>
    ${body}
  </dsp:spTree>
</dsp:drawing>`;
}

export function renderSmartArtDataXml(items: SmartArtItem[]): string {
  const docId = newGuid();
  const pts: string[] = [
    `<dgm:pt modelId="${docId}" type="doc"><dgm:prSet type="pres"/><dgm:t/></dgm:pt>`,
  ];
  const cxns: string[] = [];
  const list = items.length ? items : [{ id: "item_0", text: "" }];
  for (const it of list) {
    const id = newGuid();
    const lvl = it.lvl ?? 0;
    const text = esc(it.text ?? "");
    pts.push(
      `<dgm:pt modelId="${id}" type="node"><dgm:prSet phldr="${text ? "0" : "1"}" lvl="${lvl}"/><dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1400"/><a:t>${text}</a:t></a:r></a:p></dgm:t></dgm:pt>`,
    );
    cxns.push(
      `<dgm:cxn modelId="${newGuid()}" srcId="${docId}" destId="${id}" srcOrd="0" destOrd="0"/>`,
    );
  }
  return `${xmlHeader()}
<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dgm:ptLst>${pts.join("")}</dgm:ptLst>
  <dgm:cxnLst>${cxns.join("")}</dgm:cxnLst>
  <dgm:bg/>
  <dgm:whole/>
  <dgm:extLst>
    <a:ext uri="${DATA_MODEL_EXT_URI}">
      <dsp:dataModelExt xmlns:dsp="${DSP_NS}" relId="rIdDrawing" minVer="1.0"/>
    </a:ext>
  </dgm:extLst>
</dgm:dataModel>`;
}

export function renderSmartArtLayoutXml(layout: SmartArtLayoutKind): string {
  const title = esc(SMARTART_LAYOUT_LABELS[layout] ?? layout);
  const cat = catForSmartArtLayout(layout);
  return `${xmlHeader()}
<dgm:layoutDef xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" uniqueId="${esc(layoutUniqueId(layout))}" minVer="12.0">
  <dgm:title val="${title}"/>
  <dgm:desc val=""/>
  <dgm:catLst><dgm:cat type="${esc(cat)}" pri="10000"/></dgm:catLst>
  <dgm:sampData useDef="1"/>
  <dgm:styleData useDef="1"/>
  <dgm:clrData useDef="1"/>
  <dgm:layoutNode name="Name0">
    <dgm:alg type="tx"/>
    <dgm:shape xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
    <dgm:presOf axis="desOrSelf" ptType="node"/>
  </dgm:layoutNode>
</dgm:layoutDef>`;
}

export function renderSmartArtColorsXml(): string {
  return `${xmlHeader()}
<dgm:colorsDef xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" uniqueId="urn:microsoft.com/office/officeart/2005/8/colors/accent1_2" minVer="12.0">
  <dgm:title val=""/>
  <dgm:desc val=""/>
  <dgm:catLst><dgm:cat type="accent1" pri="11200"/></dgm:catLst>
  <dgm:styleLbl name="node0">
    <dgm:fillClrLst meth="repeat"><a:schemeClr val="accent1"/></dgm:fillClrLst>
    <dgm:linClrLst meth="repeat"><a:schemeClr val="lt1"/></dgm:linClrLst>
    <dgm:effectClrLst meth="repeat"><a:srgbClr val="000000"/></dgm:effectClrLst>
    <dgm:txLinClrLst meth="repeat"><a:srgbClr val="000000"/></dgm:txLinClrLst>
    <dgm:txFillClrLst meth="repeat"><a:schemeClr val="lt1"/></dgm:txFillClrLst>
    <dgm:txEffectClrLst meth="repeat"><a:srgbClr val="000000"/></dgm:txEffectClrLst>
  </dgm:styleLbl>
</dgm:colorsDef>`;
}

export function renderSmartArtQuickStyleXml(): string {
  return `${xmlHeader()}
<dgm:styleDef xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" uniqueId="urn:microsoft.com/office/officeart/2005/8/quickstyle/simple1" minVer="12.0">
  <dgm:title val=""/>
  <dgm:desc val=""/>
  <dgm:catLst><dgm:cat type="simple" pri="10000"/></dgm:catLst>
  <dgm:scene3d><a:camera prst="orthographicFront"/><a:lightRig rig="threePt" dir="t"/></dgm:scene3d>
  <dgm:style>
    <a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef>
    <a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef>
    <a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef>
    <a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef>
  </dgm:style>
  <dgm:styleLbl name="node0">
    <dgm:scene3d><a:camera prst="orthographicFront"/><a:lightRig rig="threePt" dir="t"/></dgm:scene3d>
    <dgm:sp3d/>
    <dgm:style>
      <a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef>
      <a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef>
      <a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef>
      <a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef>
    </dgm:style>
    <dgm:txPr/>
  </dgm:styleLbl>
</dgm:styleDef>`;
}

export function renderDiagramDataRelsXml(drawingFile: string): string {
  return `${xmlHeader()}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdDrawing" Type="${REL_DIAGRAM_DRAWING}" Target="${esc(drawingFile)}"/>
</Relationships>`;
}

export function renderDiagramDrawingRelsXml(
  mediaItems: Array<{ name: string; relId: string }>,
): string {
  if (!mediaItems.length) return "";
  const rows = mediaItems
    .map(
      (m) =>
        `<Relationship Id="${m.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${m.name}"/>`,
    )
    .join("");
  return `${xmlHeader()}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rows}
</Relationships>`;
}

export function buildSmartArtPartFiles(opts: {
  idx: number;
  layout: SmartArtLayoutKind;
  items: SmartArtItem[];
  bbox: { w: number; h: number };
  childrenXml: string;
  drawingMedia: Array<{ name: string; relId: string }>;
}): Record<string, string> {
  const { idx, layout, items, bbox, childrenXml, drawingMedia } = opts;
  const files: Record<string, string> = {
    [`ppt/diagrams/data${idx}.xml`]: renderSmartArtDataXml(items),
    [`ppt/diagrams/layout${idx}.xml`]: renderSmartArtLayoutXml(layout),
    [`ppt/diagrams/quickStyle${idx}.xml`]: renderSmartArtQuickStyleXml(),
    [`ppt/diagrams/colors${idx}.xml`]: renderSmartArtColorsXml(),
    [`ppt/diagrams/drawing${idx}.xml`]: renderSmartArtDrawingXml(bbox, childrenXml),
    [`ppt/diagrams/_rels/data${idx}.xml.rels`]: renderDiagramDataRelsXml(`drawing${idx}.xml`),
  };
  const drawingRels = renderDiagramDrawingRelsXml(drawingMedia);
  if (drawingRels) files[`ppt/diagrams/_rels/drawing${idx}.xml.rels`] = drawingRels;
  return files;
}

export function diagramContentTypeRows(idx: number): Array<{ part: string; ct: string }> {
  return [
    { part: `/ppt/diagrams/data${idx}.xml`, ct: CT_DIAGRAM_DATA },
    { part: `/ppt/diagrams/layout${idx}.xml`, ct: CT_DIAGRAM_LAYOUT },
    { part: `/ppt/diagrams/quickStyle${idx}.xml`, ct: CT_DIAGRAM_STYLE },
    { part: `/ppt/diagrams/colors${idx}.xml`, ct: CT_DIAGRAM_COLORS },
    { part: `/ppt/diagrams/drawing${idx}.xml`, ct: CT_DIAGRAM_DRAWING },
  ];
}

export function diagramSlideRelsXml(items: Array<{ idx: number } & DiagramRelIds>): string {
  return items
    .map(
      (d) =>
        `<Relationship Id="${d.dm}" Type="${REL_DIAGRAM_DATA}" Target="../diagrams/data${d.idx}.xml"/>` +
        `<Relationship Id="${d.lo}" Type="${REL_DIAGRAM_LAYOUT}" Target="../diagrams/layout${d.idx}.xml"/>` +
        `<Relationship Id="${d.qs}" Type="${REL_DIAGRAM_STYLE}" Target="../diagrams/quickStyle${d.idx}.xml"/>` +
        `<Relationship Id="${d.cs}" Type="${REL_DIAGRAM_COLORS}" Target="../diagrams/colors${d.idx}.xml"/>`,
    )
    .join("");
}
