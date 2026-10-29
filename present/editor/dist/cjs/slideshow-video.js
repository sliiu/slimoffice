"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_VIDEO_OPTIONS = exports.VIDEO_HEIGHT_CHOICES = exports.VIDEO_SPEED_CHOICES = exports.VIDEO_FPS_CHOICES = exports.MAX_STEP_SECONDS = exports.MAX_VIDEO_CLICK_STEPS = void 0;
exports.slideHoldSeconds = slideHoldSeconds;
exports.slideFadeSeconds = slideFadeSeconds;
exports.slideshowVideoSlides = slideshowVideoSlides;
exports.videoOutputSize = videoOutputSize;
exports.framesFor = framesFor;
exports.exportSlideshowVideo = exportSlideshowVideo;
const animation_1 = require("@sliiu/present-animation");
const player_1 = require("@sliiu/present-player");
const renderer_1 = require("@sliiu/present-renderer");
const video_export_1 = require("./video-export");
/** Cap click steps recorded per slide so a looping timeline cannot run away. */
exports.MAX_VIDEO_CLICK_STEPS = 24;
/** Cap the playing time of one step (seconds, video time) so indefinite loops end. */
exports.MAX_STEP_SECONDS = 20;
exports.VIDEO_FPS_CHOICES = [12, 24, 30];
exports.VIDEO_SPEED_CHOICES = [0.5, 0.75, 1, 1.5, 2];
/** Output height presets; `0` keeps the deck's own pixel size. */
exports.VIDEO_HEIGHT_CHOICES = [0, 720, 1080];
exports.DEFAULT_VIDEO_OPTIONS = {
    fps: 24,
    height: 0,
    slideHold: 2,
    useTimings: true,
    clickGap: 0.8,
    speed: 1,
    format: "mp4",
};
/** How long a slide stays on screen after its animations (seconds, before speed). */
function slideHoldSeconds(slide, fallback = 2, useTimings = true) {
    const adv = slide.transition?.params?.advAfter;
    if (useTimings && typeof adv === "number" && adv > 0)
        return Math.max(0.4, adv);
    return Math.max(0.4, fallback);
}
/** Crossfade length taken from the incoming slide's transition. Cut / none are instant. */
function slideFadeSeconds(slide) {
    const kind = slide.transition?.kind;
    if (!kind || kind === "none" || kind === "cut")
        return 0;
    return Math.max(0, slide.transition?.duration ?? 0.5);
}
function slideshowVideoSlides(pres) {
    return pres.slides.filter((s) => s.show !== false);
}
/** Output pixel size for a requested height (0 = native), keeping aspect ratio and even dimensions. */
function videoOutputSize(size, height) {
    const even = (n) => Math.max(2, Math.round(n / 2) * 2);
    if (!height || height <= 0 || size.height <= 0) {
        return { width: even(size.width), height: even(size.height), scale: 1 };
    }
    const scale = height / size.height;
    return { width: even(size.width * scale), height: even(height), scale };
}
/** Number of frames a duration occupies at `fps` after applying `speed`; at least 1 for positive input. */
function framesFor(seconds, fps, speed) {
    if (seconds <= 0)
        return 0;
    return Math.max(1, Math.round((seconds / Math.max(0.01, speed)) * fps));
}
function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function pickRecorderMime() {
    const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    if (typeof MediaRecorder === "undefined")
        return "";
    for (const m of candidates) {
        if (MediaRecorder.isTypeSupported(m))
            return m;
    }
    return "";
}
/**
 * Paces the recording canvas at a fixed frame period against the wall clock (MediaRecorder
 * stamps frames in real time). Late frames are not skipped: the runtime is advanced by the
 * nominal frame step regardless, so slow rendering only stretches wall time, never the
 * timing relationships inside the video.
 */
class FramePacer {
    frameMs;
    next = 0;
    constructor(frameMs) {
        this.frameMs = frameMs;
    }
    start() {
        this.next = performance.now();
    }
    async frame() {
        this.next += this.frameMs;
        const delta = this.next - performance.now();
        if (delta > 0)
            await wait(delta);
        else if (delta < -this.frameMs * 4)
            this.next = performance.now();
        else
            await wait(0);
    }
}
/** Offscreen canvas for one slide with its animation runtime bound to a manual ticker. */
async function openLiveSlide(slide, pres, scale) {
    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "-99999px";
    host.style.top = "0";
    host.style.width = `${pres.size.width}px`;
    host.style.height = `${pres.size.height}px`;
    document.body.appendChild(host);
    const scene = (0, renderer_1.createScene)(slide, pres.size, { masters: pres.masters });
    (0, renderer_1.applyEntranceHideToScene)(scene, slide);
    const backend = new renderer_1.CanvasBackend(scene, host, { pixelRatio: scale });
    const bake = (0, player_1.createBake3DRuntime)();
    bake.kick(slide, scene);
    await bake.waitForAll();
    backend.flush();
    await (0, renderer_1.waitForImagesLoaded)();
    backend.flush();
    const ticker = new animation_1.ooxml.ManualTicker();
    const play = (0, player_1.buildOoxmlPlayback)(slide, scene, { slideWidth: pres.size.width, slideHeight: pres.size.height }, { themeColors: pres.theme?.colors, ticker });
    return {
        canvas: backend.canvas,
        flush: () => backend.flush(),
        runtime: play && play.mainSteps.length > 0 ? play.runtime : null,
        ticker,
        destroy: () => {
            play?.runtime.destroy();
            backend.destroy();
            host.remove();
        },
    };
}
/**
 * Render the deck as a video by playing it: every visible slide's on-load animations run,
 * each click is advanced once the previous one settles (`clickGap` apart), the slide then
 * holds for its rehearsed time (or `slideHold`), and non-cut transitions crossfade into the
 * next slide. Animations are sampled at `fps` through a manual ticker, so the timeline is
 * exact regardless of render cost. `speed` scales animations, holds and fades alike.
 *
 * Not captured: audio, and video shapes (they stay on their poster frame).
 */
