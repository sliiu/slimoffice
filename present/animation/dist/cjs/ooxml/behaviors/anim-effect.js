"use strict";
// §19.5.8 a:animEffect — 滤镜动画行为。
// OOXML 标准把方向参数嵌在 filter 属性里，例如 "blinds(horizontal)"、
// "wipe(up)"、"wheel(8)"。拆出基础 filter 名和括号内 token 合并到 prLst，
// 让后续 effectClipPathD 的 parseDir 能统一识别。
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileAnimEffect = compileAnimEffect;
function compileAnimEffect(node, dur, easing) {
    const raw = node.filter ?? "";
    const m = /^([a-zA-Z]+)(?:\(([^)]*)\))?$/.exec(raw);
    const filter = m ? m[1] : raw;
    const filterParam = m?.[2];
    const transition = node.transition ?? "in";
    const prLst = [filterParam, node.prLst].filter(Boolean).join(";") || undefined;
    return [
        {
            kind: "filter",
            filter,
            transition,
            prLst,
            duration: dur,
            ...(easing ? { easing } : {}),
        },
    ];
}
