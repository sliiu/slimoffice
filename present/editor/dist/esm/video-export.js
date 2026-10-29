const FFMPEG_CORE_VER = "0.12.6";
export function extensionForRecordingMime(mime, kind) {
    const m = mime.toLowerCase();
    if (m.includes("mp4") || m.includes("m4v"))
        return kind === "video" ? "mp4" : "m4a";
    if (m.includes("m4a"))
        return "m4a";
    if (m.includes("ogg"))
        return "ogg";
    if (m.includes("webm"))
        return "webm";
    return kind === "video" ? "mp4" : "webm";
}
export function isMp4RecordingMime(mime) {
    const m = mime.toLowerCase();
    return m.includes("mp4") || m.includes("m4v") || m.includes("m4a");
}
export function isAudioRecordingBlob(blob) {
    return blob.type.toLowerCase().startsWith("audio/");
}
/** Warn before inserting very large recordings onto a slide (bytes). */
export const RECORDING_LARGE_BYTES = 50 * 1024 * 1024;
export function formatRecordingFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0)
        return "0 B";
    if (bytes >= 1024 * 1024)
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${Math.round(bytes)} B`;
}
export function formatRecordingDuration(seconds) {
    if (!seconds || !Number.isFinite(seconds) || seconds <= 0)
        return "0:00";
    const s = Math.floor(seconds);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
}
export function suggestedRecordingFilename(prefix, ext) {
    return `${prefix}-${Date.now()}.${ext}`;
}
let ffmpegLoad = null;
/** ffmpeg.wasm 下载 + 实例化上限；worker 起不来时 `load()` 只会悬着而不 reject。 */
const FFMPEG_LOAD_TIMEOUT_MS = 180_000;
/** 单次转码上限；超时按失败处理，回退到原始 WebM，而不是让用户面对永远转不完的提示。 */
const FFMPEG_EXEC_TIMEOUT_MS = 20 * 60_000;
function withTimeout(p, ms, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        p.then((v) => {
            clearTimeout(timer);
            resolve(v);
        }, (e) => {
            clearTimeout(timer);
            reject(e);
        });
    });
}
async function loadFfmpeg() {
    if (!ffmpegLoad) {
        ffmpegLoad = withTimeout((async () => {
            const { FFmpeg } = await import("@ffmpeg/ffmpeg");
            const { toBlobURL } = await import("@ffmpeg/util");
            const ffmpeg = new FFmpeg();
            const base = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VER}/dist/esm`;
            await ffmpeg.load({
                coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
                wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
            });
            return ffmpeg;
        })(), FFMPEG_LOAD_TIMEOUT_MS, "ffmpeg.wasm load");
        // 失败（网络 / worker 404 / 超时）不缓存，下次导出重试。
        ffmpegLoad.catch(() => {
            ffmpegLoad = null;
        });
    }
    return ffmpegLoad;
}
/** WebM / Ogg audio → AAC M4A when possible. */
export async function ensureMp4AudioBlob(blob) {
    const mime = blob.type.toLowerCase();
    if (mime.includes("m4a") || (mime.includes("mp4") && mime.startsWith("audio/"))) {
        return { blob, ext: "m4a" };
    }
    if (!mime.includes("webm") && !mime.includes("ogg")) {
        return { blob, ext: extensionForRecordingMime(blob.type, "audio") };
    }
    try {
        const { fetchFile } = await import("@ffmpeg/util");
        const ffmpeg = await loadFfmpeg();
        const input = "in.webm";
        const output = "out.m4a";
        await ffmpeg.writeFile(input, await fetchFile(blob));
        const rc = await ffmpeg.exec(["-i", input, "-c:a", "aac", "-movflags", "+faststart", output], FFMPEG_EXEC_TIMEOUT_MS);
        if (rc !== 0)
            throw new Error(`ffmpeg exited with ${rc}`);
        const data = await ffmpeg.readFile(output);
        await ffmpeg.deleteFile(input);
        await ffmpeg.deleteFile(output);
        const raw = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
        const copy = new Uint8Array(raw.byteLength);
        copy.set(raw);
        return { blob: new Blob([copy], { type: "audio/mp4" }), ext: "m4a" };
    }
    catch {
        return { blob, ext: extensionForRecordingMime(blob.type, "audio") };
    }
}
/** Normalize any MediaRecorder blob to MP4/M4A in the browser when possible. */
export async function ensureExportRecordingBlob(blob) {
    if (blob.type.toLowerCase().startsWith("audio/")) {
        return ensureMp4AudioBlob(blob);
    }
    return ensureMp4VideoBlob(blob);
}
/** WebM → H.264 MP4 when needed; returns native MP4 unchanged. */
export async function ensureMp4VideoBlob(blob) {
    if (isMp4RecordingMime(blob.type)) {
        return { blob, ext: "mp4" };
    }
    if (!blob.type.toLowerCase().includes("webm")) {
        return { blob, ext: extensionForRecordingMime(blob.type, "video") };
    }
    try {
        const { fetchFile } = await import("@ffmpeg/util");
        const ffmpeg = await loadFfmpeg();
        const input = "in.webm";
        const output = "out.mp4";
        await ffmpeg.writeFile(input, await fetchFile(blob));
        const rc = await ffmpeg.exec([
            "-i",
            input,
            "-c:v",
            "libx264",
            // 单线程 wasm 下 fast 档 720p 每分钟视频要编码数分钟；veryfast 在 crf 23 下画质差异很小、速度约翻倍。
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            output,
        ], FFMPEG_EXEC_TIMEOUT_MS);
        if (rc !== 0)
            throw new Error(`ffmpeg exited with ${rc}`);
        const data = await ffmpeg.readFile(output);
        await ffmpeg.deleteFile(input);
        await ffmpeg.deleteFile(output);
        const raw = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
        const copy = new Uint8Array(raw.byteLength);
        copy.set(raw);
        return { blob: new Blob([copy], { type: "video/mp4" }), ext: "mp4" };
    }
    catch {
        return { blob, ext: "webm" };
    }
}
export function downloadBlob(doc, blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = doc.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
