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
export declare function lectureTakeFor(lecture: Lecture | undefined, slideId: string): LectureTake | undefined;
/** 两个开关都开着才播出镜、旁白、自动翻页和讲解点击。 */
export declare function lecturePlaybackEnabled(useTimings: boolean, playNarrations: boolean): boolean;
export declare function lectureCameraIdbRef(slideId: string): string;
export declare function lectureCameraSlideId(ref: string): string | null;
/** 下一次讲解点击。已经过了的不算。没有则这一页讲完了。 */
export declare function nextLectureClickMs(clicksMs: readonly number[], elapsedMs: number): number | null;
/**
 * 从 `fromSlideId` 起换成 `recorded`，这一页之前的保留。
 * `fromSlideId` 不在页序里时整场换成新的。
 */
export declare function replaceLectureTail(prev: Lecture | undefined, slideIds: readonly string[], fromSlideId: string, recorded: readonly LectureTake[], frame?: LectureFrame): Lecture;
/** 这次录制要改写的页：从起点到文稿结尾。 */
export declare function lectureTailSlideIds(slideIds: readonly string[], fromSlideId: string): string[];
/** 丢掉停在时长之外的讲解点击。时长不成立时整段作废。 */
export declare function sanitizeLectureTake(take: LectureTake): LectureTake | null;
/**
 * 只换一页。`recorded` 为空或时长不成立时去掉这一页。
 * 其他页和整场角落、大小不动。
 */
export declare function replaceLectureSlide(prev: Lecture | undefined, slideId: string, recorded: LectureTake | null): Lecture;
/** 把一次已有的讲解点击挪到这一页的时长里，并按时间排好。 */
export declare function withLectureClick(lecture: Lecture, slideId: string, clickIndex: number, ms: number): Lecture;
export declare function withLectureFrame(lecture: Lecture, frame: LectureFrame): Lecture;
/** 去掉这一页的出镜。旁白、讲解点击和停留还在。 */
export declare function withoutLectureCamera(lecture: Lecture, slideId: string): Lecture;
