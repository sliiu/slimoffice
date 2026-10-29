"use strict";
// Office ink：`p:contentPart` + InkML 部件（ECMA-376 contentPart / W3C InkML）。
// Draw 笔迹和解析回来的 Office 墨迹都走这条路径，而不是普通 a:custGeom。
Object.defineProperty(exports, "__esModule", { value: true });
exports.INK_CONTENT_TYPE = exports.INK_REL_TYPE = void 0;
exports.isInkPath = isInkPath;
exports.inkPartPath = inkPartPath;
exports.inkSlideRelsXml = inkSlideRelsXml;
exports.inkContentTypeRows = inkContentTypeRows;
exports.svgPathToPoints = svgPathToPoints;
exports.buildInkMlXml = buildInkMlXml;
exports.inkContentPartToXml = inkContentPartToXml;
const xml_util_1 = require("./xml-util");
const pptx_shapes_1 = require("./pptx-shapes");
exports.INK_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml";
exports.INK_CONTENT_TYPE = "application/inkml+xml";
function isInkPath(s) {
    return s.kind === "path" && (!!s.ink || s.id.startsWith("sp_ink_"));
}
function inkPartPath(idx) {
    return `ppt/ink/ink${idx}.xml`;
}
function inkSlideRelsXml(items) {
    return items
        .map((it) => `<Relationship Id="${it.relId}" Type="${exports.INK_REL_TYPE}" Target="../ink/ink${it.idx}.xml"/>`)
        .join("");
}
function inkContentTypeRows(idx) {
    return [{ part: `/${inkPartPath(idx)}`, ct: exports.INK_CONTENT_TYPE }];
}
/** SVG path `M/L` 折线 → 点列（Draw 笔迹只写折线）。 */
function svgPathToPoints(d) {
    const out = [];
    const re = /[ML]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/gi;
    let m;
    while ((m = re.exec(d))) {
        out.push([Number(m[1]), Number(m[2])]);
    }
    return out;
}
function buildInkMlXml(s) {
    const pts = svgPathToPoints(s.d);
    const mode = s.ink?.mode === "highlighter" ? "highlighter" : "pen";
    const paint = s.stroke?.paint;
    const color = paint && paint.kind === "solid" ? paint.color : "#111827";
    const alpha = paint && paint.kind === "solid" && paint.alpha !== undefined ? paint.alpha : 1;
    const width = s.stroke?.width ?? 3;
    const transparency = Math.max(0, Math.min(1, 1 - alpha));
    const trace = pts.map(([x, y]) => `${(0, xml_util_1.pxToEmu)(x)} ${(0, xml_util_1.pxToEmu)(y)}`).join(", ");
    return `${(0, xml_util_1.xmlHeader)()}
<inkml:ink xmlns:inkml="http://www.w3.org/2003/InkML">
  <inkml:definitions>
    <inkml:brush xml:id="br1">
      <inkml:brushProperty name="width" value="${(0, xml_util_1.esc)(String(width))}" units="px"/>
      <inkml:brushProperty name="color" value="${(0, xml_util_1.esc)(color)}"/>
      <inkml:brushProperty name="transparency" value="${transparency}"/>
      <inkml:brushProperty name="rasterOp" value="${mode === "highlighter" ? "maskPen" : "copyPen"}"/>
    </inkml:brush>
  </inkml:definitions>
  <inkml:trace brushRef="#br1">${trace}</inkml:trace>
</inkml:ink>`;
}
function inkContentPartToXml(s, rel, ctx) {
    const id = (0, pptx_shapes_1.allocSpId)(s, ctx);
    const off = `<a:off${(0, xml_util_1.attrs)({ x: (0, xml_util_1.pxToEmu)(s.bbox.x), y: (0, xml_util_1.pxToEmu)(s.bbox.y) })}/>`;
    const ext = `<a:ext${(0, xml_util_1.attrs)({ cx: (0, xml_util_1.pxToEmu)(s.bbox.w), cy: (0, xml_util_1.pxToEmu)(s.bbox.h) })}/>`;
    return `<p:contentPart r:id="${rel.relId}">
    <p:nvContentPartPr>
      <p:cNvPr${(0, xml_util_1.attrs)({ id, name: s.name || "Ink" })}/>
      <p:cNvContentPartPr/>
      <p:nvPr/>
    </p:nvContentPartPr>
    <p:xfrm>${off}${ext}</p:xfrm>
  </p:contentPart>`;
}
