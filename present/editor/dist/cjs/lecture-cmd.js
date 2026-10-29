"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClearLectureCameraCmd = exports.SetLectureFrameCmd = exports.SetLectureClicksCmd = void 0;
const core_1 = require("@sliiu/present-core");
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
class SetLectureClicksCmd extends LectureEdit {
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
        return (0, core_1.withLectureClick)(lecture, this.slideId, this.clickIndex, this.ms);
    }
}
exports.SetLectureClicksCmd = SetLectureClicksCmd;
class SetLectureFrameCmd extends LectureEdit {
    frame;
    label = "Lecture frame";
    constructor(frame) {
        super();
        this.frame = frame;
    }
    next(lecture) {
        return (0, core_1.withLectureFrame)(lecture, this.frame);
    }
}
exports.SetLectureFrameCmd = SetLectureFrameCmd;
class ClearLectureCameraCmd extends LectureEdit {
    slideId;
    label = "Clear lecture camera";
    constructor(slideId) {
        super();
        this.slideId = slideId;
    }
    next(lecture) {
        return (0, core_1.withoutLectureCamera)(lecture, this.slideId);
    }
}
exports.ClearLectureCameraCmd = ClearLectureCameraCmd;
