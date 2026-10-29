import { zipSync, strToU8 } from "fflate";
export function packZip(files) {
    const flat = {};
    for (const path of Object.keys(files)) {
        const v = files[path];
        if (typeof v === "string")
            flat[path] = strToU8(v);
        else
            flat[path] = v;
    }
    return zipSync(flat, { level: 6 });
}
export function dataUrlToBytes(dataUrl) {
    if (!dataUrl.startsWith("data:"))
        return null;
    const b64 = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,([\s\S]+)$/i.exec(dataUrl);
    if (b64) {
        return { bytes: atobUniversal(b64[2]), mime: b64[1] || "application/octet-stream" };
    }
    // `data:image/svg+xml;charset=utf-8,<urlencoded svg>`（公式插入走这条，
    // 不是 base64）。旧实现只认 `;base64,`，解码失败后 round-trip 把 r:embed
    // 留在 rId1（slideLayout），WPS / PowerPoint 里图片消失。
    const raw = /^data:([^;,]+)?(?:;charset=[^;,]+)?,([\s\S]*)$/i.exec(dataUrl);
    if (!raw)
        return null;
    const mime = raw[1] || "text/plain";
    const payload = raw[2] ?? "";
    try {
        return { bytes: new TextEncoder().encode(decodeURIComponent(payload)), mime };
    }
    catch {
        return { bytes: new TextEncoder().encode(payload), mime };
    }
}
function atobUniversal(b64) {
    if (typeof atob !== "undefined") {
        const s = atob(b64);
        const out = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++)
            out[i] = s.charCodeAt(i);
        return out;
    }
    const g = globalThis;
    if (g.Buffer) {
        const buf = g.Buffer.from(b64, "base64");
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }
    return new Uint8Array(0);
}
export function mimeToExt(mime) {
    switch (mime.toLowerCase()) {
        case "image/png":
            return "png";
        case "image/jpeg":
        case "image/jpg":
            return "jpg";
        case "image/gif":
            return "gif";
        case "image/webp":
            return "webp";
        case "image/svg+xml":
            return "svg";
        case "video/mp4":
            return "mp4";
        case "video/webm":
            return "webm";
        case "audio/mpeg":
            return "mp3";
        case "audio/mp4":
        case "audio/x-m4a":
            return "m4a";
        case "audio/wav":
        case "audio/x-wav":
        case "audio/wave":
            return "wav";
        case "audio/webm":
            return "webm";
        case "model/gltf-binary":
            return "glb";
        case "model/gltf+json":
            return "gltf";
        default:
            return "bin";
    }
}
const EXT_TO_MIME = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    webm: "video/webm",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    glb: "model/gltf-binary",
    gltf: "model/gltf+json",
};
/** 给 [Content_Types].xml 补 Default；源 PPTX 常没有 svg/webp，WPS 会直接不显示新媒体。 */
export function ensureContentTypesDefault(xml, ext, mime) {
    const token = ext.toLowerCase().replace(/^\./, "");
    if (!token)
        return xml;
    if (new RegExp(`Extension="${token}"`, "i").test(xml))
        return xml;
    const contentType = mime || EXT_TO_MIME[token] || "application/octet-stream";
    return xml.replace(/<\/Types>/, `<Default Extension="${token}" ContentType="${contentType}"/></Types>`);
}
