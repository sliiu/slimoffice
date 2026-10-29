import { type EditCommand, type Lecture, type LectureFrame, type Presentation } from "@sliiu/present-core";
declare abstract class LectureEdit implements EditCommand {
    abstract readonly label: string;
    private prev;
    private touched;
    protected abstract next(lecture: Lecture): Lecture;
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetLectureClicksCmd extends LectureEdit {
    private slideId;
    private clickIndex;
    private ms;
    readonly label = "Lecture clicks";
    constructor(slideId: string, clickIndex: number, ms: number);
    protected next(lecture: Lecture): Lecture;
}
export declare class SetLectureFrameCmd extends LectureEdit {
    private frame;
    readonly label = "Lecture frame";
    constructor(frame: LectureFrame);
    protected next(lecture: Lecture): Lecture;
}
export declare class ClearLectureCameraCmd extends LectureEdit {
    private slideId;
    readonly label = "Clear lecture camera";
    constructor(slideId: string);
    protected next(lecture: Lecture): Lecture;
}
export {};
