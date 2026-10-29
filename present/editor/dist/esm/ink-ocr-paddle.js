// PaddleOCR.js (PP-OCRv6_medium, self-hosted) — local browser OCR, the ceiling for
// on-device handwritten CJK. Lazy-loaded so tesseract-only paths do not pull OpenCV / ONNX.
//
// Model choice: PP-OCRv6_medium is NOT bundled in the SDK's registry, so we override
// both det + rec with explicit `*ModelName` + `*ModelAsset` pointing at the official
// PaddleX ONNX tars on bcebos (det ~62 MB / rec ~77 MB). On PaddleOCR's multi-scene
// benchmark this reads handwritten Chinese at 62.1 — vs 41.7 for the old
// PP-OCRv5_mobile and 57.6 for the bundled PP-OCRv6_small.
//
// Contract enforced by the SDK: the `*ModelName` we pass MUST equal the `model_name`
// declared inside each tar's inference.yml (verified: PP-OCRv6_medium_det /
// PP-OCRv6_medium_rec). The rec char dict (18.7k entries, incl. CJK) and image_shape
// come from the tar, so the model is language-agnostic — one det + one rec cover all
// langs. That lets us cache a single instance and never rebuild/redownload on a
// language switch. bcebos serves reflective CORS + Expires headers, so the browser
// fetches cross-origin and caches the tars after the first ~139 MB download.
const V6_MEDIUM = {
    detName: "PP-OCRv6_medium_det",
    recName: "PP-OCRv6_medium_rec",
    detUrl: "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv6_medium_det_onnx_infer.tar",
    recUrl: "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv6_medium_rec_onnx_infer.tar",
};
// Content-Length of each tar (from bcebos). Used to seed the progress bar before
// the first response headers arrive, and as the download total.
const V6_MEDIUM_DET_BYTES = 62_044_160;
const V6_MEDIUM_REC_BYTES = 76_718_080;
/** Combined one-time download size (~139 MB) — for the consent prompt. */
export const PADDLE_MODEL_APPROX_BYTES = V6_MEDIUM_DET_BYTES + V6_MEDIUM_REC_BYTES;
// PP-OCRv6_medium is language-agnostic, so a single instance serves every language.
let cache = null;
let init = null;
// Once the user has downloaded the model successfully, remember it so later sessions
// skip the consent prompt (the tars are HTTP-cached; a fresh download still shows
// progress, just without asking again).
const CONSENT_KEY = "ppt.inkOcr.modelConsented";
/** True if the user has already consented to (and completed) the model download once. */
export function hasPaddleModelConsent() {
    try {
        return globalThis.localStorage?.getItem(CONSENT_KEY) === "1";
    }
    catch {
        return false;
    }
}
function markPaddleModelConsent() {
    try {
        globalThis.localStorage?.setItem(CONSENT_KEY, "1");
    }
    catch {
        // ignore (private mode / disabled storage)
    }
}
/**
 * Wraps `fetch` to report byte-level download progress for the model tars.
 * Both det + rec are fetched in parallel through the same closure, so totals /
 * loaded aggregate across them. Content-Length is CORS-safelisted (and bcebos also
 * lists it in Access-Control-Expose-Headers), so it is readable cross-origin.
 */
function makeProgressFetch(onProgress) {
    const totals = new Map([
        [V6_MEDIUM.detUrl, V6_MEDIUM_DET_BYTES],
        [V6_MEDIUM.recUrl, V6_MEDIUM_REC_BYTES],
    ]);
    const loaded = new Map();
    const emit = () => {
        let l = 0;
        for (const v of loaded.values())
            l += v;
        let t = 0;
        for (const v of totals.values())
            t += v;
        onProgress({ loaded: l, total: t, fraction: t > 0 ? Math.min(1, l / t) : 0 });
    };
    const impl = async (input, requestInit) => {
        const url = typeof input === "string"
            ? input
            : input instanceof URL
                ? input.href
                : input instanceof Request
                    ? input.url
                    : String(input);
        const res = await fetch(input, requestInit);
        const len = Number(res.headers.get("content-length"));
        if (Number.isFinite(len) && len > 0)
            totals.set(url, len);
        loaded.set(url, 0);
        if (!res.ok || !res.body) {
            emit();
            return res;
        }
        const reader = res.body.getReader();
        const stream = new ReadableStream({
            async pull(controller) {
                try {
                    const { done, value } = await reader.read();
                    if (done) {
                        controller.close();
                        return;
                    }
                    loaded.set(url, (loaded.get(url) ?? 0) + value.byteLength);
                    emit();
                    controller.enqueue(value);
                }
                catch (err) {
                    controller.error(err);
                }
            },
            cancel(reason) {
                void reader.cancel(reason);
            },
        });
        return new Response(stream, { status: res.status, statusText: res.statusText, headers: res.headers });
    };
    return impl;
}
/**
 * Kick off the (lazy) model download + session build, reporting progress. Safe to
 * call before recognition so the UI can show a consent + progress dialog; once it
 * resolves, `recognizeInkPaddle` reuses the cached instance with no extra download.
 */
