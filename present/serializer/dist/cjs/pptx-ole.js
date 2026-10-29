"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OLE_GRAPHIC_URI = void 0;
exports.oleFrameToXml = oleFrameToXml;
const xml_util_1 = require("./xml-util");
const pptx_shapes_1 = require("./pptx-shapes");
exports.OLE_GRAPHIC_URI = "http://schemas.openxmlformats.org/presentationml/2006/ole";
function cNvPrXml(id, s) {
    return `<p:cNvPr${(0, xml_util_1.attrs)({ id, name: s.name, title: s.title, descr: s.descr })}/>`;
}
/** From-scratch `<p:graphicFrame>` for Insert → Object (OLE embed). */
function oleFrameToXml(s, ctx) {
    const id = (0, pptx_shapes_1.allocSpId)(s, ctx);
    const embeddings = ctx.embeddings;
    const relId = s.embedSrc && embeddings ? embeddings.registerOle(s.embedSrc, s.embedFileName) : undefined;
    const progId = (0, xml_util_1.esc)(s.progId ?? "Package");
    const objectName = (0, xml_util_1.esc)(s.objectName ?? s.name ?? "Object");
    const showAsIcon = s.showAsIcon !== false ? ' showAsIcon="1"' : "";
    const imgW = s.showAsIcon === false && s.bbox.w > 0
        ? ` imgW="${(0, xml_util_1.pxToEmu)(s.bbox.w)}" imgH="${(0, xml_util_1.pxToEmu)(Math.max(1, s.bbox.h))}"`
        : "";
    const embedBody = s.isLinked ? "<p:link/>" : "<p:embed/>";
    const oleObj = relId
        ? `<p:oleObj progId="${progId}" name="${objectName}" r:id="${relId}"${showAsIcon}${imgW}>${embedBody}</p:oleObj>`
        : `<p:oleObj progId="${progId}" name="${objectName}"${showAsIcon}${imgW}>${embedBody}</p:oleObj>`;
    return `<p:graphicFrame>
    <p:nvGraphicFramePr>
      ${cNvPrXml(id, s)}
      <p:cNvGraphicFramePr>${(0, pptx_shapes_1.graphicFrameLocksXml)(s)}</p:cNvGraphicFramePr>
      ${(0, pptx_shapes_1.nvPrXml)(s, ctx)}
    </p:nvGraphicFramePr>
    <p:xfrm>
      <a:off x="${(0, xml_util_1.pxToEmu)(s.bbox.x)}" y="${(0, xml_util_1.pxToEmu)(s.bbox.y)}"/>
      <a:ext cx="${(0, xml_util_1.pxToEmu)(Math.max(1, s.bbox.w))}" cy="${(0, xml_util_1.pxToEmu)(Math.max(1, s.bbox.h))}"/>
    </p:xfrm>
    <a:graphic>
      <a:graphicData uri="${exports.OLE_GRAPHIC_URI}">
        ${oleObj}
      </a:graphicData>
    </a:graphic>
  </p:graphicFrame>`;
}
