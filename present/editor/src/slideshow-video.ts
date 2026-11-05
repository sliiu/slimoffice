import { ooxml } from "@ppt/animation";
import { lecturePipRect, lectureTakeFor, type Presentation, type Slide } from "@ppt/core";
import { buildOoxmlPlayback, createBake3DRuntime } from "@ppt/player";
import {
  applyEntranceHideToScene,
  CanvasBackend,
  createScene,
  waitForImagesLoaded,
} from "@ppt/renderer";
import { ensureExportRecordingBlob } from "./video-export";

/** Cap click steps recorded per slide so a looping timeline cannot run away. */
export const MAX_VIDEO_CLICK_STEPS = 24;
/** Cap the playing time of one step (seconds, video time) so indefinite loops end. */
export const MAX_STEP_SECONDS = 20;

export const VIDEO_FPS_CHOICES = [12, 24, 30] as const;
export const VIDEO_SPEED_CHOICES = [0.5, 0.75, 1, 1.5, 2] as const;
/** Output height presets; `0` keeps the deck's own pixel size. */
export const VIDEO_HEIGHT_CHOICES = [0, 720, 1080] as const;

export interface SlideshowVideoOptions {
  /** Frames per second of the rendered video (also the animation sampling rate). */
  fps?: number;
  /** Output height in pixels; 0 / undefined keeps `pres.size`. Width follows the deck aspect ratio. */
  height?: number;
  /** Seconds a slide stays after its last animation settles when it has no rehearsed timing. */
  slideHold?: number;
  /** Honor rehearsed / transition `advAfter` for the final hold. Default true. */
  useTimings?: boolean;
  /** Seconds between one click's animation settling and the next click. */
  clickGap?: number;
  /** Playback rate applied to animations, holds and transitions (2 = twice as fast). */
  speed?: number;
  /** `mp4` converts the recording in the browser with ffmpeg.wasm; `webm` returns the recording as is. */
  format?: VideoFormat;
  /** 讲解出镜的 `idb:` 引用由调用方换成可播放地址。http(s) / blob 引用直接用。 */
  resolveLectureCamera?: (ref: string) => Promise<string | null>;
  onProgress?: (progress: SlideshowVideoProgress) => void;
}

export type VideoFormat = "mp4" | "webm";

export type SlideshowVideoProgress =
  | { phase: "render"; done: number; total: number }
  | { phase: "convert" };

export const DEFAULT_VIDEO_OPTIONS: Required<
  Pick<SlideshowVideoOptions, "fps" | "height" | "slideHold" | "useTimings" | "clickGap" | "speed" | "format">
> = {
  fps: 24,
  height: 0,
  slideHold: 2,
  useTimings: true,
  clickGap: 0.8,
  speed: 1,
  format: "mp4",
};

/** How long a slide stays on screen after its animations (seconds, before speed). */
export function slideHoldSeconds(slide: Slide, fallback = 2, useTimings = true): number {
  const adv = slide.transition?.params?.advAfter;
  if (useTimings && typeof adv === "number" && adv > 0) return Math.max(0.4, adv);
  return Math.max(0.4, fallback);
}

/** Crossfade length taken from the incoming slide's transition. Cut / none are instant. */
export function slideFadeSeconds(slide: Slide): number {
  const kind = slide.transition?.kind;
  if (!kind || kind === "none" || kind === "cut") return 0;
  return Math.max(0, slide.transition?.duration ?? 0.5);
}

export function slideshowVideoSlides(pres: Presentation): Slide[] {
  return pres.slides.filter((s) => s.show !== false);
}

/** Output pixel size for a requested height (0 = native), keeping aspect ratio and even dimensions. */
export function videoOutputSize(
  size: { width: number; height: number },
  height: number | undefined,
): { width: number; height: number; scale: number } {
  const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2);
  if (!height || height <= 0 || size.height <= 0) {
    return { width: even(size.width), height: even(size.height), scale: 1 };
  }
  const scale = height / size.height;
  return { width: even(size.width * scale), height: even(height), scale };
}

