/**
 * Canvas / 缩略图没有 DOM `<video>`，无 poster 时从 src 抓一帧当封面。
 * file: 外链浏览器读不到字节，直接放弃。
 */
type FrameEntry =
  | { status: "pending"; wait: Promise<void> }
  | { status: "ready"; img: HTMLImageElement }
  | { status: "failed" };

const cache = new Map<string, FrameEntry>();

function cacheKey(src: string, seekTo: number): string {
  return `${src}#t=${seekTo.toFixed(3)}`;
}

export function getVideoPosterFrame(
  src: string,
  onReady?: () => void,
  seekTo = 0.08,
): HTMLImageElement | null {
  if (typeof document === "undefined" || !src) return null;
  if (src.startsWith("file:")) return null;
  const key = cacheKey(src, seekTo);
  const hit = cache.get(key);
  if (hit?.status === "ready") return hit.img;
  if (hit?.status === "failed") return null;
  if (hit?.status === "pending") {
    if (onReady) void hit.wait.then(() => onReady());
    return null;
  }
  const wait = captureFrame(src, seekTo).then((img) => {
    if (img) {
      cache.set(key, { status: "ready", img });
      onReady?.();
    } else {
      cache.set(key, { status: "failed" });
    }
  });
  cache.set(key, { status: "pending", wait });
  return null;
}

export function waitForVideoFrames(timeoutMs = 8000): Promise<void> {
  const pending: Promise<void>[] = [];
  for (const e of cache.values()) {
    if (e.status === "pending") pending.push(e.wait);
  }
  if (!pending.length) return Promise.resolve();
  return Promise.race([
    Promise.all(pending).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

function captureFrame(src: string, seekTo: number): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    if (!src.startsWith("data:") && !src.startsWith("blob:")) video.crossOrigin = "anonymous";
    let settled = false;
    const done = (img: HTMLImageElement | null): void => {
      if (settled) return;
      settled = true;
      video.removeAttribute("src");
      video.load();
      resolve(img);
    };
    const grab = (): void => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) {
          done(null);
          return;
        }
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d");
        if (!ctx) {
          done(null);
          return;
        }
        ctx.drawImage(video, 0, 0);
        const url = c.toDataURL("image/jpeg", 0.72);
        const img = new Image();
        img.onload = () => done(img);
        img.onerror = () => done(null);
        img.src = url;
      } catch {
        done(null);
      }
    };
    video.addEventListener("error", () => done(null), { once: true });
    video.addEventListener(
      "loadeddata",
      () => {
        const dur = Number.isFinite(video.duration) ? video.duration : 0;
        const t = Math.max(0, dur > 0 ? Math.min(seekTo, Math.max(0, dur - 0.05)) : seekTo);
        if (t <= 0.001 && video.readyState >= 2) {
          grab();
          return;
        }
        video.addEventListener("seeked", grab, { once: true });
        try {
          video.currentTime = t;
        } catch {
          grab();
        }
      },
      { once: true },
    );
    video.src = src;
    setTimeout(() => done(null), 8000);
  });
}
