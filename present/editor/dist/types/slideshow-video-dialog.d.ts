import { type SlideshowVideoOptions } from "./slideshow-video.js";
export type SlideshowVideoSettings = Required<Pick<SlideshowVideoOptions, "fps" | "height" | "slideHold" | "useTimings" | "clickGap" | "speed" | "format">>;
/** Clamp free-form numeric fields into ranges the exporter handles well. */
export declare function sanitizeVideoSettings(raw: Partial<SlideshowVideoSettings>): SlideshowVideoSettings;
export declare function openSlideshowVideoDialog(doc: Document, initial: Partial<SlideshowVideoSettings> & {
    hasTimings?: boolean;
    deckSize?: {
        width: number;
        height: number;
    };
}): Promise<SlideshowVideoSettings | null>;
