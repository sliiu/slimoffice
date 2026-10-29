import type { LectureFrame } from "@sliiu/present-core";
export interface LectureOverlay {
    setVideo(src: string | null): void;
    play(): void;
    pause(): void;
    seek(sec: number): void;
    setPaused(paused: boolean): void;
    destroy(): void;
}
/** 放映角落里的出镜。观众看到的画面不镜像。 */
export declare function mountLectureOverlay(host: HTMLElement, frame: LectureFrame | undefined, labels: {
    pause: string;
    resume: string;
}, onTogglePause: () => void): LectureOverlay;
