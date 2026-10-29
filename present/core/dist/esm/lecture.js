/** 一场讲解里某一页的记录。摄像头字节不在这里，只留一个短引用。 */
export function lectureTakeFor(lecture, slideId) {
    return lecture?.takes.find((t) => t.slideId === slideId);
}
/** 两个开关都开着才播出镜、旁白、自动翻页和讲解点击。 */
export function lecturePlaybackEnabled(useTimings, playNarrations) {
    return useTimings && playNarrations;
}
export function lectureCameraIdbRef(slideId) {
    return `idb:${encodeURIComponent(slideId)}`;
}
export function lectureCameraSlideId(ref) {
    if (!ref.startsWith("idb:"))
        return null;
    try {
        const id = decodeURIComponent(ref.slice(4));
        return id.length > 0 ? id : null;
    }
    catch {
        return null;
    }
}
/** 下一次讲解点击。已经过了的不算。没有则这一页讲完了。 */
export function nextLectureClickMs(clicksMs, elapsedMs) {
    for (const t of clicksMs) {
        if (t > elapsedMs + 40)
            return t;
    }
    return null;
}
/**
 * 从 `fromSlideId` 起换成 `recorded`，这一页之前的保留。
 * `fromSlideId` 不在页序里时整场换成新的。
 */
export function replaceLectureTail(prev, slideIds, fromSlideId, recorded, frame) {
    const from = slideIds.indexOf(fromSlideId);
    const cut = from < 0 ? 0 : from;
    const keep = new Set(slideIds.slice(0, cut));
    const tail = new Set(slideIds.slice(cut));
    const kept = (prev?.takes ?? []).filter((t) => keep.has(t.slideId));
    const seen = new Set();
    const next = [];
    for (const t of recorded) {
        if (!tail.has(t.slideId) || seen.has(t.slideId))
            continue;
        if (!Number.isFinite(t.durationMs) || t.durationMs <= 0)
            continue;
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
export function lectureTailSlideIds(slideIds, fromSlideId) {
    const from = slideIds.indexOf(fromSlideId);
    return slideIds.slice(from < 0 ? 0 : from);
}
function copyTake(take) {
    return { ...take, clicksMs: [...take.clicksMs] };
}
function copyFrame(frame) {
    return frame ? { corner: frame.corner, size: frame.size } : undefined;
}
function withFrame(takes, frame) {
    const copied = copyFrame(frame);
    return copied ? { takes, frame: copied } : { takes };
}
/** 丢掉停在时长之外的讲解点击。时长不成立时整段作废。 */
export function sanitizeLectureTake(take) {
    if (!Number.isFinite(take.durationMs) || take.durationMs <= 0)
        return null;
    const clicksMs = [...take.clicksMs]
        .filter((n) => Number.isFinite(n) && n >= 0 && n < take.durationMs)
        .sort((a, b) => a - b);
    const next = { ...take, clicksMs };
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
export function replaceLectureSlide(prev, slideId, recorded) {
    const takes = (prev?.takes ?? []).map(copyTake);
    const idx = takes.findIndex((t) => t.slideId === slideId);
    const clean = recorded && recorded.slideId === slideId ? sanitizeLectureTake(recorded) : null;
    if (!clean) {
        if (idx >= 0)
            takes.splice(idx, 1);
    }
    else if (idx >= 0)
        takes[idx] = clean;
    else
        takes.push(clean);
    return withFrame(takes, prev?.frame);
}
/** 把一次已有的讲解点击挪到这一页的时长里，并按时间排好。 */
export function withLectureClick(lecture, slideId, clickIndex, ms) {
    return withFrame(lecture.takes.map((take) => {
        if (take.slideId !== slideId || clickIndex < 0 || clickIndex >= take.clicksMs.length)
            return copyTake(take);
        const clicksMs = take.clicksMs.slice();
        const limit = Math.max(0, take.durationMs - 1);
        clicksMs[clickIndex] = Math.min(limit, Math.max(0, ms));
        clicksMs.sort((a, b) => a - b);
        return { ...take, clicksMs };
    }), lecture.frame);
}
export function withLectureFrame(lecture, frame) {
    return withFrame(lecture.takes.map(copyTake), frame);
}
/** 去掉这一页的出镜。旁白、讲解点击和停留还在。 */
export function withoutLectureCamera(lecture, slideId) {
    return withFrame(lecture.takes.map((take) => {
        if (take.slideId !== slideId)
            return copyTake(take);
        const next = copyTake(take);
        delete next.cameraRef;
        delete next.cameraMime;
        return next;
    }), lecture.frame);
}
