import type { Model3DCamera, Model3DRotation, Model3DShape, Model3DTransform, Shape } from "@ppt/core";
import { angleToEmu, attrs, esc, pxToEmu } from "./xml-util";
import type { MediaRegistrar } from "./media-table";
import { REL_TYPE_MODEL3D } from "./media-table";
import { allocSpId, graphicFrameLocksXml, nvPrXml, type ShapeCtx } from "./pptx-shapes";

export const MODEL3D_GRAPHIC_URI = "http://schemas.microsoft.com/office/drawing/2017/model3d";
const AM3D = "http://schemas.microsoft.com/office/drawing/2017/model3d";

function cNvPrXml(id: number, s: Shape): string {
  return `<p:cNvPr${attrs({ id, name: s.name, title: s.title, descr: s.descr })}/>`;
}

function rotAttrs(r: Model3DRotation): string {
  const a: string[] = [];
  if (r.lat !== undefined) a.push(`lat="${angleToEmu(r.lat)}"`);
  if (r.lon !== undefined) a.push(`lon="${angleToEmu(r.lon)}"`);
  if (r.rev !== undefined) a.push(`rev="${angleToEmu(r.rev)}"`);
  return a.join(" ");
}

function rotXml(r: Model3DRotation | undefined, prefix: string): string {
  if (!r || (!r.lat && !r.lon && !r.rev)) return "";
  const attrs = rotAttrs(r);
  return attrs ? `<${prefix}:rot ${attrs}/>` : "";
}

function vec3Xml(
  prefix: string,
  local: string,
  v: { x: number; y: number; z: number } | undefined,
): string {
  if (!v) return "";
  return `<${prefix}:${local} x="${pxToEmu(v.x)}" y="${pxToEmu(v.y)}" z="${pxToEmu(v.z)}"/>`;
}

function transXml(t: Model3DTransform | undefined): string {
  if (!t) return "";
  const inner = [
    vec3Xml("am3d", "scale", t.scale),
    rotXml(t.rot, "am3d"),
    vec3Xml("am3d", "off", t.off),
  ].join("");
  return inner ? `<am3d:trans>${inner}</am3d:trans>` : "";
}

function cameraXml(c: Model3DCamera | undefined): string {
  if (!c) return "";
  const prst = c.preset ? ` prst="${esc(c.preset)}"` : "";
  const rot = rotXml(c.rot, "am3d");
  return rot || c.preset ? `<am3d:camera${prst}>${rot}</am3d:camera>` : "";
}

function model3DBody(s: Model3DShape, media: MediaRegistrar): string {
  const parts: string[] = [];
  if (s.glbSrc) {
    const glbRid = media.registerRel(s.glbSrc, REL_TYPE_MODEL3D);
    parts.push(`<am3d:model3d xmlns:am3d="${AM3D}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${glbRid}">`);
  } else {
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
export function model3DFrameToXml(s: Model3DShape, ctx: ShapeCtx): string {
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
