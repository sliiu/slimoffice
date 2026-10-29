import type { Slide } from "@sliiu/present-core";
/**
 * CSS background for the stage / hybrid wrapper chrome around the scene.
 * When the slide has a painted background, createScene injects a full-slide
 * __bg_* shape — a second opaque underlay would show through image alpha or
 * mask gradient edges. Use white only when the slide has no background paint.
 */
export declare function stageChromeBackground(slide?: Slide): string;
