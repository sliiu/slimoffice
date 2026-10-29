import { bytesToFontDataUrl } from "@sliiu/present-core";
import { findFontPreset } from "@sliiu/present-themes";
const TTF_UA = "Wget/1.21";
let fontProxyBase;
export function setGoogleFontProxyBase(base) {
    fontProxyBase = base?.replace(/\/$/, "") || undefined;
}
function pickFontUrl(css) {
    const ttf = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/i);
    if (ttf?.[1])
        return ttf[1];
    const otf = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.otf)\)/i);
    if (otf?.[1])
        return otf[1];
    return undefined;
}
function familyFromCssUrl(cssUrl) {
    try {
        const u = new URL(cssUrl);
        if (u.hostname !== "fonts.googleapis.com")
            return undefined;
        const raw = u.searchParams.get("family") ?? "";
        return raw.split(":")[0]?.replace(/\+/g, " ").trim() || undefined;
    }
    catch {
        return undefined;
    }
}
function looksLikeSfnt(bytes) {
    if (bytes.length < 4)
        return false;
    const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (tag === "OTTO" || tag === "true")
        return true;
    return bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00;
}
async function fetchViaProxy(family, weight) {
    if (!fontProxyBase)
        return null;
    const q = new URLSearchParams({ family, weight: String(weight) });
    const res = await fetch(`${fontProxyBase}/fonts/google?${q}`);
    if (!res.ok)
        return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return looksLikeSfnt(bytes) ? bytes : null;
}
export async function fetchGoogleFontBytes(cssUrl, weight = 400) {
    const family = familyFromCssUrl(cssUrl);
    if (family) {
        const proxied = await fetchViaProxy(family, weight).catch(() => null);
        if (proxied?.length)
            return proxied;
    }
    const url = cssUrl.replace(/wght@[^&]+/, `wght@${weight}`);
    const headers = {};
    if (typeof document === "undefined")
        headers["User-Agent"] = TTF_UA;
    const cssRes = await fetch(url, { headers });
    if (!cssRes.ok)
        return null;
    const css = await cssRes.text();
    const fontUrl = pickFontUrl(css);
    if (!fontUrl)
        return null;
    const fontRes = await fetch(fontUrl);
    if (!fontRes.ok)
        return null;
    const bytes = new Uint8Array(await fontRes.arrayBuffer());
    return looksLikeSfnt(bytes) ? bytes : null;
}
export async function fetchPresetFontDataUrl(family, weight = 400) {
    const preset = findFontPreset(family);
    if (!preset?.cssUrl)
        return null;
    const bytes = await fetchGoogleFontBytes(preset.cssUrl, weight);
    if (!bytes?.length)
        return null;
    const mime = bytes[0] === 0x4f && bytes[1] === 0x54 ? "font/otf" : "font/ttf";
    return bytesToFontDataUrl(bytes, mime);
}
