import type { MediaTrim } from "./shape.js";
/** Resolve trim start/end in seconds; `end` defaults to full media duration. */
export declare function mediaTrimBounds(trim: MediaTrim | undefined, duration: number | undefined): {
    start: number;
    end: number;
};
export declare function clampMediaTime(t: number, trim: MediaTrim | undefined, duration: number | undefined): number;
/** Keep `<video>` / `<audio>` playback inside [trim.start, trim.end]. Returns detach fn. */
export declare function attachMediaTrimPlayback(el: HTMLMediaElement, trim: MediaTrim | undefined, fallbackDuration: number | undefined, loop?: boolean): () => void;
