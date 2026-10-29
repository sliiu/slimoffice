import type { Presentation, Slide } from "@sliiu/present-core";
/** Cap click steps recorded per slide so a looping timeline cannot run away. */
export declare const MAX_VIDEO_CLICK_STEPS = 24;
/** Cap the playing time of one step (seconds, video time) so indefinite loops end. */
export declare const MAX_STEP_SECONDS = 20;
export declare const VIDEO_FPS_CHOICES: readonly [12, 24, 30];
export declare const VIDEO_SPEED_CHOICES: readonly [0.5, 0.75, 1, 1.5, 2];
/** Output height presets; `0` keeps the deck's own pixel size. */
export declare const VIDEO_HEIGHT_CHOICES: readonly [0, 720, 1080];
export interface SlideshowVideoOptions {
    /** Frames per second of the rendered video (also the animation sampling rate). */
    fps?: number;
    /** Output height in pixels; 0 / undefined keeps `pres.size`. Width follows the deck aspect ratio. */
    height?: number;
    /** Seconds a slide stays after its last animation settles when it has no rehearsed timing. */
    slideHold?: number;
    /** Honor rehearsed / transition `advAfter` for the final hold. Default true. */
    useTimings?: boolean;
    /** Seconds between one click's animation settling and the next click. */
    clickGap?: number;
    /** Playback rate applied to animations, holds and transitions (2 = twice as fast). */
    speed?: number;
    /** `mp4` converts the recording in the browser with ffmpeg.wasm; `webm` returns the recording as is. */
    format?: VideoFormat;
    onProgress?: (progress: SlideshowVideoProgress) => void;
}
export type VideoFormat = "mp4" | "webm";
export type SlideshowVideoProgress = {
    phase: "render";
    done: number;
    total: number;
} | {
    phase: "convert";
};
export declare const DEFAULT_VIDEO_OPTIONS: Required<Pick<SlideshowVideoOptions, "fps" | "height" | "slideHold" | "useTimings" | "clickGap" | "speed" | "format">>;
/** How long a slide stays on screen after its animations (seconds, before speed). */
export declare function slideHoldSeconds(slide: Slide, fallback?: number, useTimings?: boolean): number;
/** Crossfade length taken from the incoming slide's transition. Cut / none are instant. */
export declare function slideFadeSeconds(slide: Slide): number;
export declare function slideshowVideoSlides(pres: Presentation): Slide[];
/** Output pixel size for a requested height (0 = native), keeping aspect ratio and even dimensions. */
export declare function videoOutputSize(size: {
    width: number;
    height: number;
}, height: number | undefined): {
    width: number;
    height: number;
    scale: number;
};
/** Number of frames a duration occupies at `fps` after applying `speed`; at least 1 for positive input. */
export declare function framesFor(seconds: number, fps: number, speed: number): number;
/**
 * Render the deck as a video by playing it: every visible slide's on-load animations run,
 * each click is advanced once the previous one settles (`clickGap` apart), the slide then
 * holds for its rehearsed time (or `slideHold`), and non-cut transitions crossfade into the
 * next slide. Animations are sampled at `fps` through a manual ticker, so the timeline is
 * exact regardless of render cost. `speed` scales animations, holds and fades alike.
 *
 * Not captured: audio, and video shapes (they stay on their poster frame).
 */
export declare function exportSlideshowVideo(pres: Presentation, opts?: SlideshowVideoOptions): Promise<{
    blob: Blob;
    ext: string;
}>;
