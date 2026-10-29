export const EMU_PER_PX = 9525;
export const EMU_PER_PT = 12700;
export const emuToPx = (emu) => {
    if (emu === undefined)
        return 0;
    const n = typeof emu === "number" ? emu : Number(emu);
    return Number.isFinite(n) ? n / EMU_PER_PX : 0;
};
export const ptToPx = (pt) => (pt * 96) / 72;
export const stHundredthPtToPx = (v) => {
    if (v === undefined)
        return 0;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n))
        return 0;
    return ptToPx(n / 100);
};
export const angle60kToDeg = (v) => {
    if (v === undefined)
        return 0;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n / 60000 : 0;
};
export const percentToFloat = (v) => {
    if (v === undefined)
        return 0;
    if (typeof v === "number")
        return v / 100000;
    if (v.endsWith("%"))
        return Number(v.slice(0, -1)) / 100;
    const n = Number(v);
    return Number.isFinite(n) ? n / 100000 : 0;
};
export const msToSec = (v, fallback = 0) => {
    if (v === undefined || v === "indefinite")
        return fallback;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n / 1000 : fallback;
};
export const boolish = (v) => {
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
