"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.presetDisplayName = presetDisplayName;
const i18n_1 = require("../i18n");
function presetDisplayName(cls, presetId, fallback) {
    if (presetId === undefined || presetId === null)
        return fallback ?? "—";
    const key = `anim.preset.${cls}.${presetId}`;
    const label = (0, i18n_1.t)(key);
    return label === key ? (fallback ?? `#${presetId}`) : label;
}
