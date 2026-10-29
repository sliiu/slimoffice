// OOXML preset 展开：把 (presetClass, presetID, presetSubtype) 映射为 AtomTrack[]。
// 主要用途：编辑器添加新预设动画时合成对应行为；播放期 cBhvr 子节点缺失时的 fallback。
import { DEFAULT_DIRECTION, DIRECTION_VECTORS, PRESET_MOTION_PATHS, PRESET_TABLE, } from "./presets.data.js";
import { Easings } from "../easing.js";
import { evalArithmetic } from "./expr.js";
import { samplePath } from "./path.js";
export function listPresets(classKey) {
    if (classKey === "path")
        return listPathPresets();
    const out = [];
    for (const desc of PRESET_TABLE[classKey]) {
        const main = desc.ids[0] ?? 0;
        out.push({
            classKey,
            id: main,
            ids: desc.ids,
            name: desc.name,
            supportsSubtype: desc.supportsSubtype,
        });
    }
    return out;
}
// PATH 预设：从 PRESET_MOTION_PATHS 直接生成；名称按 ECMA-376 §19.4.39 标准命名顺序。
const PATH_NAMES = {
    1: "对角线右下",
    2: "对角线右上",
    3: "向下",
    4: "下右",
    5: "向左",
    6: "向右",
    7: "向上",
    8: "上右",
    9: "圆形",
    10: "豆形",
    11: "正方形",
    12: "三角形",
    13: "月牙形",
    14: "椭圆",
    15: "五角星",
    16: "菱形",
    17: "水平 8 字",
    18: "等腰三角形",
    19: "饼形",
    20: "心形",
    21: "六边形",
    22: "八边形",
    23: "梯形",
    24: "五边形",
    25: "八角星",
    26: "直角三角形",
    27: "矩形",
    28: "五角星 2",
    29: "六角星",
    30: "八角星 2",
    31: "波浪",
    32: "倒置梯形",
    33: "弧线右下",
    34: "弧线左上",
    35: "弧线右上",
    36: "弧线左下",
    37: "弹簧右",
    38: "弹簧右下",
    39: "弹簧下",
    40: "弹簧下右",
    41: "正弦波 1",
    42: "正弦波 2",
    43: "环路",
    44: "锯齿线",
    45: "锯齿线 2",
    46: "圆环",
    47: "阶梯下",
    48: "阶梯上",
    49: "波峰",
    50: "细密波浪",
    51: "双环",
    52: "双圆",
    53: "S 形",
    54: "波浪上行",
    55: "波浪下行",
    56: "波浪 2",
    57: "波浪 3",
    58: "圆弧 1",
    59: "圆弧 2",
    60: "弧形右",
    61: "弧形下",
    62: "弧形左",
    63: "停留",
};
function listPathPresets() {
    const out = [];
    const keys = Object.keys(PRESET_MOTION_PATHS).map(Number).sort((a, b) => a - b);
    for (const id of keys) {
        out.push({
            classKey: "path",
            id,
            ids: [id],
            name: PATH_NAMES[id] ?? `路径 ${id}`,
            supportsSubtype: false,
        });
    }
    return out;
}
export function compilePresetTracks(presetClass, presetId, presetSubtype, ctx) {
    if (presetClass === "path" && presetId !== undefined) {
        const d = PRESET_MOTION_PATHS[presetId];
        if (!d)
            return [];
        const pts = samplePath(d, 60, ctx.slideWidth, ctx.slideHeight);
        if (pts.length < 2)
            return [];
        const motion = { kind: "motion", points: pts, origin: "parent" };
        return [motion];
    }
    const key = classToKey(presetClass);
    if (!key)
        return [];
    const desc = findPreset(key, presetId);
    if (!desc)
        return [];
    const dir = resolveDirection(desc, presetSubtype);
    const env = buildEnv(ctx, dir, presetSubtype);
    const out = [];
    for (const ch of desc.channels) {
        const t = compileChannel(ch, ctx.duration, env);
        if (t)
            out.push(t);
    }
    if (desc.filters) {
        for (const f of desc.filters) {
            out.push(compileFilter(f, ctx.duration, env));
        }
    }
    return out;
}
function compileFilter(f, duration, env) {
    const transition = f.transition ?? "in";
    const pr = f.prLst?.replace(/\$inOut/g, inOutToken(env.vars.subtype, transition));
    return {
        kind: "filter",
        filter: f.filter,
        transition,
        prLst: pr ? expandTemplate(pr, env) : undefined,
        duration,
    };
}
// §19.5.8 wipe 的 prLst 直接描述"内容显现的起点边"（参 effect-clip.ts parseDir）：
// 方向名 → from<同边> token。例如 "From Left"(left) → "fromLeft" → 自左侧显现(L→R)。
// 旧实现把每个方向映射成了"对边"（left→fromRight…），导致 entrance 方向整体反掉，
// 与 7.pptx slide7 实际 PowerPoint 行为不符。这里改回"同边"。
//
// exit 的进/出几何由 effectClipPathD 的 transition="out" 统一处理（visible = full ∖ entrance(1-p)），
// entrance/exit 都直接用 subtype 的方向名。
function wipeFromPrst(dir) {
    switch (dir) {
        case "bottom":
            return "fromBottom";
        case "top":
            return "fromTop";
        case "left":
            return "fromLeft";
        case "right":
            return "fromRight";
        case "bottomLeft":
            return "fromBottomLeft";
        case "bottomRight":
            return "fromBottomRight";
        case "topLeft":
            return "fromTopLeft";
        case "topRight":
            return "fromTopRight";
        default:
            return "fromBottom";
    }
}
function expandTemplate(s, env) {
    return s
        .replace(/\$dirName/g, env.dirName)
        .replace(/\$wipeFrom/g, () => wipeFromPrst(env.dirName))
        .replace(/\$axis/g, dirToAxis(env.dirName))
        .replace(/\$checker/g, checkerWord(env.dirName))
        .replace(/\$strips/g, stripsCorner(env.dirName))
        .replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
        const v = env.vars[name];
        return Number.isFinite(v) ? String(v) : "";
    });
}
// 棋盘的 OOXML 词是 across / down。$axis 给百叶窗的是 horz / vert，棋盘认不出 vert。
function checkerWord(name) {
    switch (name) {
        case "top":
        case "bottom":
        case "vertical":
            return "down";
        default:
            return "across";
    }
}
// 条纹四角。方向名是 topRight，滤镜词是 upRight。缺省右下，和以前不写 prLst 时一样。
function stripsCorner(name) {
    switch (name) {
        case "topRight":
            return "upRight";
        case "topLeft":
            return "upLeft";
        case "bottomLeft":
            return "downLeft";
        case "bottomRight":
            return "downRight";
        default:
            return "downRight";
    }
}
function inOutToken(subtype, transition) {
    if (subtype === 32)
        return "out";
    if (subtype === 16)
        return "in";
    return transition === "out" ? "out" : "in";
}
function dirToAxis(name) {
    switch (name) {
        case "left":
        case "right":
        case "horizontal":
            return "horz";
        case "top":
        case "bottom":
        case "vertical":
            return "vert";
        default:
            return "horz";
    }
}
function buildEnv(ctx, dir, subtype) {
    const sw = ctx.slideWidth || 1;
    const sh = ctx.slideHeight || 1;
    const distX = Math.max(sw, 1);
    const distY = Math.max(sh, 1);
    const dist = dir.dx !== 0 && dir.dy === 0
        ? distX
        : dir.dy !== 0 && dir.dx === 0
            ? distY
            : Math.hypot(distX, distY) / 2;
    const sp = subtype && subtype > 0 ? subtype : 1;
    return {
        vars: {
            dx: dir.dx,
            dy: dir.dy,
            dist,
            bboxW: ctx.bbox.w,
            bboxH: ctx.bbox.h,
            sw,
            sh,
            spokes: sp,
            subtype: subtype ?? 0,
        },
        dirName: dir.name,
    };
}
function classToKey(c) {
    switch (c) {
        case "entr":
            return "entr";
        case "exit":
            return "exit";
        case "emph":
            return "emph";
        case "path":
            return "path";
        default:
            return undefined;
    }
}
function findPreset(key, id) {
    if (id === undefined)
        return undefined;
    for (const p of PRESET_TABLE[key]) {
        if (p.ids.includes(id))
            return p;
    }
    return undefined;
}
// 进入时 subtype 是"从哪边来"，退出时是"往哪边去"（PowerPoint Fly Out 4 = 飞向底部），
// 两者都就是向量本身：FLY_IN 从 $dx*$dist 回到 0，FLY_OUT 从 0 走到 $dx*$dist，不需要再反向。
function resolveDirection(desc, subtype) {
    if (!desc.supportsSubtype || subtype === undefined)
        return DEFAULT_DIRECTION;
    return DIRECTION_VECTORS[subtype] ?? DEFAULT_DIRECTION;
}
function compileChannel(ch, duration, env) {
    const valueKind = (ch.valueKind ?? guessValueKind(ch.prop));
    const keys = [];
    for (const k of ch.kf) {
        const time = clamp01(k.t) * duration;
        let value;
        if (typeof k.v === "number")
            value = k.v;
        else
            value = evalExpr(k.v, env, valueKind);
        keys.push({
            time,
            value,
            easing: nameToFn(k.ease ?? ch.defaultEase),
        });
    }
    if (keys.length === 0)
        return null;
    return {
        kind: "prop",
        property: ch.prop,
        valueKind,
        keys,
        relative: ch.relative,
    };
}
function nameToFn(name) {
    if (!name)
        return undefined;
    const fn = Easings[name];
    return fn;
}
function clamp01(x) {
    if (!Number.isFinite(x))
        return 0;
    return x < 0 ? 0 : x > 1 ? 1 : x;
}
function guessValueKind(prop) {
    if (prop === "fillColor" || prop === "strokeColor" || prop === "fontColor")
        return "color";
    if (prop === "clipDirection" || prop === "wheelReveal")
        return "string";
    return "number";
}
function evalExpr(expr, env, kind) {
    const trimmed = expr.trim();
    if (kind === "string") {
        return trimmed
            .replace(/\$dirName/g, env.dirName)
            .replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
            const v = env.vars[name];
            return Number.isFinite(v) ? String(v) : "0";
        });
    }
    let s = trimmed;
    s = s.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
        const v = env.vars[name];
        return Number.isFinite(v) ? `(${v})` : "0";
    });
    if (!/^[-+*/().0-9eE\s]+$/.test(s))
        return 0;
    try {
        const v = evalArithmetic(s);
        return Number.isFinite(v) ? v : 0;
    }
    catch {
        return 0;
    }
}
export { DIRECTION_VECTORS, DEFAULT_DIRECTION, PRESET_MOTION_PATHS, PRESET_TABLE };