/** Number of frames a duration occupies at `fps` after applying `speed`; at least 1 for positive input. */
export function framesFor(seconds: number, fps: number, speed: number): number {
  if (seconds <= 0) return 0;
  return Math.max(1, Math.round((seconds / Math.max(0.01, speed)) * fps));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickRecorderMime(withAudio: boolean): string {
  const candidates = withAudio
    ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp9", "video/webm"]
    : ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
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
  private next = 0;
  constructor(private readonly frameMs: number) {}
  start(): void {
    this.next = performance.now();
  }
  async frame(): Promise<void> {
    this.next += this.frameMs;
    const delta = this.next - performance.now();
    if (delta > 0) await wait(delta);
    else if (delta < -this.frameMs * 4) this.next = performance.now();
    else await wait(0);
  }
}

interface LiveSlide {
  canvas: HTMLCanvasElement;
  flush(): void;
  runtime: ooxml.TimingRuntime | null;
  ticker: ooxml.ManualTicker;
  destroy(): void;
}

/** Offscreen canvas for one slide with its animation runtime bound to a manual ticker. */
async function openLiveSlide(slide: Slide, pres: Presentation, scale: number): Promise<LiveSlide> {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-99999px";
  host.style.top = "0";
  host.style.width = `${pres.size.width}px`;
  host.style.height = `${pres.size.height}px`;
  document.body.appendChild(host);
  const scene = createScene(slide, pres.size, { masters: pres.masters });
  applyEntranceHideToScene(scene, slide);
  const backend = new CanvasBackend(scene, host, { pixelRatio: scale });
  const bake = createBake3DRuntime();
  bake.kick(slide, scene);
  await bake.waitForAll();
  backend.flush();
  await waitForImagesLoaded();
  backend.flush();
  const ticker = new ooxml.ManualTicker();
  const play = buildOoxmlPlayback(
    slide,
    scene,
    { slideWidth: pres.size.width, slideHeight: pres.size.height },
    { themeColors: pres.theme?.colors, ticker },
  );
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
 * 旁白音轨。页内普通音频和嵌入视频的声音不在这里。
 */
export function narrationClips(slide: Slide): { src: string; volume: number }[] {
  const clips: { src: string; volume: number }[] = [];
  for (const layer of slide.layers) {
    for (const sh of layer.shapes) {
      if (sh.kind !== "audio" || !sh.isNarration || !sh.src || /^rId\d+/i.test(sh.src)) continue;
      clips.push({ src: sh.src, volume: typeof sh.volume === "number" ? sh.volume : 1 });
    }
  }
  return clips;
}

interface DecodedClip {
  buffer: AudioBuffer;
  volume: number;
}

async function decodeNarration(ctx: AudioContext, clips: { src: string; volume: number }[]): Promise<DecodedClip[]> {
  const out: DecodedClip[] = [];
  for (const clip of clips) {
    try {
      const raw = await (await fetch(clip.src)).arrayBuffer();
      out.push({ buffer: await ctx.decodeAudioData(raw.slice(0)), volume: clip.volume });
    } catch {
      // 这一条解不出来就跳过，画面照常导出。
    }
  }
  return out;
}

function startDecoded(ctx: AudioContext, dest: AudioNode, clips: DecodedClip[], speed: number): { stop(): void } {
  const nodes: AudioBufferSourceNode[] = [];
  for (const clip of clips) {
    const src = ctx.createBufferSource();
    src.buffer = clip.buffer;
    src.playbackRate.value = speed;
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, clip.volume);
    src.connect(gain);
    gain.connect(dest);
    src.start();
    nodes.push(src);
  }
  return {
    stop(): void {
      for (const node of nodes) {
        try {
          node.stop();
        } catch {
          // 已经播完。
        }
      }
    },
  };
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  rect: { x: number; y: number; w: number; h: number },
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || video.readyState < 2) return;
  const scale = Math.max(rect.w / vw, rect.h / vh);
  const sw = rect.w / scale;
  const sh = rect.h / scale;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, Math.min(10, rect.w / 8, rect.h / 8));
  ctx.clip();
  ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

