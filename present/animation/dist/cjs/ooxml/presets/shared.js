"use strict";
// Shared ChannelDesc constants reused across entrance/exit/emphasis preset definitions.
// All exports are internal to the @sliiu/present-animation package; they are re-exported via
// presets/index.ts for backwards compatibility.
Object.defineProperty(exports, "__esModule", { value: true });
exports.FLOAT_OUT_TY = exports.SCALE_TO_ZERO = exports.EXIT_FLASH_ONCE = exports.EXIT_FLASH_BULB = exports.ENTR_FLASH_ONCE = exports.ENTR_FLASH_BULB = exports.SCALE_FROM_QUARTER = exports.SCALE_FROM_ZERO = exports.FLOAT_IN_TY = exports.HOLD_OPACITY_THEN_FADE_OUT = exports.HOLD_OPACITY_ON_THEN_FADE_TAIL = exports.FLY_OUT_Y = exports.FLY_OUT_X = exports.FLY_IN_Y = exports.FLY_IN_X = exports.FADE_OUT = exports.FADE_IN = exports.STEP_OPACITY_OFF = exports.STEP_OPACITY_ON = void 0;
exports.STEP_OPACITY_ON = {
    prop: "opacity",
    kf: [
        { t: 0, v: 1 },
        { t: 1, v: 1 },
    ],
};
exports.STEP_OPACITY_OFF = {
    prop: "opacity",
    kf: [
        { t: 0, v: 0 },
        { t: 1, v: 0 },
    ],
};
exports.FADE_IN = {
    prop: "opacity",
    defaultEase: "easeOutQuad",
    kf: [
        { t: 0, v: 0 },
        { t: 1, v: 1 },
    ],
};
exports.FADE_OUT = {
    prop: "opacity",
    defaultEase: "easeInQuad",
    kf: [
        { t: 0, v: 1 },
        { t: 1, v: 0 },
    ],
};
exports.FLY_IN_X = {
    prop: "tx",
    relative: true,
    defaultEase: "easeOutCubic",
    kf: [
        { t: 0, v: "$dx*$dist" },
        { t: 1, v: 0 },
    ],
};
exports.FLY_IN_Y = {
    prop: "ty",
    relative: true,
    defaultEase: "easeOutCubic",
    kf: [
        { t: 0, v: "$dy*$dist" },
        { t: 1, v: 0 },
    ],
};
exports.FLY_OUT_X = {
    prop: "tx",
    relative: true,
    defaultEase: "easeInCubic",
    kf: [
        { t: 0, v: 0 },
        { t: 1, v: "$dx*$dist" },
    ],
};
exports.FLY_OUT_Y = {
    prop: "ty",
    relative: true,
    defaultEase: "easeInCubic",
    kf: [
        { t: 0, v: 0 },
        { t: 1, v: "$dy*$dist" },
    ],
};
const HOLD_OPACITY_ON_THEN_FADE_TAIL = (cutoff) => ({
    prop: "opacity",
    kf: [
        { t: 0, v: 0 },
        { t: cutoff, v: 1, ease: "linear" },
        { t: 1, v: 1 },
    ],
});
exports.HOLD_OPACITY_ON_THEN_FADE_TAIL = HOLD_OPACITY_ON_THEN_FADE_TAIL;
const HOLD_OPACITY_THEN_FADE_OUT = (cutoff) => ({
    prop: "opacity",
    kf: [
        { t: 0, v: 1 },
        { t: cutoff, v: 1 },
        { t: 1, v: 0, ease: "linear" },
    ],
});
exports.HOLD_OPACITY_THEN_FADE_OUT = HOLD_OPACITY_THEN_FADE_OUT;
exports.FLOAT_IN_TY = {
    prop: "ty",
    relative: true,
    defaultEase: "easeOutCubic",
    kf: [
        { t: 0, v: "$bboxH*0.5" },
        { t: 1, v: 0 },
    ],
};
exports.SCALE_FROM_ZERO = {
    prop: "scale",
    defaultEase: "easeOutCubic",
    kf: [
        { t: 0, v: 0 },
        { t: 1, v: 1 },
    ],
};
exports.SCALE_FROM_QUARTER = {
    prop: "scale",
    defaultEase: "easeOutCubic",
    kf: [
        { t: 0, v: 0.25 },
        { t: 1, v: 1 },
    ],
};
exports.ENTR_FLASH_BULB = {
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
exports.ENTR_FLASH_ONCE = {
    prop: "opacity",
    defaultEase: "easeOutQuad",
    kf: [
        { t: 0, v: 0 },
        { t: 0.1, v: 1 },
        { t: 1, v: 1 },
    ],
};
exports.EXIT_FLASH_BULB = {
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
exports.EXIT_FLASH_ONCE = {
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
exports.SCALE_TO_ZERO = {
    prop: "scale",
    defaultEase: "easeInCubic",
    kf: [
        { t: 0, v: 1 },
        { t: 1, v: 0 },
    ],
};
exports.FLOAT_OUT_TY = {
    prop: "ty",
    relative: true,
    defaultEase: "easeInCubic",
    kf: [
        { t: 0, v: 0 },
        { t: 1, v: "-$bboxH*0.5" },
    ],
};
