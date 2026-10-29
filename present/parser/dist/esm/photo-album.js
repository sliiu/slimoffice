import { boolish } from "./units.js";
import { attr, findByLocalName } from "./xml.js";
/** ECMA-376 §19.2.1.27 photoAlbum — 相册元数据（presentation.xml 子元素）。 */
export function parsePhotoAlbum(presEl) {
    const pa = findByLocalName(presEl, "photoAlbum");
    if (!pa)
        return undefined;
    const out = {};
    const bw = boolish(attr(pa, "bw"));
    if (bw !== undefined)
        out.bw = bw;
    const sc = boolish(attr(pa, "showCaptions"));
    if (sc !== undefined)
        out.showCaptions = sc;
    const layout = attr(pa, "layout");
    if (layout)
        out.layout = layout;
    const frame = attr(pa, "frame");
    if (frame)
        out.frame = frame;
    // 元素存在即返回对象（含空 `{}`），便于 round-trip 识别「相册 deck」。
    return out;
}
export function photoAlbumSnapshot(album) {
    if (!album)
        return "";
    return JSON.stringify(album);
}
