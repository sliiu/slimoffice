import { type EditCommand, type Presentation } from "@sliiu/present-core";
export interface LecturePanel {
    refresh(): void;
    setActive(on: boolean): void;
    destroy(): void;
}
export declare function mountLecturePanel(host: HTMLElement, deps: {
    getPres: () => Presentation;
    getSlideIndex: () => number;
    goto: (index: number) => void;
    execute: (cmd: EditCommand) => void;
    cameraSrc?: (ref: string) => Promise<string | null>;
    recordSlide?: (slideIndex: number) => void;
}): LecturePanel;
