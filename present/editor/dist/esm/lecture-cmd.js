import { withLectureClick, withLectureFrame, withoutLectureCamera, } from "@sliiu/present-core";
function cloneLecture(lecture) {
    if (!lecture)
        return undefined;
    return {
        takes: lecture.takes.map((t) => ({ ...t, clicksMs: [...t.clicksMs] })),
        ...(lecture.frame ? { frame: { ...lecture.frame } } : {}),
    };
}
class LectureEdit {
    prev;
    touched = false;
    apply(pres) {
        if (!pres.lecture)
            return;
        this.prev = cloneLecture(pres.lecture);
        this.touched = true;
        pres.lecture = this.next(pres.lecture);
    }
    revert(pres) {
        if (!this.touched)
            return;
        pres.lecture = cloneLecture(this.prev);
    }
}
export class SetLectureClicksCmd extends LectureEdit {
    slideId;
    clickIndex;
    ms;
    label = "Lecture clicks";
    constructor(slideId, clickIndex, ms) {
        super();
        this.slideId = slideId;
        this.clickIndex = clickIndex;
        this.ms = ms;
    }
    next(lecture) {
        return withLectureClick(lecture, this.slideId, this.clickIndex, this.ms);
    }
}
export class SetLectureFrameCmd extends LectureEdit {
    frame;
    label = "Lecture frame";
    constructor(frame) {
        super();
        this.frame = frame;
    }
    next(lecture) {
        return withLectureFrame(lecture, this.frame);
    }
}
export class ClearLectureCameraCmd extends LectureEdit {
    slideId;
    label = "Clear lecture camera";
    constructor(slideId) {
        super();
        this.slideId = slideId;
    }
    next(lecture) {
        return withoutLectureCamera(lecture, this.slideId);
    }
}
