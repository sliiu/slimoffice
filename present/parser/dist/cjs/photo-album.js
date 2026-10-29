"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePhotoAlbum = parsePhotoAlbum;
exports.photoAlbumSnapshot = photoAlbumSnapshot;
const units_1 = require("./units");
const xml_1 = require("./xml");
/** ECMA-376 §19.2.1.27 photoAlbum — 相册元数据（presentation.xml 子元素）。 */
function parsePhotoAlbum(presEl) {
    const pa = (0, xml_1.findByLocalName)(presEl, "photoAlbum");
    if (!pa)
        return undefined;
    const out = {};
    const bw = (0, units_1.boolish)((0, xml_1.attr)(pa, "bw"));
    if (bw !== undefined)
        out.bw = bw;
    const sc = (0, units_1.boolish)((0, xml_1.attr)(pa, "showCaptions"));
    if (sc !== undefined)
        out.showCaptions = sc;
    const layout = (0, xml_1.attr)(pa, "layout");
    if (layout)
        out.layout = layout;
    const frame = (0, xml_1.attr)(pa, "frame");
    if (frame)
        out.frame = frame;
    // 元素存在即返回对象（含空 `{}`），便于 round-trip 识别「相册 deck」。
    return out;
}
function photoAlbumSnapshot(album) {
    if (!album)
        return "";
    return JSON.stringify(album);
}
