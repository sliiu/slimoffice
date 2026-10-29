/**
 * Preset motion paths per ECMA-376 §19.4.39 (presetClass="path", presetID 1..63).
 * Paths use SVG syntax with coordinates normalised to "parent" origin (the
 * target shape's centre), expressed in a unit cell of 1 = slide-relative
 * displacement (i.e. 1 means one whole slide width / height of travel).
 * Many paths use only a fraction of that range to avoid leaving the canvas.
 */
export declare const PRESET_MOTION_PATHS: Record<number, string>;
