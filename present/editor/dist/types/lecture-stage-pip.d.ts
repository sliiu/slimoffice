import { type Presentation, type Slide } from "@sliiu/present-core";
export interface LectureStagePip {
    sync(): void;
    destroy(): void;
}
export declare function mountLectureStagePip(stage: HTMLElement, overlay: Element, deps: {
    getPres: () => Presentation;
    getSlide: () => Slide | undefined;
    hidden: () => boolean;
    cameraSrc?: (ref: string) => Promise<string | null>;
}): LectureStagePip;
