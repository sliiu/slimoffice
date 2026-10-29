"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.boolish = exports.msToSec = exports.percentToFloat = exports.angle60kToDeg = exports.stHundredthPtToPx = exports.ptToPx = exports.emuToPx = exports.EMU_PER_PT = exports.EMU_PER_PX = void 0;
exports.EMU_PER_PX = 9525;
exports.EMU_PER_PT = 12700;
const emuToPx = (emu) => {
    if (emu === undefined)
        return 0;
    const n = typeof emu === "number" ? emu : Number(emu);
    return Number.isFinite(n) ? n / exports.EMU_PER_PX : 0;
};
exports.emuToPx = emuToPx;
const ptToPx = (pt) => (pt * 96) / 72;
exports.ptToPx = ptToPx;
const stHundredthPtToPx = (v) => {
    if (v === undefined)
        return 0;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n))
        return 0;
    return (0, exports.ptToPx)(n / 100);
};
exports.stHundredthPtToPx = stHundredthPtToPx;
const angle60kToDeg = (v) => {
    if (v === undefined)
        return 0;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n / 60000 : 0;
};
exports.angle60kToDeg = angle60kToDeg;
const percentToFloat = (v) => {
    if (v === undefined)
        return 0;
    if (typeof v === "number")
        return v / 100000;
    if (v.endsWith("%"))
        return Number(v.slice(0, -1)) / 100;
    const n = Number(v);
    return Number.isFinite(n) ? n / 100000 : 0;
};
exports.percentToFloat = percentToFloat;
const msToSec = (v, fallback = 0) => {
    if (v === undefined || v === "indefinite")
        return fallback;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n / 1000 : fallback;
};
exports.msToSec = msToSec;
const boolish = (v) => {
    if (v === undefined || v === null)
        return undefined;
    if (typeof v === "boolean")
        return v;
    const s = String(v).toLowerCase();
    if (s === "1" || s === "true")
        return true;
    if (s === "0" || s === "false")
        return false;
    return undefined;
};
exports.boolish = boolish;
