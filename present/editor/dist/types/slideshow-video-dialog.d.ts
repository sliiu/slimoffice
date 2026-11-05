import { type SlideshowVideoOptions } from "./slideshow-video.js";
export type SlideshowVideoSettings = Required<Pick<SlideshowVideoOptions, "fps" | "height" | "slideHold" | "useTimings" | "clickGap" | "speed" | "format">>;
/**
 * 「使用排练计时」在文稿没有任何排练计时时不能勾上。
 * 勾着又禁用，读起来像是选中了「本文稿没有排练计时」。
 */
export declare function videoTimingCheckboxState(hasTimings: boolean | undefined, useTimings: boolean): {
    checked: boolean;
    disabled: boolean;
};
/** Clamp free-form numeric fields into ranges the exporter handles well. */
export declare function sanitizeVideoSettings(raw: Partial<SlideshowVideoSettings>): SlideshowVideoSettings;
export declare function openSlideshowVideoDialog(doc: Document, initial: Partial<SlideshowVideoSettings> & {
    hasTimings?: boolean;
    deckSize?: {
        width: number;
        height: number;
    };
}): Promise<SlideshowVideoSettings | null>;
