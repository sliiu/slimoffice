// Backwards-compatible barrel: previous monolithic ~3100-line module has been
// split under ./presets/. Existing imports of "./presets.data" stay valid because
// the entire public surface is re-exported here.
export { STEP_OPACITY_ON, STEP_OPACITY_OFF, FADE_IN, FADE_OUT, FLY_IN_X, FLY_IN_Y, FLY_OUT_X, FLY_OUT_Y, HOLD_OPACITY_ON_THEN_FADE_TAIL, HOLD_OPACITY_THEN_FADE_OUT, FLOAT_IN_TY, SCALE_FROM_ZERO, SCALE_FROM_QUARTER, ENTR_FLASH_BULB, ENTR_FLASH_ONCE, EXIT_FLASH_BULB, EXIT_FLASH_ONCE, SCALE_TO_ZERO, FLOAT_OUT_TY, ENTR, EXIT, EMPH, PATH, PRESET_MOTION_PATHS, DIRECTION_VECTORS, DEFAULT_DIRECTION, PRESET_TABLE, } from "./presets/index.js";
