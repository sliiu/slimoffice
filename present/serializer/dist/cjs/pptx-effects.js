"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectShapeEffectsForWrite = collectShapeEffectsForWrite;
exports.effectsToXml = effectsToXml;
const xml_util_1 = require("./xml-util");
/** ECMA-376 effectLst 距离/模糊单位：与 parser `readShadow` 对偶（÷12700）。 */
function effectLenEmu(v) {
    return Math.round(v * 12700);
}
/**
 * ECMA-376 §20.1.8.53 outerShdw / §20.1.8.50 reflection 的 `rotWithShape` 默认值是
 * **true**。parser 只在属性显式存在时记录，因此 `false` 代表原文件写了
 * `rotWithShape="0"` —— 必须原样写回，否则回落到默认 true，阴影会跟着形状一起旋转。
 */
function rotWithShapeAttr(v) {
    if (v === undefined)
        return "";
    return v ? 'rotWithShape="1"' : 'rotWithShape="0"';
}
function effectColorInner(color, alpha) {
    const parsed = (0, xml_util_1.parseColor)(color);
    const a = alpha ?? 1;
    const alphaChild = a < 1 ? `<a:alpha val="${Math.round(a * 100000)}"/>` : "";
    return `<a:srgbClr val="${parsed.hex}">${alphaChild}</a:srgbClr>`;
}
function shadowAttrs(sh) {
    const dir = sh.dir !== undefined
        ? (0, xml_util_1.angleToEmu)(sh.dir)
        : (0, xml_util_1.angleToEmu)((Math.atan2(sh.dy, sh.dx) * 180) / Math.PI);
    const dist = sh.dist !== undefined ? effectLenEmu(sh.dist) : effectLenEmu(Math.hypot(sh.dx, sh.dy));
    const parts = [
        `blurRad="${effectLenEmu(sh.blur)}"`,
        `dist="${dist}"`,
        `dir="${dir}"`,
        sh.algn ? `algn="${sh.algn}"` : "",
        rotWithShapeAttr(sh.rotWithShape),
        sh.sx !== undefined ? `sx="${Math.round(sh.sx * 100000)}"` : "",
        sh.sy !== undefined ? `sy="${Math.round(sh.sy * 100000)}"` : "",
        sh.skewX !== undefined ? `kx="${(0, xml_util_1.angleToEmu)(sh.skewX)}"` : "",
        sh.skewY !== undefined ? `ky="${(0, xml_util_1.angleToEmu)(sh.skewY)}"` : "",
        sh.prst ? `prst="${(0, xml_util_1.esc)(sh.prst)}"` : "",
    ].filter(Boolean);
    return parts.join(" ");
}
function shadowXml(sh) {
    const tag = sh.kind === "inner" ? "a:innerShdw" : "a:outerShdw";
    return `<${tag} ${shadowAttrs(sh)}>${effectColorInner(sh.color, sh.alpha ?? 1)}</${tag}>`;
}
function glowXml(g) {
    return `<a:glow rad="${effectLenEmu(g.radius)}">${effectColorInner(g.color, g.alpha ?? 1)}</a:glow>`;
}
function softEdgeXml(s) {
    return `<a:softEdge rad="${effectLenEmu(s.radius)}"/>`;
}
function reflectionXml(r) {
    const parts = [
        `blurRad="${effectLenEmu(r.blur)}"`,
        `stA="${Math.round((r.startAlpha ?? 1) * 100000)}"`,
        `endA="${Math.round((r.endAlpha ?? 0) * 100000)}"`,
        `stPos="${Math.round((r.startPos ?? 0) * 100000)}"`,
        `endPos="${Math.round((r.endPos ?? 1) * 100000)}"`,
        `dir="${(0, xml_util_1.angleToEmu)(r.dir ?? 0)}"`,
        `dist="${effectLenEmu(r.dist ?? 0)}"`,
        r.fadeDir !== undefined ? `fadeDir="${(0, xml_util_1.angleToEmu)(r.fadeDir)}"` : "",
        r.sx !== undefined ? `sx="${Math.round(r.sx * 100000)}"` : "",
        r.sy !== undefined ? `sy="${Math.round(r.sy * 100000)}"` : "",
        r.algn ? `algn="${r.algn}"` : "",
        rotWithShapeAttr(r.rotWithShape),
    ].filter(Boolean);
    return `<a:reflection ${parts.join(" ")}/>`;
}
function blurXml(b) {
    const grow = b.grow ? ' grow="1"' : "";
    return `<a:blur rad="${effectLenEmu(b.radius)}"${grow}/>`;
}
function effectEntryXml(fx) {
    switch (fx.kind) {
        case "outer":
        case "inner":
            return shadowXml(fx);
        case "glow":
            return glowXml(fx);
        case "softEdge":
            return softEdgeXml(fx);
        case "reflection":
            return reflectionXml(fx);
        case "blur":
            return blurXml(fx);
        default:
            return "";
    }
}
/** 收集 shape 上应写出的效果列表（effects 优先，shadow 兜底）。 */
function collectShapeEffectsForWrite(s) {
    if (s.effects && s.effects.length)
        return s.effects;
    if (s.shadow)
        return [s.shadow];
    return [];
}
/** `<a:effectLst>…</a:effectLst>`；无效果时返回空字符串。 */
function effectsToXml(effects) {
    const body = effects.map(effectEntryXml).filter(Boolean).join("");
    if (!body)
        return "";
    return `<a:effectLst>${body}</a:effectLst>`;
}
