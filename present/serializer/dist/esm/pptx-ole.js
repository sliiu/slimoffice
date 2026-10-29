import { attrs, esc, pxToEmu } from "./xml-util.js";
import { allocSpId, graphicFrameLocksXml, nvPrXml } from "./pptx-shapes.js";
export const OLE_GRAPHIC_URI = "http://schemas.openxmlformats.org/presentationml/2006/ole";
function cNvPrXml(id, s) {
    return `<p:cNvPr${attrs({ id, name: s.name, title: s.title, descr: s.descr })}/>`;
}
/** From-scratch `<p:graphicFrame>` for Insert → Object (OLE embed). */
export function oleFrameToXml(s, ctx) {
    const id = allocSpId(s, ctx);
    const embeddings = ctx.embeddings;
    const relId = s.embedSrc && embeddings ? embeddings.registerOle(s.embedSrc, s.embedFileName) : undefined;
    const progId = esc(s.progId ?? "Package");
    const objectName = esc(s.objectName ?? s.name ?? "Object");
    const showAsIcon = s.showAsIcon !== false ? ' showAsIcon="1"' : "";
    const imgW = s.showAsIcon === false && s.bbox.w > 0
        ? ` imgW="${pxToEmu(s.bbox.w)}" imgH="${pxToEmu(Math.max(1, s.bbox.h))}"`
        : "";
    const embedBody = s.isLinked ? "<p:link/>" : "<p:embed/>";
    const oleObj = relId
        ? `<p:oleObj progId="${progId}" name="${objectName}" r:id="${relId}"${showAsIcon}${imgW}>${embedBody}</p:oleObj>`
        : `<p:oleObj progId="${progId}" name="${objectName}"${showAsIcon}${imgW}>${embedBody}</p:oleObj>`;
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
      <a:graphicData uri="${OLE_GRAPHIC_URI}">
        ${oleObj}
      </a:graphicData>
    </a:graphic>
  </p:graphicFrame>`;
}