async function exportSlideshowVideo(pres, opts) {
    if (typeof document === "undefined" || typeof MediaRecorder === "undefined") {
        throw new Error("slideshow video requires a browser");
    }
    const slides = slideshowVideoSlides(pres);
    if (!slides.length)
        throw new Error("no slides");
    const mime = pickRecorderMime();
    if (!mime)
        throw new Error("MediaRecorder has no video mime");
    const fps = opts?.fps ?? exports.DEFAULT_VIDEO_OPTIONS.fps;
    const speed = opts?.speed ?? exports.DEFAULT_VIDEO_OPTIONS.speed;
    const clickGap = opts?.clickGap ?? exports.DEFAULT_VIDEO_OPTIONS.clickGap;
    const slideHold = opts?.slideHold ?? exports.DEFAULT_VIDEO_OPTIONS.slideHold;
    const useTimings = opts?.useTimings ?? exports.DEFAULT_VIDEO_OPTIONS.useTimings;
    const out = videoOutputSize(pres.size, opts?.height);
    const canvas = document.createElement("canvas");
    canvas.width = out.width;
    canvas.height = out.height;
    const ctx = canvas.getContext("2d");
    if (!ctx || typeof canvas.captureStream !== "function")
        throw new Error("canvas capture unavailable");
    const stream = canvas.captureStream(fps);
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    const chunks = [];
    recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0)
            chunks.push(ev.data);
    };
    const stopped = new Promise((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    });
    const frameMs = 1000 / fps;
    const stepMs = frameMs * speed;
    const pacer = new FramePacer(frameMs);
    const blit = (src, alpha = 1) => {
        ctx.globalAlpha = alpha;
        ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
    };
    // Advance the live slide by one frame and paint it. Holds keep ticking so looping
    // emphasis effects stay alive instead of freezing on a still.
    const step = async (live) => {
        live.ticker.tick(stepMs);
        live.flush();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        blit(live.canvas);
        await pacer.frame();
    };
    const hold = async (live, seconds) => {
        const n = framesFor(seconds, fps, speed);
        for (let f = 0; f < n; f++)
            await step(live);
    };
    const playUntilIdle = async (live) => {
        const cap = framesFor(exports.MAX_STEP_SECONDS, fps, 1);
        let f = 0;
        while (live.runtime?.isPlaying() && f++ < cap)
            await step(live);
    };
    const snapshot = (live) => {
        const copy = document.createElement("canvas");
        copy.width = live.canvas.width;
        copy.height = live.canvas.height;
        copy.getContext("2d")?.drawImage(live.canvas, 0, 0);
        return copy;
    };
    recorder.start();
    pacer.start();
    let prevFrame;
    try {
        for (let s = 0; s < slides.length; s++) {
            const slide = slides[s];
            const live = await openLiveSlide(slide, pres, out.scale);
            try {
                // Transition: crossfade from the previous slide's last frame into this slide's
                // initial state (entrance targets still hidden), before any animation starts.
                const fadeFrames = s === 0 ? 0 : framesFor(slideFadeSeconds(slide), fps, speed);
                if (fadeFrames > 0 && prevFrame) {
                    for (let f = 1; f <= fadeFrames; f++) {
                        const t = f / fadeFrames;
                        live.flush();
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        blit(prevFrame, 1 - t);
                        blit(live.canvas, t);
                        await pacer.frame();
                    }
                }
                else {
                    live.flush();
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    blit(live.canvas);
                    await pacer.frame();
                }
                if (live.runtime) {
                    live.runtime.startAutoSteps();
                    await playUntilIdle(live);
                    let guard = 0;
                    while (guard++ < exports.MAX_VIDEO_CLICK_STEPS && live.runtime.hasNext()) {
                        await hold(live, clickGap);
                        const before = live.runtime.currentStep();
                        if (!live.runtime.click())
                            break;
                        // A click that lands on a still-running step only fast-forwards it (PowerPoint
                        // semantics); advance again so every loop iteration starts a new step.
                        if (live.runtime.currentStep() === before && !live.runtime.click())
                            break;
                        await playUntilIdle(live);
                    }
                }
                await hold(live, slideHoldSeconds(slide, slideHold, useTimings));
                prevFrame = snapshot(live);
            }
            finally {
                live.destroy();
            }
            opts?.onProgress?.({ phase: "render", done: s + 1, total: slides.length });
        }
    }
    finally {
        recorder.stop();
    }
    const raw = await stopped;
    if ((opts?.format ?? exports.DEFAULT_VIDEO_OPTIONS.format) === "webm")
        return { blob: raw, ext: "webm" };
    opts?.onProgress?.({ phase: "convert" });
    // 放映视频只在浏览器里转 MP4，不把整段录像上传到网关。
    return (0, video_export_1.ensureExportRecordingBlob)(raw);
}
