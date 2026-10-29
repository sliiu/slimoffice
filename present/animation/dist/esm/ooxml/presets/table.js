// Top-level preset table aggregating entrance/exit/emphasis/path lists.
// Lookup by (presetClass, presetID) goes through this map in compile.ts.
import { ENTR } from "./entrance.js";
import { EXIT } from "./exit.js";
import { EMPH } from "./emphasis.js";
import { PATH } from "./path-presets.js";
export const PRESET_TABLE = {
    entr: ENTR,
    exit: EXIT,
    emph: EMPH,
    path: PATH,
};
