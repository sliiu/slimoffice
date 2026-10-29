import { t } from "./i18n/index.js";
export function isScreenshotSupported() {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
}
function waitForVideoFrame(video) {
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error(t("dialog.screenshot.failed"))), 8000);
        const done = () => {
            window.clearTimeout(timer);
            resolve();
        };
        const rvfc = video.requestVideoFrameCallback;
        if (typeof rvfc === "function") {
            rvfc.call(video, () => done());
            return;
        }
        const afterPaint = () => {
            requestAnimationFrame(() => requestAnimationFrame(() => done()));
        };
        if (video.readyState >= 2 && video.videoWidth > 0) {
            afterPaint();
            return;
        }
        video.onloadeddata = () => afterPaint();
    });
}
/** Insert → Screenshot：捕获屏幕/窗口一帧为 PNG data URL。 */
export async function captureScreenshot(doc) {
    if (!isScreenshotSupported())
        return null;
    let stream = null;
    const video = doc.createElement("video");
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.style.cssText = "position:fixed;left:-99999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
    doc.body.appendChild(video);
    try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        video.srcObject = stream;
        await video.play();
        await waitForVideoFrame(video);
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h)
            throw new Error(t("dialog.screenshot.failed"));
        const canvas = doc.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx)
            throw new Error(t("dialog.screenshot.failed"));
        ctx.drawImage(video, 0, 0, w, h);
        return { dataUrl: canvas.toDataURL("image/png"), w, h };
    }
    catch (e) {
        if (e instanceof DOMException && (e.name === "AbortError" || e.name === "NotAllowedError")) {
            return null;
        }
        throw e instanceof Error ? e : new Error(t("dialog.screenshot.failed"));
    }
    finally {
        stream?.getTracks().forEach((tr) => tr.stop());
        video.srcObject = null;
        video.remove();
    }
}