export function preloadPaddleOcr(onProgress) {
    return getPaddle(onProgress).then(() => undefined);
}
export function paddleLangFromProofing(langTag) {
    const tag = langTag.trim().toLowerCase().replace(/_/g, "-");
    if (tag.startsWith("zh-hant") || tag.startsWith("zh-tw") || tag.startsWith("zh-hk") || tag.startsWith("zh-mo")) {
        return "chinese_cht";
    }
    if (tag.startsWith("ja"))
        return "japan";
    if (tag.startsWith("en"))
        return "en";
    // Reported for display only — PP-OCRv6_medium's rec dict covers every language, so
    // this mapping does not select a model; `ch` is the best label for mixed ink.
    return "ch";
}
function isOrtGraphNoise(args) {
    const text = args.map(String).join(" ");
    return text.includes("CleanUnusedInitializersAndNodeArgs") || text.includes("Removing initializer 'p2o.");
}
/** Paddle2ONNX leftover initializers spam ORT wasm at warning level during session create. */
async function withSilencedOrtLogs(fn) {
    const origWarn = console.warn;
    const origError = console.error;
    const filter = ((...args) => {
        if (!isOrtGraphNoise(args))
            origWarn.apply(console, args);
    });
    const filterErr = ((...args) => {
        if (!isOrtGraphNoise(args))
            origError.apply(console, args);
    });
    console.warn = filter;
    console.error = filterErr;
    try {
        return await fn();
    }
    finally {
        console.warn = origWarn;
        console.error = origError;
    }
}
function joinItems(items) {
    const usable = items.filter((it) => it.text.trim());
    if (!usable.length)
        return { text: "", confidence: 0 };
    usable.sort((a, b) => {
        const ay = a.poly[0]?.[1] ?? 0;
        const by = b.poly[0]?.[1] ?? 0;
        if (Math.abs(ay - by) > 14)
            return ay - by;
        return (a.poly[0]?.[0] ?? 0) - (b.poly[0]?.[0] ?? 0);
    });
    const text = usable.map((it) => it.text.trim()).join(" ").replace(/\s+/g, " ").trim();
    const confidence = (usable.reduce((s, it) => s + it.score, 0) / usable.length) * 100;
    return { text, confidence };
}
async function getPaddle(onProgress) {
    if (cache)
        return cache;
    if (init)
        return init;
    init = (async () => {
        const { PaddleOCR } = await import("@paddleocr/paddleocr-js");
        const ocr = await withSilencedOrtLogs(() => PaddleOCR.create({
            // ocrVersion satisfies the SDK's base-selection validation; the explicit
            // det/rec overrides below take precedence for the actual models loaded.
            ocrVersion: "PP-OCRv6",
            worker: false,
            // Custom fetch (only valid with worker:false) streams download progress.
            ...(onProgress ? { fetch: makeProgressFetch(onProgress) } : {}),
            textDetectionModelName: V6_MEDIUM.detName,
            textDetectionModelAsset: { url: V6_MEDIUM.detUrl },
            textRecognitionModelName: V6_MEDIUM.recName,
            textRecognitionModelAsset: { url: V6_MEDIUM.recUrl },
            ortOptions: {
                backend: "wasm",
                wasmPaths: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/",
                numThreads: 1,
                simd: true,
            },
        }));
        cache = ocr;
        markPaddleModelConsent();
        return ocr;
    })();
    try {
        return await init;
    }
    finally {
        init = null;
    }
}
export function paddleOcrReady() {
    return cache !== null;
}
export async function disposePaddleOcr() {
    if (!cache)
        return;
    try {
        await cache.dispose();
    }
    catch {
        // ignore
    }
    cache = null;
    init = null;
}
/** Returns null when PaddleOCR is unavailable or reads nothing (caller falls back). */
export async function recognizeInkPaddle(canvas, langTag, meta) {
    const lang = paddleLangFromProofing(langTag);
    try {
        const ocr = await getPaddle();
        const results = await ocr.predict(canvas, {
            textDetThresh: 0.1,
            textDetBoxThresh: 0.3,
            // Standard 1.5. Higher (was 2.2) over-expands det boxes so neighbouring
            // characters / lines of handwriting merge into one box and mis-read.
            textDetUnclipRatio: 1.5,
            textRecScoreThresh: 0.2,
        });
        const { text, confidence } = joinItems(results[0]?.items ?? []);
        // Paddle ran; empty text still counts as a result so we do not drop to Tesseract.
        return {
            text,
            confidence,
            lang,
            strokeCount: meta.strokeCount,
            previewDataUrl: meta.previewDataUrl,
            engine: "paddle",
            scope: meta.scope,
        };
    }
    catch (err) {
        console.warn("[ink-ocr] PaddleOCR failed, falling back to Tesseract", err);
        return null;
    }
}
