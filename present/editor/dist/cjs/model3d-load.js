"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODEL3D_CUSTOM_PRESET_ID = void 0;
exports.detectModel3DMime = detectModel3DMime;
exports.model3DDataUrlFromBytes = model3DDataUrlFromBytes;
exports.normalizeModel3DDataUrl = normalizeModel3DDataUrl;
exports.loadModel3DFromUrl = loadModel3DFromUrl;
exports.loadModel3DFromFile = loadModel3DFromFile;
exports.fetchGlbAsDataUrl = fetchGlbAsDataUrl;
exports.readModel3DFileAsDataUrl = readModel3DFileAsDataUrl;
exports.model3DPresetAssetUrl = model3DPresetAssetUrl;
exports.loadModel3DPresetAsDataUrl = loadModel3DPresetAsDataUrl;
exports.model3DDataUrlByteSize = model3DDataUrlByteSize;
function bytesToBase64(bytes) {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    if (typeof btoa !== "undefined")
        return btoa(bin);
    const g = globalThis;
    if (g.Buffer)
        return g.Buffer.from(bytes).toString("base64");
    throw new Error("base64 encoder unavailable");
}
function parseDataUrl(dataUrl) {
    const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
    if (!m)
        return null;
    const b64 = m[2];
    let bin;
    if (typeof atob !== "undefined")
        bin = atob(b64);
    else {
        const g = globalThis;
        if (!g.Buffer)
            return null;
        return { mime: m[1], bytes: g.Buffer.from(b64, "base64") };
    }
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++)
        bytes[i] = bin.charCodeAt(i);
    return { mime: m[1], bytes };
}
/** Detect glTF binary vs JSON from file bytes. */
function detectModel3DMime(bytes, fileName) {
    if (bytes.length >= 4) {
        const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
        if (magic === "glTF")
            return "model/gltf-binary";
    }
    const head = new TextDecoder().decode(bytes.subarray(0, Math.min(48, bytes.length))).trimStart();
    if (head.startsWith("{"))
        return "model/gltf+json";
    const lower = fileName?.toLowerCase() ?? "";
    if (lower.endsWith(".gltf"))
        return "model/gltf+json";
    if (lower.endsWith(".glb"))
        return "model/gltf-binary";
    return null;
}
function model3DDataUrlFromBytes(bytes, mime) {
    return `data:${mime};base64,${bytesToBase64(bytes)}`;
}
/** Ensure a user/model data URL uses a glTF MIME type understood by serializer + Three.js. */
function normalizeModel3DDataUrl(dataUrl, fileName) {
    const parsed = parseDataUrl(dataUrl);
    if (!parsed)
        return dataUrl;
    const mime = parsed.mime.toLowerCase();
    if (mime === "model/gltf-binary" || mime === "model/gltf+json") {
        return dataUrl;
    }
    const detected = detectModel3DMime(parsed.bytes, fileName);
    if (!detected)
        return dataUrl;
    return model3DDataUrlFromBytes(parsed.bytes, detected);
}
function labelFromName(name) {
    return name.replace(/\.(glb|gltf)$/i, "").trim() || "3D Model";
}
function labelFromUrl(url) {
    try {
        const u = new URL(url);
        const last = u.pathname.split("/").pop() ?? "";
        return labelFromName(decodeURIComponent(last));
    }
    catch {
        return labelFromName(url.split("/").pop() ?? "3D Model");
    }
}
/** Fetch a remote `.glb` / `.gltf` and return an embeddable data URL. */
async function loadModel3DFromUrl(url) {
    const trimmed = url.trim();
    if (!trimmed)
        throw new Error("empty url");
    const res = await fetch(trimmed);
    if (!res.ok)
        throw new Error(`Failed to load 3D model (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const detected = detectModel3DMime(bytes, trimmed) ??
        (trimmed.toLowerCase().includes(".gltf") ? "model/gltf+json" : "model/gltf-binary");
    return {
        glbSrc: model3DDataUrlFromBytes(bytes, detected),
        label: labelFromUrl(trimmed),
    };
}
/** Read a user-selected `.glb` / `.gltf` file as a normalized data URL. */
async function loadModel3DFromFile(file) {
    const raw = await readModel3DFileAsDataUrl(file);
    const glbSrc = normalizeModel3DDataUrl(raw, file.name);
    return { glbSrc, label: labelFromName(file.name) };
}
/** Fetch a `.glb` URL and return a `data:model/gltf-binary;base64,...` URL. */
async function fetchGlbAsDataUrl(url) {
    const { glbSrc } = await loadModel3DFromUrl(url);
    return glbSrc;
}
/** Read a user-selected `.glb` / `.gltf` file as a data URL. */
function readModel3DFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error("read failed"));
        reader.readAsDataURL(file);
    });
}
function model3DPresetAssetUrl(baseUrl, preset) {
    const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const path = preset.samplePath.startsWith("/") ? preset.samplePath.slice(1) : preset.samplePath;
    return `${base}${path}`;
}
async function loadModel3DPresetAsDataUrl(preset, baseUrl = "/") {
    return fetchGlbAsDataUrl(model3DPresetAssetUrl(baseUrl, preset));
}
exports.MODEL3D_CUSTOM_PRESET_ID = "custom";
/** Byte length of a glTF data URL (for inspector labels). */
function model3DDataUrlByteSize(glbSrc) {
    const parsed = glbSrc ? parseDataUrl(glbSrc) : null;
    return parsed?.bytes.length ?? null;
}
