import type { MediaTrim } from "./shape";

/** Resolve trim start/end in seconds; `end` defaults to full media duration. */
export function mediaTrimBounds(
  trim: MediaTrim | undefined,
  duration: number | undefined,
): { start: number; end: number } {
  const start = Math.max(0, trim?.start ?? 0);
  let end = trim?.end;
  if (end === undefined || !Number.isFinite(end)) {
    // MediaRecorder 的 WebM 时长经常是 Infinity。未知结尾不能收成 start，
    // 否则 timeupdate 一来就把 currentTime 0 当成已经播完并暂停。
    end = duration !== undefined && Number.isFinite(duration) && duration > 0
      ? duration
      : Number.POSITIVE_INFINITY;
  }
  return { start, end: Math.max(start, end) };
}

export function clampMediaTime(
  t: number,
  trim: MediaTrim | undefined,
  duration: number | undefined,
): number {
  const { start, end } = mediaTrimBounds(trim, duration);
  return Math.max(start, Math.min(end, t));
}

/** Keep `<video>` / `<audio>` playback inside [trim.start, trim.end]. Returns detach fn. */
export function attachMediaTrimPlayback(
  el: HTMLMediaElement,
  trim: MediaTrim | undefined,
  fallbackDuration: number | undefined,
  loop?: boolean,
): () => void {
  // 没裁切时不要在自然结尾把 currentTime 钉死。播完再点播放会先停在结尾，
  // 紧接着的 timeupdate 会把「回到开头」立刻拉回去，看起来就是播放无效。
  const explicit = trim != null && (trim.start != null || trim.end != null);
  if (!explicit) return () => {};

  const dur = (): number =>
    Number.isFinite(el.duration) && el.duration > 0 ? el.duration : (fallbackDuration ?? 0);
  // 从结尾重新播放时，seek 完成前还会收到一次旧的 timeupdate。
  let rewinding = false;

  const onPlay = (): void => {
    const { start, end } = mediaTrimBounds(trim, dur());
    if (el.currentTime >= end - 0.02) {
      rewinding = true;
      try {
        el.currentTime = start;
      } catch {
        /* ignore seek errors before metadata */
      }
      return;
    }
    rewinding = false;
    if (el.currentTime < start - 0.02) {
      try {
        el.currentTime = start;
      } catch {
        /* ignore seek errors before metadata */
      }
    }
  };

  const onTimeUpdate = (): void => {
    const { start, end } = mediaTrimBounds(trim, dur());
    if (rewinding) {
      if (el.currentTime < end - 0.05) rewinding = false;
      return;
    }
    if (el.currentTime < start - 0.05) {
      try {
        el.currentTime = start;
      } catch {
        /* ignore */
      }
      return;
    }
    if (el.currentTime >= end - 0.02) {
      if (loop) {
        try {
          el.currentTime = start;
        } catch {
          /* ignore */
        }
        void el.play().catch(() => {});
      } else {
        el.pause();
        try {
          el.currentTime = end;
        } catch {
          /* ignore */
        }
      }
    }
  };

  const onSeeked = (): void => {
    rewinding = false;
  };

  el.addEventListener("play", onPlay);
  el.addEventListener("timeupdate", onTimeUpdate);
  el.addEventListener("seeked", onSeeked);
  return () => {
    el.removeEventListener("play", onPlay);
    el.removeEventListener("timeupdate", onTimeUpdate);
    el.removeEventListener("seeked", onSeeked);
  };
}
