// EMF / WMF 浏览器画不出来。上屏前转成 SVG，原 src 不动，导出仍写回图元文件。
// 转出来的 SVG 不放进 shape.svgSrc：那个字段会写成 asvg:svgBlip，文件就会多出一个部件。
import { convertMetafileToSvgDataUrl } from "emf-converter";
export const METAFILE_MARKER_SRC = "data:image/svg+xml," +
    encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect x="1.5" y="1.5" width="61" height="61" fill="#f3f4f6" stroke="#d1d5db" stroke-width="1" stroke-dasharray="4 3"/></svg>`);
const cache = new Map();
const jobs = new Map();
const watched = new WeakSet();
export function isMetafileDataUrl(src) {
    return /^data:image\/(?:x-)?(?:emf|wmf)(?:;|,)/i.test(src);
}
/** EMF 签名在偏移 40（" EMF"）。可放置 WMF 以 0x9AC6CDD7 开头。 */
export function isMetafileBytes(bytes, mime = "") {
    if (/emf|wmf/i.test(mime))
        return true;
    if (bytes.length >= 4) {
        const key = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
        if (key === 0x9ac6cdd7)
            return true;
    }
    if (bytes.length >= 44) {
        const sig = bytes[40] | (bytes[41] << 8) | (bytes[42] << 16) | (bytes[43] << 24);
        if (sig === 0x464d4520)
            return true;
    }
    return false;
}
/**
 * 画布该用的地址。
 * 返回空字符串表示图元文件还在转，调用方先留白，完成后再画。
 * 转失败返回虚线占位。普通图片原样返回。
 */
export function previewImageSrc(src, img, onReady) {
    const hit = cache.get(src);
    if (hit?.kind === "native")
        return src;
    if (hit?.kind === "svg" || hit?.kind === "marker")
        return hit.url;
    if (jobs.has(src))
        return "";
    if (isMetafileDataUrl(src)) {
        ensure(src, onReady);
        return "";
    }
    if (img && !img.complete && onReady && !watched.has(img)) {
        watched.add(img);
        img.addEventListener("error", () => {
            ensure(src, onReady);
        }, { once: true });
    }
    if (!img || !img.complete)
        return src;
    if (img.naturalWidth > 0) {
        cache.set(src, { kind: "native" });
        return src;
    }
    ensure(src, onReady);
    return "";
}
export function waitForMetafilePreviews() {
    return Promise.all([...jobs.values()]).then(() => undefined);
}
function ensure(src, onReady) {
    let job = jobs.get(src);
    if (!job) {
        job = run(src);
        jobs.set(src, job);
        void job.finally(() => {
            jobs.delete(src);
        });
    }
    if (onReady)
        void job.then(() => onReady());
}
async function run(src) {
    if (cache.has(src))
        return;
    const claimed = isMetafileDataUrl(src);
    try {
        const loaded = await loadBytes(src);
        if (!loaded) {
            cache.set(src, claimed ? { kind: "marker", url: METAFILE_MARKER_SRC } : { kind: "native" });
            return;
        }
        if (!claimed && !isMetafileBytes(loaded.bytes, loaded.mime)) {
            cache.set(src, { kind: "native" });
            return;
        }
        const svg = await convertMetafileToSvgDataUrl(toArrayBuffer(loaded.bytes));
        cache.set(src, svg ? { kind: "svg", url: svg } : { kind: "marker", url: METAFILE_MARKER_SRC });
    }
    catch {
        cache.set(src, claimed ? { kind: "marker", url: METAFILE_MARKER_SRC } : { kind: "native" });
    }
}
function toArrayBuffer(bytes) {
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    return copy;
}
async function loadBytes(src) {
    if (src.startsWith("data:")) {
        const bytes = decodeDataUrl(src);
        return bytes ? { bytes, mime: "" } : undefined;
    }
    if (typeof fetch !== "function")
        return undefined;
    const res = await fetch(src);
    if (!res.ok)
        return undefined;
    return {
        bytes: new Uint8Array(await res.arrayBuffer()),
        mime: res.headers.get("content-type") ?? "",
    };
}
function decodeDataUrl(src) {
    const comma = src.indexOf(",");
    if (comma < 0)
        return undefined;
    const head = src.slice(0, comma);
    const body = src.slice(comma + 1);
    try {
        if (/;base64/i.test(head)) {
            const bin = atob(body);
            const out = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++)
                out[i] = bin.charCodeAt(i) & 0xff;
            return out;
        }
        return new TextEncoder().encode(decodeURIComponent(body));
    }
    catch {
        return undefined;
    }
}
