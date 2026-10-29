// Office ink：`p:contentPart` + InkML 部件（ECMA-376 contentPart / W3C InkML）。
// Draw 笔迹和解析回来的 Office 墨迹都走这条路径，而不是普通 a:custGeom。
import { attrs, esc, pxToEmu, xmlHeader } from "./xml-util.js";
import { allocSpId } from "./pptx-shapes.js";
export const INK_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml";
export const INK_CONTENT_TYPE = "application/inkml+xml";
export function isInkPath(s) {
    return s.kind === "path" && (!!s.ink || s.id.startsWith("sp_ink_"));
}
export function inkPartPath(idx) {
    return `ppt/ink/ink${idx}.xml`;
}
export function inkSlideRelsXml(items) {
    return items
        .map((it) => `<Relationship Id="${it.relId}" Type="${INK_REL_TYPE}" Target="../ink/ink${it.idx}.xml"/>`)
        .join("");
}
export function inkContentTypeRows(idx) {
    return [{ part: `/${inkPartPath(idx)}`, ct: INK_CONTENT_TYPE }];
}
/** SVG path `M/L` 折线 → 点列（Draw 笔迹只写折线）。 */
export function svgPathToPoints(d) {
    const out = [];
    const re = /[ML]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/gi;
    let m;
    while ((m = re.exec(d))) {
        out.push([Number(m[1]), Number(m[2])]);
    }
    return out;
}
export function buildInkMlXml(s) {
    const pts = svgPathToPoints(s.d);
    const mode = s.ink?.mode === "highlighter" ? "highlighter" : "pen";
    const paint = s.stroke?.paint;
    const color = paint && paint.kind === "solid" ? paint.color : "#111827";
    const alpha = paint && paint.kind === "solid" && paint.alpha !== undefined ? paint.alpha : 1;
    const width = s.stroke?.width ?? 3;
    const transparency = Math.max(0, Math.min(1, 1 - alpha));
    const trace = pts.map(([x, y]) => `${pxToEmu(x)} ${pxToEmu(y)}`).join(", ");
    return `${xmlHeader()}
<inkml:ink xmlns:inkml="http://www.w3.org/2003/InkML">
  <inkml:definitions>
    <inkml:brush xml:id="br1">
      <inkml:brushProperty name="width" value="${esc(String(width))}" units="px"/>
      <inkml:brushProperty name="color" value="${esc(color)}"/>
      <inkml:brushProperty name="transparency" value="${transparency}"/>
      <inkml:brushProperty name="rasterOp" value="${mode === "highlighter" ? "maskPen" : "copyPen"}"/>
    </inkml:brush>
  </inkml:definitions>
  <inkml:trace brushRef="#br1">${trace}</inkml:trace>
</inkml:ink>`;
}
export function inkContentPartToXml(s, rel, ctx) {
    const id = allocSpId(s, ctx);
    const off = `<a:off${attrs({ x: pxToEmu(s.bbox.x), y: pxToEmu(s.bbox.y) })}/>`;
    const ext = `<a:ext${attrs({ cx: pxToEmu(s.bbox.w), cy: pxToEmu(s.bbox.h) })}/>`;
    return `<p:contentPart r:id="${rel.relId}">
    <p:nvContentPartPr>
      <p:cNvPr${attrs({ id, name: s.name || "Ink" })}/>
      <p:cNvContentPartPr/>
      <p:nvPr/>
    </p:nvContentPartPr>
    <p:xfrm>${off}${ext}</p:xfrm>
  </p:contentPart>`;
}
