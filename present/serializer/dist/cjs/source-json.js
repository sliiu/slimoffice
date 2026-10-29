"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializePresentationSource = serializePresentationSource;
exports.deserializePresentationSource = deserializePresentationSource;
const META_KEYS = [
    "themeSnapshot",
    "commentAuthorsPartPath",
    "modernAuthorsPartPath",
    "commentsModern",
    "commentsSnapshot",
    "commentMetaSnapshot",
    "protectionMetaSnapshot",
    "editorPluginsMetaSnapshot",
    "playbackPluginsMetaSnapshot",
    "sectionsMetaSnapshot",
    "proofingLangMetaSnapshot",
    "tagsPartPath",
    "macroEnabled",
    "vbaProjectPartPath",
    "fontsSnapshot",
    "photoAlbumSnapshot",
    "kinsokuSnapshot",
    "viewGuidesSnapshot",
    "viewPropsPartPath",
    "showPrSnapshot",
    "presPropsPartPath",
];
function u8ToB64(bytes) {
    const g = globalThis;
    if (g.Buffer)
        return g.Buffer.from(bytes).toString("base64");
    const CHUNK = 0x8000;
    let binary = "";
    for (let i = 0; i < bytes.length; i += CHUNK) {
        const slice = bytes.subarray(i, i + CHUNK);
        binary += String.fromCharCode.apply(null, slice);
    }
    return btoa(binary);
}
function b64ToU8(b64) {
    const g = globalThis;
    if (g.Buffer)
        return new Uint8Array(g.Buffer.from(b64, "base64"));
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++)
        out[i] = s.charCodeAt(i);
    return out;
}
function copyMeta(src, dest) {
    for (const k of META_KEYS) {
        const v = src[k];
        if (v !== undefined)
            dest[k] = v;
    }
}
/** 从内存 Presentation 抽出可 JSON 传输的 `__source`（无 archive 则 undefined）。 */
function serializePresentationSource(pres) {
    const src = pres.__source;
    if (!src?.files?.size || !src.presentationPath)
        return undefined;
    const files = {};
    for (const [path, bytes] of src.files) {
        files[path] = u8ToB64(bytes);
    }
    const out = {
        presentationPath: src.presentationPath,
        files,
        slidePartPaths: pres.slides.map((s) => s.__source?.partPath ?? null),
    };
    copyMeta(src, out);
    return out;
}
function deserializePresentationSource(raw) {
    const files = new Map();
    for (const [path, b64] of Object.entries(raw.files ?? {})) {
        if (typeof b64 !== "string" || !path)
            continue;
        try {
            files.set(path, b64ToU8(b64));
        }
        catch {
            // skip corrupt part
        }
    }
    const source = {
        files,
        presentationPath: raw.presentationPath,
    };
    copyMeta(raw, source);
    return { source, slidePartPaths: raw.slidePartPaths };
}
