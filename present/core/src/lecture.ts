/** 一场讲解里某一页的记录。摄像头字节不在这里，只留一个短引用。 */

export type LectureCorner = "br" | "bl" | "tr" | "tl";
export type LecturePipSize = "s" | "m" | "l";

export interface LectureFrame {
  corner: LectureCorner;
  size: LecturePipSize;
}

export interface LectureTake {
  slideId: string;
  /** 进入这一页到离开这一页的毫秒数。 */
  durationMs: number;
  /** 这一页上每次讲解点击距进入的毫秒。翻页那一下不在里面。 */
  clicksMs: number[];
  /**
   * 摄像头片段。`idb:` 留给本机；`/{shareId}/camera/...` 留给分享。
   * 字节本身不进文稿 JSON。
   */
  cameraRef?: string;
  cameraMime?: string;
}

export interface Lecture {
  takes: LectureTake[];
  frame?: LectureFrame;
}

export function lectureTakeFor(lecture: Lecture | undefined, slideId: string): LectureTake | undefined {
  return lecture?.takes.find((t) => t.slideId === slideId);
}

/** 两个开关都开着才播出镜、旁白、自动翻页和讲解点击。 */
export function lecturePlaybackEnabled(useTimings: boolean, playNarrations: boolean): boolean {
  return useTimings && playNarrations;
}

export function lectureCameraIdbRef(slideId: string): string {
  return `idb:${encodeURIComponent(slideId)}`;
}

export function lectureCameraSlideId(ref: string): string | null {
  if (!ref.startsWith("idb:")) return null;
  try {
    const id = decodeURIComponent(ref.slice(4));
    return id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/** 下一次讲解点击。已经过了的不算。没有则这一页讲完了。 */
export function nextLectureClickMs(clicksMs: readonly number[], elapsedMs: number): number | null {
  for (const t of clicksMs) {
    if (t > elapsedMs + 40) return t;
  }
  return null;
}

/**
 * 从 `fromSlideId` 起换成 `recorded`，这一页之前的保留。
 * `fromSlideId` 不在页序里时整场换成新的。
 */
export function replaceLectureTail(
  prev: Lecture | undefined,
  slideIds: readonly string[],
  fromSlideId: string,
  recorded: readonly LectureTake[],
  frame?: LectureFrame,
): Lecture {
  const from = slideIds.indexOf(fromSlideId);
  const cut = from < 0 ? 0 : from;
  const keep = new Set(slideIds.slice(0, cut));
  const tail = new Set(slideIds.slice(cut));
  const kept = (prev?.takes ?? []).filter((t) => keep.has(t.slideId));
  const seen = new Set<string>();
  const next: LectureTake[] = [];
  for (const t of recorded) {
    if (!tail.has(t.slideId) || seen.has(t.slideId)) continue;
    if (!Number.isFinite(t.durationMs) || t.durationMs <= 0) continue;
    seen.add(t.slideId);
    const clicksMs = [...t.clicksMs]
      .filter((n) => Number.isFinite(n) && n >= 0 && n < t.durationMs)
      .sort((a, b) => a - b);
    next.push({ ...t, clicksMs });
  }
  return {
    takes: [...kept, ...next],
    frame: frame ?? prev?.frame,
  };
}

/** 这次录制要改写的页：从起点到文稿结尾。 */
export function lectureTailSlideIds(slideIds: readonly string[], fromSlideId: string): string[] {
  const from = slideIds.indexOf(fromSlideId);
  return slideIds.slice(from < 0 ? 0 : from);
}

function copyTake(take: LectureTake): LectureTake {
  return { ...take, clicksMs: [...take.clicksMs] };
}

function copyFrame(frame: LectureFrame | undefined): LectureFrame | undefined {
  return frame ? { corner: frame.corner, size: frame.size } : undefined;
}

function withFrame(takes: LectureTake[], frame: LectureFrame | undefined): Lecture {
  const copied = copyFrame(frame);
  return copied ? { takes, frame: copied } : { takes };
}

/** 丢掉停在时长之外的讲解点击。时长不成立时整段作废。 */
export function sanitizeLectureTake(take: LectureTake): LectureTake | null {
  if (!Number.isFinite(take.durationMs) || take.durationMs <= 0) return null;
  const clicksMs = [...take.clicksMs]
    .filter((n) => Number.isFinite(n) && n >= 0 && n < take.durationMs)
    .sort((a, b) => a - b);
  const next: LectureTake = { ...take, clicksMs };
  if (!next.cameraRef) {
    delete next.cameraRef;
    delete next.cameraMime;
  }
  return next;
}

/**
 * 只换一页。`recorded` 为空或时长不成立时去掉这一页。
 * 其他页和整场角落、大小不动。
 */
export function replaceLectureSlide(
  prev: Lecture | undefined,
  slideId: string,
  recorded: LectureTake | null,
): Lecture {
  const takes = (prev?.takes ?? []).map(copyTake);
  const idx = takes.findIndex((t) => t.slideId === slideId);
  const clean = recorded && recorded.slideId === slideId ? sanitizeLectureTake(recorded) : null;
  if (!clean) {
    if (idx >= 0) takes.splice(idx, 1);
  } else if (idx >= 0) takes[idx] = clean;
  else takes.push(clean);
  return withFrame(takes, prev?.frame);
}

/** 把一次已有的讲解点击挪到这一页的时长里，并按时间排好。 */
export function withLectureClick(lecture: Lecture, slideId: string, clickIndex: number, ms: number): Lecture {
  return withFrame(
    lecture.takes.map((take) => {
      if (take.slideId !== slideId || clickIndex < 0 || clickIndex >= take.clicksMs.length) return copyTake(take);
      const clicksMs = take.clicksMs.slice();
      const limit = Math.max(0, take.durationMs - 1);
      clicksMs[clickIndex] = Math.min(limit, Math.max(0, ms));
      clicksMs.sort((a, b) => a - b);
      return { ...take, clicksMs };
    }),
    lecture.frame,
  );
}

export function withLectureFrame(lecture: Lecture, frame: LectureFrame): Lecture {
  return withFrame(
    lecture.takes.map(copyTake),
    frame,
  );
}

/** 去掉这一页的出镜。旁白、讲解点击和停留还在。 */
export function withoutLectureCamera(lecture: Lecture, slideId: string): Lecture {
  return withFrame(
    lecture.takes.map((take) => {
      if (take.slideId !== slideId) return copyTake(take);
      const next = copyTake(take);
      delete next.cameraRef;
      delete next.cameraMime;
      return next;
    }),
    lecture.frame,
  );
}
