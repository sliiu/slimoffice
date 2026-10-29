"use strict";
// Top-level preset table aggregating entrance/exit/emphasis/path lists.
// Lookup by (presetClass, presetID) goes through this map in compile.ts.
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRESET_TABLE = void 0;
const entrance_1 = require("./entrance");
const exit_1 = require("./exit");
const emphasis_1 = require("./emphasis");
const path_presets_1 = require("./path-presets");
exports.PRESET_TABLE = {
    entr: entrance_1.ENTR,
    exit: exit_1.EXIT,
    emph: emphasis_1.EMPH,
    path: path_presets_1.PATH,
};
