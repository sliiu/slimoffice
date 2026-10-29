import { angleToEmu, attrs, esc, pxToEmu } from "./xml-util.js";
import { REL_TYPE_MODEL3D } from "./media-table.js";
import { allocSpId, graphicFrameLocksXml, nvPrXml } from "./pptx-shapes.js";
export const MODEL3D_GRAPHIC_URI = "http://schemas.microsoft.com/office/drawing/2017/model3d";
const AM3D = "http://schemas.microsoft.com/office/drawing/2017/model3d";
function cNvPrXml(id, s) {
    return `<p:cNvPr${attrs({ id, name: s.name, title: s.title, descr: s.descr })}/>`;
}
function rotAttrs(r) {
    const a = [];
    if (r.lat !== undefined)
        a.push(`lat="${angleToEmu(r.lat)}"`);
    if (r.lon !== undefined)
        a.push(`lon="${angleToEmu(r.lon)}"`);
    if (r.rev !== undefined)
        a.push(`rev="${angleToEmu(r.rev)}"`);
    return a.join(" ");
}
function rotXml(r, prefix) {
    if (!r || (!r.lat && !r.lon && !r.rev))
        return "";
    const attrs = rotAttrs(r);
    return attrs ? `<${prefix}:rot ${attrs}/>` : "";
}
function vec3Xml(prefix, local, v) {
    if (!v)
        return "";
    return `<${prefix}:${local} x="${pxToEmu(v.x)}" y="${pxToEmu(v.y)}" z="${pxToEmu(v.z)}"/>`;
}
function transXml(t) {
    if (!t)
        return "";
    const inner = [
        vec3Xml("am3d", "scale", t.scale),
        rotXml(t.rot, "am3d"),
        vec3Xml("am3d", "off", t.off),
    ].join("");
    return inner ? `<am3d:trans>${inner}</am3d:trans>` : "";
}
function cameraXml(c) {
    if (!c)
        return "";
    const prst = c.preset ? ` prst="${esc(c.preset)}"` : "";
    const rot = rotXml(c.rot, "am3d");
    return rot || c.preset ? `<am3d:camera${prst}>${rot}</am3d:camera>` : "";
}
function model3DBody(s, media) {
    const parts = [];
    if (s.glbSrc) {
        const glbRid = media.registerRel(s.glbSrc, REL_TYPE_MODEL3D);
        parts.push(`<am3d:model3d xmlns:am3d="${AM3D}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${glbRid}">`);
    }
    else {
        parts.push(`<am3d:model3d xmlns:am3d="${AM3D}">`);
    }
    if (s.rasterSrc) {
        const rasterRid = media.registerImage(s.rasterSrc);
        parts.push(`<am3d:raster xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rasterRid}"/>`);
    }
    parts.push(cameraXml(s.camera));
    parts.push(transXml(s.modelTransform));
    parts.push("</am3d:model3d>");
    return parts.join("");
}
/** From-scratch `<p:graphicFrame>` for Insert → 3D Model. */
export function model3DFrameToXml(s, ctx) {
    const id = allocSpId(s, ctx);
    return `<p:graphicFrame>
    <p:nvGraphicFramePr>
      ${cNvPrXml(id, s)}
      <p:cNvGraphicFramePr>${graphicFrameLocksXml(s)}</p:cNvGraphicFramePr>
      ${nvPrXml(s, ctx)}
    </p:nvGraphicFramePr>
    <p:xfrm>
      <a:off x="${pxToEmu(s.bbox.x)}" y="${pxToEmu(s.bbox.y)}"/>
      <a:ext cx="${pxToEmu(Math.max(1, s.bbox.w))}" cy="${pxToEmu(Math.max(1, s.bbox.h))}"/>
    </p:xfrm>
    <a:graphic>
      <a:graphicData uri="${MODEL3D_GRAPHIC_URI}">
        ${model3DBody(s, ctx.media)}
      </a:graphicData>
    </a:graphic>
  </p:graphicFrame>`;
}
