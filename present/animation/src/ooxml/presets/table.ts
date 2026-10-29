// Top-level preset table aggregating entrance/exit/emphasis/path lists.
// Lookup by (presetClass, presetID) goes through this map in compile.ts.

import { ENTR } from "./entrance";
import { EXIT } from "./exit";
import { EMPH } from "./emphasis";
import { PATH } from "./path-presets";

export const PRESET_TABLE = {
  entr: ENTR,
  exit: EXIT,
  emph: EMPH,
  path: PATH,
};

export type PresetClassKey = keyof typeof PRESET_TABLE;
