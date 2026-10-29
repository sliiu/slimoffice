// Shared ChannelDesc constants reused across entrance/exit/emphasis preset definitions.
// All exports are internal to the @sliiu/present-animation package; they are re-exported via
// presets/index.ts for backwards compatibility.
export const STEP_OPACITY_ON = {
    prop: "opacity",
    kf: [
        { t: 0, v: 1 },
        { t: 1, v: 1 },
    ],
};
export const STEP_OPACITY_OFF = {
    prop: "opacity",
    kf: [
        { t: 0, v: 0 },
        { t: 1, v: 0 },
    ],
};
export const FADE_IN = {
    prop: "opacity",
    defaultEase: "easeOutQuad",
    kf: [
        { t: 0, v: 0 },
        { t: 1, v: 1 },
    ],
};
export const FADE_OUT = {
    prop: "opacity",
    defaultEase: "easeInQuad",
    kf: [
        { t: 0, v: 1 },
        { t: 1, v: 0 },
    ],
};
export const FLY_IN_X = {
    prop: "tx",
    relative: true,
    defaultEase: "easeOutCubic",
    kf: [
        { t: 0, v: "$dx*$dist" },
        { t: 1, v: 0 },
    ],
};
export const FLY_IN_Y = {
    prop: "ty",
    relative: true,
    defaultEase: "easeOutCubic",
    kf: [
        { t: 0, v: "$dy*$dist" },
        { t: 1, v: 0 },
    ],
};
export const FLY_OUT_X = {
    prop: "tx",
    relative: true,
    defaultEase: "easeInCubic",
    kf: [
        { t: 0, v: 0 },
        { t: 1, v: "$dx*$dist" },
    ],
};
export const FLY_OUT_Y = {
    prop: "ty",
    relative: true,
    defaultEase: "easeInCubic",
    kf: [
        { t: 0, v: 0 },
        { t: 1, v: "$dy*$dist" },
    ],
};
export const HOLD_OPACITY_ON_THEN_FADE_TAIL = (cutoff) => ({
    prop: "opacity",
    kf: [
        { t: 0, v: 0 },
        { t: cutoff, v: 1, ease: "linear" },
        { t: 1, v: 1 },
    ],
});
export const HOLD_OPACITY_THEN_FADE_OUT = (cutoff) => ({
    prop: "opacity",
    kf: [
        { t: 0, v: 1 },
        { t: cutoff, v: 1 },
        { t: 1, v: 0, ease: "linear" },
    ],
});
export const FLOAT_IN_TY = {
    prop: "ty",
    relative: true,
    defaultEase: "easeOutCubic",
    kf: [
        { t: 0, v: "$bboxH*0.5" },
        { t: 1, v: 0 },
    ],
};
export const SCALE_FROM_ZERO = {
    prop: "scale",
    defaultEase: "easeOutCubic",
    kf: [
        { t: 0, v: 0 },
        { t: 1, v: 1 },
    ],
};
export const SCALE_FROM_QUARTER = {
    prop: "scale",
    defaultEase: "easeOutCubic",
    kf: [
        { t: 0, v: 0.25 },
        { t: 1, v: 1 },
    ],
};
export const ENTR_FLASH_BULB = {
    prop: "brightness",
    valueKind: "number",
    defaultEase: "easeOutQuad",
    kf: [
        { t: 0, v: 0 },
        { t: 0.42, v: 0.75 },
        { t: 0.8, v: 0 },
        { t: 1, v: 0 },
    ],
};
export const ENTR_FLASH_ONCE = {
    prop: "opacity",
    defaultEase: "easeOutQuad",
    kf: [
        { t: 0, v: 0 },
        { t: 0.1, v: 1 },
        { t: 1, v: 1 },
    ],
};
export const EXIT_FLASH_BULB = {
    prop: "brightness",
    valueKind: "number",
    defaultEase: "easeInQuad",
    kf: [
        { t: 0, v: 0 },
        { t: 0.35, v: 0.65 },
        { t: 0.75, v: 0 },
        { t: 1, v: 0 },
    ],
};
export const EXIT_FLASH_ONCE = {
    prop: "opacity",
    defaultEase: "easeInQuad",
    kf: [
        { t: 0, v: 1 },
        { t: 0.12, v: 0 },
        { t: 0.28, v: 1 },
        { t: 0.45, v: 0 },
        { t: 1, v: 0 },
    ],
};
export const SCALE_TO_ZERO = {
    prop: "scale",
    defaultEase: "easeInCubic",
    kf: [
        { t: 0, v: 1 },
        { t: 1, v: 0 },
    ],
};
export const FLOAT_OUT_TY = {
    prop: "ty",
    relative: true,
    defaultEase: "easeInCubic",
    kf: [
        { t: 0, v: 0 },
        { t: 1, v: "-$bboxH*0.5" },
    ],
};
