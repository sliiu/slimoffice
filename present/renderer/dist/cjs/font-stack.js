"use strict";
/**
 * Font fallback for the browser. OOXML names one typeface per run ("Inter", "Songti SC"); when the
 * machine lacks it PowerPoint substitutes a face of the same class (sans / serif / mono), but a
 * browser given a bare unknown family falls back to its default — usually a serif — so a sans deck
 * comes up in Times. Append the class-matched generic (plus CJK faces so Han glyphs never hit a
 * Latin-only fallback) to every family that is not already a stack.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.withFontFallback = withFontFallback;
const SERIF = /\b(serif|times|georgia|garamond|cambria|palatino|baskerville|didot|bodoni|playfair|fraunces|merriweather|lora|libre|spectral|songti|simsun|song|ming|mincho|kaiti|kai|fangsong|batang)\b|宋体|楷体|仿宋|书宋|明朝/i;
const MONO = /\b(mono|monospace|consolas|menlo|courier|code|inconsolata|fira code|source code|jetbrains|plex mono|space mono)\b/i;
const CJK_FALLBACK = `"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC"`;
const CJK_SERIF_FALLBACK = `"Songti SC", "SimSun", "Noto Serif CJK SC"`;
// OOXML 写的是 Windows 字体名。同一种字在 macOS 上登记成另一个 family，
// 名字对不上时浏览器会跳过它，后面的拉丁字体就把数字和英文抢走。
// 别名紧跟在原名后面，原名存在时仍优先用原名。
const CJK_ALIASES = {
    黑体: ["SimHei", "Heiti SC", "STHeiti", "华文黑体"],
    SimHei: ["黑体", "Heiti SC", "STHeiti"],
    宋体: ["SimSun", "Songti SC", "STSong", "华文宋体"],
    SimSun: ["宋体", "Songti SC", "STSong"],
    新宋体: ["NSimSun", "Songti SC", "SimSun"],
    NSimSun: ["新宋体", "Songti SC"],
    微软雅黑: ["Microsoft YaHei", "PingFang SC", "Hiragino Sans GB"],
    "Microsoft YaHei": ["微软雅黑", "PingFang SC", "Hiragino Sans GB"],
    楷体: ["KaiTi", "Kaiti SC", "STKaiti", "华文楷体"],
    KaiTi: ["楷体", "Kaiti SC", "STKaiti"],
    仿宋: ["FangSong", "STFangsong", "华文仿宋"],
    FangSong: ["仿宋", "STFangsong"],
    等线: ["DengXian", "Microsoft YaHei", "PingFang SC"],
};
const cache = new Map();
/** `family` as a CSS font-family list with a class-matched generic fallback appended. */
function withFontFallback(family) {
    if (!family)
        return `${CJK_FALLBACK}, sans-serif`;
    const hit = cache.get(family);
    if (hit)
        return hit;
    const trimmed = expandCjkAliases(family.trim());
    // Ends in a generic already: trust it. A stack of named faces (`Inter, "Noto Sans SC"`) still
    // needs the generic, since with none of them installed the browser falls to its serif default.
    // The class is judged from the lead family; the rest of the stack is kept as authored.
    const lead = trimmed.split(",")[0].trim().replace(/^["']|["']$/g, "");
    const head = trimmed.includes(",") ? trimmed : quote(trimmed);
    const stack = /\b(sans-serif|serif|monospace|system-ui|cursive|fantasy)\s*$/i.test(trimmed)
        ? trimmed
        : MONO.test(lead)
            ? `${head}, "Menlo", "Consolas", monospace`
            : SERIF.test(lead)
                ? `${head}, ${CJK_SERIF_FALLBACK}, serif`
                : `${head}, ${CJK_FALLBACK}, sans-serif`;
    cache.set(family, stack);
    return stack;
}
function quote(name) {
    return /^["']/.test(name) || !/[\s\d]/.test(name) ? name : `"${name}"`;
}
function unquote(name) {
    return name.trim().replace(/^["']|["']$/g, "");
}
function splitFamilies(stack) {
    const out = [];
    let cur = "";
    let quoted = false;
    for (const ch of stack) {
        if (ch === '"') {
            quoted = !quoted;
            cur += ch;
            continue;
        }
        if (ch === "," && !quoted) {
            if (cur.trim())
                out.push(cur.trim());
            cur = "";
            continue;
        }
        cur += ch;
    }
    if (cur.trim())
        out.push(cur.trim());
    return out;
}
function expandCjkAliases(stack) {
    const parts = splitFamilies(stack);
    const seen = new Set(parts.map((part) => unquote(part).toLowerCase()));
    const out = [];
    for (const part of parts) {
        out.push(part);
        const aliases = CJK_ALIASES[unquote(part)];
        if (!aliases)
            continue;
        for (const alias of aliases) {
            const key = alias.toLowerCase();
            if (seen.has(key))
                continue;
            seen.add(key);
            out.push(quote(alias));
        }
    }
    return out.join(", ");
}
