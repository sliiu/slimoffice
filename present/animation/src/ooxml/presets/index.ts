// Barrel re-export for the preset data layer.
// External code should import from "@ppt/animation" (which goes through ooxml/index.ts);
// this file is what `import "./presets"` from the ooxml package internals resolves to.

export type {
  AnimValueKind,
  ChannelProp,
  ChannelKF,
  ChannelDesc,
  FilterDesc,
  PresetDesc,
} from "./types";

export {
  STEP_OPACITY_ON,
  STEP_OPACITY_OFF,
  FADE_IN,
  FADE_OUT,
  FLY_IN_X,
  FLY_IN_Y,
  FLY_OUT_X,
  FLY_OUT_Y,
  HOLD_OPACITY_ON_THEN_FADE_TAIL,
  HOLD_OPACITY_THEN_FADE_OUT,
  FLOAT_IN_TY,
  SCALE_FROM_ZERO,
  SCALE_FROM_QUARTER,
  ENTR_FLASH_BULB,
  ENTR_FLASH_ONCE,
  EXIT_FLASH_BULB,
  EXIT_FLASH_ONCE,
  SCALE_TO_ZERO,
  FLOAT_OUT_TY,
} from "./shared";

export { ENTR } from "./entrance";
export { EXIT } from "./exit";
export { EMPH } from "./emphasis";
export { PATH } from "./path-presets";
export { PRESET_MOTION_PATHS } from "./motion-paths";
export { DIRECTION_VECTORS, DEFAULT_DIRECTION } from "./directions";
export { PRESET_TABLE } from "./table";
export type { PresetClassKey } from "./table";