async function openLectureVideo(src: string): Promise<HTMLVideoElement | null> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const ready = new Promise<boolean>((resolve) => {
    video.onloadeddata = () => resolve(video.videoWidth > 0);
    video.onerror = () => resolve(false);
  });
  video.src = src;
  const ok = await ready;
  video.pause();
  if (!ok) {
    video.removeAttribute("src");
    return null;
  }
  return video;
}

/**
 * Render the deck as a video by playing it: every visible slide's on-load animations run,
 * each click is advanced once the previous one settles (`clickGap` apart), the slide then
 * holds for its rehearsed time (or `slideHold`), and non-cut transitions crossfade into the
 * next slide. Animations are sampled at `fps` through a manual ticker, so the timeline is
 * exact regardless of render cost. `speed` scales animations, holds, fades, narration and
 * the lecture camera alike.
 *
 * Narration audio (`isNarration`) is mixed into the recording. A lecture camera plays in
 * the same corner as slideshow. Other video shapes stay on their poster frame.
 */
export async function exportSlideshowVideo(
  pres: Presentation,
  opts?: SlideshowVideoOptions,
): Promise<{ blob: Blob; ext: string }> {
  if (typeof document === "undefined" || typeof MediaRecorder === "undefined") {
    throw new Error("slideshow video requires a browser");
  }
  const slides = slideshowVideoSlides(pres);
  if (!slides.length) throw new Error("no slides");
  const wantAudio = slides.some((slide) => narrationClips(slide).length > 0);
  const mime = pickRecorderMime(wantAudio);
  if (!mime) throw new Error("MediaRecorder has no video mime");

  const fps = opts?.fps ?? DEFAULT_VIDEO_OPTIONS.fps;
  const speed = opts?.speed ?? DEFAULT_VIDEO_OPTIONS.speed;
  const clickGap = opts?.clickGap ?? DEFAULT_VIDEO_OPTIONS.clickGap;
  const slideHold = opts?.slideHold ?? DEFAULT_VIDEO_OPTIONS.slideHold;
  const useTimings = opts?.useTimings ?? DEFAULT_VIDEO_OPTIONS.useTimings;
  const out = videoOutputSize(pres.size, opts?.height);

  const canvas = document.createElement("canvas");
  canvas.width = out.width;
  canvas.height = out.height;
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof canvas.captureStream !== "function") throw new Error("canvas capture unavailable");

  let audioCtx: AudioContext | null = null;
  let audioDest: MediaStreamAudioDestinationNode | null = null;
  const decoded = new Map<string, DecodedClip[]>();
  if (wantAudio && typeof AudioContext !== "undefined") {
    try {
      audioCtx = new AudioContext();
      await audioCtx.resume().catch(() => undefined);
      audioDest = audioCtx.createMediaStreamDestination();
      const osc = audioCtx.createOscillator();
      const silent = audioCtx.createGain();
      silent.gain.value = 0;
      osc.connect(silent);
      silent.connect(audioDest);
      osc.start();
      for (const slide of slides) {
        const clips = narrationClips(slide);
        if (clips.length) decoded.set(slide.id, await decodeNarration(audioCtx, clips));
      }
    } catch {
      audioCtx = null;
      audioDest = null;
      decoded.clear();
    }
  }

  const pipRect = lecturePipRect({ width: canvas.width, height: canvas.height }, pres.lecture?.frame);
  const cameras = new Map<string, HTMLVideoElement>();
  const ownedUrls: string[] = [];
  for (const slide of slides) {
    const ref = lectureTakeFor(pres.lecture, slide.id)?.cameraRef;
    if (!ref) continue;
    const src = ref.startsWith("idb:") ? (await opts?.resolveLectureCamera?.(ref)) ?? null : ref;
    if (!src) continue;
    const video = await openLectureVideo(src);
    if (!video) {
      if (src.startsWith("blob:")) URL.revokeObjectURL(src);
      continue;
    }
    if (src.startsWith("blob:")) ownedUrls.push(src);
    cameras.set(slide.id, video);
  }

  const stream = canvas.captureStream(fps);
  const audioTrack = audioDest?.stream.getAudioTracks()[0];
  if (audioTrack) stream.addTrack(audioTrack);
  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data.size > 0) chunks.push(ev.data);
  };
  const stopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
  });

  const frameMs = 1000 / fps;
  const stepMs = frameMs * speed;
  const pacer = new FramePacer(frameMs);
  const blit = (src: CanvasImageSource, alpha = 1): void => {
    ctx.globalAlpha = alpha;
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
  };
  let pip: HTMLVideoElement | null = null;
  const paintPip = (): void => {
    if (pip) drawCover(ctx, pip, pipRect);
  };

  // Advance the live slide by one frame and paint it. Holds keep ticking so looping
  // emphasis effects stay alive instead of freezing on a still.
  const step = async (live: LiveSlide): Promise<void> => {
    live.ticker.tick(stepMs);
    live.flush();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    blit(live.canvas);
    paintPip();
    await pacer.frame();
  };
  const hold = async (live: LiveSlide, seconds: number): Promise<void> => {
    const n = framesFor(seconds, fps, speed);
    for (let f = 0; f < n; f++) await step(live);
  };
  const playUntilIdle = async (live: LiveSlide): Promise<void> => {
    const cap = framesFor(MAX_STEP_SECONDS, fps, 1);
    let f = 0;
    while (live.runtime?.isPlaying() && f++ < cap) await step(live);
  };
  const snapshot = (): HTMLCanvasElement => {
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext("2d")?.drawImage(canvas, 0, 0);
    return copy;
  };

  recorder.start();
  pacer.start();
  let prevFrame: HTMLCanvasElement | undefined;
  try {
    for (let s = 0; s < slides.length; s++) {
      const slide = slides[s]!;
      const live = await openLiveSlide(slide, pres, out.scale);
      const camera = cameras.get(slide.id) ?? null;
      pip = camera;
      if (camera) {
        camera.playbackRate = speed;
        try {
          camera.currentTime = 0;
        } catch {
          // 还没到能 seek 的时候就从当前帧画。
        }
        await camera.play().catch(() => undefined);
      }
      const narration =
        audioCtx && audioDest
          ? startDecoded(audioCtx, audioDest, decoded.get(slide.id) ?? [], speed)
          : { stop(): void {} };
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
            paintPip();
            await pacer.frame();
          }
        } else {
          live.flush();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          blit(live.canvas);
          paintPip();
          await pacer.frame();
        }

        if (live.runtime) {
          live.runtime.startAutoSteps();
          await playUntilIdle(live);
          let guard = 0;
          while (guard++ < MAX_VIDEO_CLICK_STEPS && live.runtime.hasNext()) {
            await hold(live, clickGap);
            const before = live.runtime.currentStep();
            if (!live.runtime.click()) break;
            // A click that lands on a still-running step only fast-forwards it (PowerPoint
            // semantics); advance again so every loop iteration starts a new step.
            if (live.runtime.currentStep() === before && !live.runtime.click()) break;
            await playUntilIdle(live);
          }
        }
        await hold(live, slideHoldSeconds(slide, slideHold, useTimings));
        prevFrame = snapshot();
      } finally {
        narration.stop();
        camera?.pause();
        pip = null;
        live.destroy();
      }
      opts?.onProgress?.({ phase: "render", done: s + 1, total: slides.length });
    }
  } finally {
    recorder.stop();
    for (const video of cameras.values()) {
      video.pause();
      video.removeAttribute("src");
    }
    for (const url of ownedUrls) URL.revokeObjectURL(url);
    void audioCtx?.close();
  }
  const raw = await stopped;
  if ((opts?.format ?? DEFAULT_VIDEO_OPTIONS.format) === "webm") return { blob: raw, ext: "webm" };
  opts?.onProgress?.({ phase: "convert" });
  // 放映视频只在浏览器里转 MP4，不把整段录像上传到网关。
  return ensureExportRecordingBlob(raw);
}
