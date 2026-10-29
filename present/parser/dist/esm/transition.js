import { TRANSITION_SPEED_TO_SEC as SPEED_TO_SEC } from "@sliiu/present-core";
import { attr, findByLocalName, orderedChildren, pickAlternateContentChildren, stripNs, } from "./xml.js";
const KIND_TABLE = {
    fade: { kind: "fade", pickThruBlk: true },
    cut: { kind: "cut", pickThruBlk: true },
    push: { kind: "push", pickDir: true },
    // PowerPoint「揭开」就是 ECMA 的 <p:pull>。
    pull: { kind: "uncover", pickDir: true },
    cover: { kind: "cover", pickDir: true },
    uncover: { kind: "uncover", pickDir: true },
    wipe: { kind: "wipe", pickDir: true },
    split: { kind: "split", pickOrient: true, pickDir: true },
    blinds: { kind: "blinds", orientFromDir: true },
    checker: { kind: "checker", orientFromDir: true },
    checkerboard: { kind: "checker", orientFromDir: true },
    randomBar: { kind: "randomBar", orientFromDir: true },
    random: { kind: "random" },
    dissolve: { kind: "dissolve" },
    newsflash: { kind: "newsflash" },
    zoom: { kind: "zoom", pickDirShape: true },
    wheel: { kind: "wheel", pickPattern: true },
    wheelReverse: { kind: "wheelReverse", pickPattern: true },
    circle: { kind: "circle" },
    diamond: { kind: "diamond" },
    plus: { kind: "plus" },
    comb: { kind: "comb", orientFromDir: true },
    strips: { kind: "strips", pickDir: true },
    wedge: { kind: "wedge" },
    fall: { kind: "fall" },
    // PowerPoint 2013「跌落」写成 p15:prstTrans prst="fallOver"。
    fallOver: { kind: "fall", pickDir: true },
    fly: { kind: "push", pickDir: true },
    morph: { kind: "morph", morph: true },
    glitter: { kind: "glitter", pickDir: true, pickPattern: true },
    honeycomb: { kind: "honeycomb" },
    cube: { kind: "cube", pickDir: true },
    box: { kind: "box", pickDir: true },
    gallery: { kind: "gallery", pickDir: true },
    orbit: { kind: "orbit", pickDir: true },
    conveyor: { kind: "conveyor", pickDir: true },
    doors: { kind: "doors", orientFromDir: true },
    window: { kind: "window", orientFromDir: true },
    pageCurl: { kind: "pageCurl", pickDir: true },
    pageCurlDouble: { kind: "pageCurl", pickDir: true },
    pageCurlSingle: { kind: "pageCurlSingle", pickDir: true },
    wind: { kind: "wind", pickDir: true },
    crush: { kind: "crush", pickDir: true },
    prestige: { kind: "prestige" },
    prism: { kind: "prism", pickDir: true },
    airplane: { kind: "airplane", pickDir: true },
    origami: { kind: "origami", pickDir: true },
    reveal: { kind: "reveal", pickDir: true, pickThruBlk: true },
    flythrough: { kind: "flythrough", pickDir: true },
    rotate: { kind: "rotate", pickDir: true },
    rotation: { kind: "rotate", pickDir: true },
    curtains: { kind: "curtains" },
    flash: { kind: "flash" },
    peelOff: { kind: "peelOff", pickDir: true },
    ferris: { kind: "ferris", pickDir: true },
    fracture: { kind: "fracture" },
    drape: { kind: "drape", pickDir: true },
    shred: { kind: "shred", pickDir: true, pickPattern: true },
    switch: { kind: "switch", pickDir: true },
    flip: { kind: "flip", pickDir: true },
    ripple: { kind: "ripple", pickDir: true },
    warp: { kind: "warp", pickDir: true },
    vortex: { kind: "vortex", pickDir: true },
    pan: { kind: "push", pickDir: true },
};
const P14_EXT_URI = "{91A5F47B-71C9-4F73-B26C-29C7CC7B8C6D}";
const P15_EXT_URI = "{D42A4DDA-D4B3-4B7D-8E76-9F4F8E5D2C8D}";
export function parseSlideTransition(rootEl, ctx) {
    let transEl = findByLocalName(rootEl, "transition");
    let extTransEl;
    if (!transEl) {
        // PowerPoint 2010+ 把 transition 包在 `<mc:AlternateContent>` 里：Choice 给带 p14
        // 命名空间扩展属性（如 morph、p14:dur）的版本，Fallback 给经典 `<p:transition>`。
        // 我们用 pickAlternateContentChildren 拿优先分支，从中取 transition 子节点。
        const altGroup = findByLocalName(rootEl, "AlternateContent");
        if (altGroup) {
            for (const ref of pickAlternateContentChildren(altGroup)) {
                if (stripNs(ref.tag) === "transition") {
                    transEl = ref.node;
                    break;
                }
            }
        }
    }
    if (!transEl)
        return undefined;
    const extTrans = findExtTransition(transEl);
    if (extTrans)
        extTransEl = extTrans;
    const spd = attr(transEl, "spd") ?? "med";
    // 精确时长是 [MS-PPTX] §2.3.2.3 的 p14:dur（PowerPoint 2010+ 都这么写），ECMA 的 p:transition
    // 本身没有 dur 属性；两种写法都认，否则 PowerPoint 存的 1600ms 会被 spd="slow" 抹成 1250ms。
    const dur = attr(transEl, "dur") ?? attr(transEl, "p14:dur");
    const advClick = attr(transEl, "advClick");
    const advTm = attr(transEl, "advTm");
    let duration = SPEED_TO_SEC[spd] ?? SPEED_TO_SEC.med;
    // ECMA-376 §19.5.50 dur — 显式毫秒值（含 0）覆盖 spd。dur="0" 表示无动画过渡。
    if (dur !== undefined) {
        const n = Number(dur);
        if (Number.isFinite(n) && n >= 0)
            duration = n / 1000;
    }
    let kindRaw;
    let inner;
    for (const c of orderedChildren(transEl)) {
        const local = stripNs(c.tag);
        if (local === "extLst" || local === "sndAc")
            continue;
        // PowerPoint 2013+ 的新过渡（airplane / origami / curtains …）是 <p15:prstTrans prst="…"/>
        // 直接挂在 p:transition 下：真正的类型在 prst 属性里，元素名只是壳。
        kindRaw = local === "prstTrans" ? (attr(c.node, "prst") ?? local) : local;
        inner = c.node;
        break;
    }
    if (extTransEl && !KIND_TABLE[kindRaw ?? ""]) {
        for (const c of orderedChildren(extTransEl)) {
            const local = stripNs(c.tag);
            if (local === "extLst")
                continue;
            kindRaw = local;
            inner = c.node;
            break;
        }
    }
    const params = {};
    const sound = parseSound(transEl, ctx);
    if (sound)
        params.sound = sound;
    if (advClick !== undefined)
        params.advClick = advClick === "1" || advClick === "true";
    if (advTm !== undefined) {
        const n = Number(advTm);
        if (Number.isFinite(n))
            params.advAfter = n / 1000;
    }
    if (!kindRaw)
        return { kind: "cut", duration: 0, params: keepParams(params) };
    const def = KIND_TABLE[kindRaw];
    if (!def)
        return { kind: kindRaw, duration, params: keepParams(params) };
    if (def.pickDir) {
        const d = attr(inner, "dir");
        if (d)
            params.dir = normalizeDir(d);
        // [MS-PPTX] CT_PresetTransition（p15:prstTrans）没有 dir：invX 把左向预设镜像成右向，invY 把上向镜像成下向。
        else if (isOn(attr(inner, "invX")))
            params.dir = "right";
        else if (isOn(attr(inner, "invY")))
            params.dir = "down";
    }
    if (def.pickOrient || def.orientFromDir) {
        const o = attr(inner, def.orientFromDir ? "dir" : "orient");
        if (o)
            params.orient = o;
    }
    if (def.pickPattern) {
        const pat = attr(inner, "pattern") ?? attr(inner, "spokes");
        if (pat)
            params.pattern = pat;
    }
    if (def.pickDirShape) {
        const d = attr(inner, "dir");
        if (d)
            params.dir = d === "out" ? "out" : "in";
    }
    if (def.pickThruBlk) {
        const tb = attr(inner, "thruBlk");
        if (tb === "1" || tb === "true")
            params.thruBlk = true;
    }
    if (def.morph) {
        const opt = attr(inner, "option");
        if (opt)
            params.option = opt;
    }
    if (def.kind === "prism") {
        // p14:prism 的 isContent / isInverted 区分 Cube / Box / Rotate / Orbit 四个 3D 变体；
        // 落到对应 kind 上，播放走各自的实现，序列化时由 P14_PRISM_VARIANTS 写回同一组标志。
        const isContent = isOn(attr(inner, "isContent"));
        const isInverted = isOn(attr(inner, "isInverted"));
        const kind = isContent ? (isInverted ? "orbit" : "rotate") : isInverted ? "box" : "cube";
        return { kind, duration, params: keepParams(params) };
    }
    return { kind: def.kind, duration, params: keepParams(params) };
}
function findExtTransition(transEl) {
    const extLst = findByLocalName(transEl, "extLst");
    if (!extLst)
        return undefined;
    for (const c of orderedChildren(extLst)) {
        const local = stripNs(c.tag);
        if (local !== "ext")
            continue;
        const uri = attr(c.node, "uri");
        if (uri !== P14_EXT_URI && uri !== P15_EXT_URI && uri !== "{D42A4DDA-D4B3-4B7D-8E76-9F4F8E5D2C8D}") {
            // try inner anyway
        }
        for (const cc of orderedChildren(c.node)) {
            const lk = stripNs(cc.tag);
            if (lk === "prstTrans" || lk === "morph") {
                const prst = attr(cc.node, "prst") ?? lk;
                return wrapPrst(prst, cc.node);
            }
        }
    }
    return undefined;
}
function wrapPrst(prst, node) {
    const wrap = { [prst]: node };
    Object.defineProperty(wrap, "$children", {
        value: [{ tag: prst, node }],
        enumerable: false,
        configurable: true,
    });
    return wrap;
}
function parseSound(transEl, ctx) {
    const sndAc = findByLocalName(transEl, "sndAc");
    if (!sndAc)
        return undefined;
    const stSnd = findByLocalName(sndAc, "stSnd");
    const snd = findByLocalName(stSnd, "snd");
    if (!snd)
        return undefined;
    const rid = attr(snd, "r:embed") ?? attr(snd, "embed");
    const link = attr(snd, "r:link") ?? attr(snd, "link");
    const loop = attr(stSnd, "loop") === "1";
    if (link && !rid)
        return { src: link, loop };
    if (!rid)
        return undefined;
    const resolved = resolveTransitionSoundSrc(rid, ctx);
    return { src: resolved, loop };
}
function resolveTransitionSoundSrc(rid, ctx) {
    if (!/^rId\d+/i.test(rid))
        return rid;
    const path = ctx?.rels?.resolve(rid);
    if (!path)
        return rid;
    return ctx?.resolveMedia?.(path) ?? rid;
}
function normalizeDir(d) {
    switch (d) {
        case "l":
            return "left";
        case "r":
            return "right";
        case "u":
            return "up";
        case "d":
            return "down";
        // ST_TransitionCornerDirectionType 是 lu / ru / ld / rd；tl / tr / bl / br 是我们早期导出的非法值，仍兼容读入。
        case "lu":
        case "tl":
            return "topLeft";
        case "ru":
        case "tr":
            return "topRight";
        case "ld":
        case "bl":
            return "bottomLeft";
        case "rd":
        case "br":
            return "bottomRight";
        case "horz":
            return "left";
        case "vert":
            return "up";
        default:
            return d;
    }
}
function isOn(v) {
    return v === "1" || v === "true";
}
function keepParams(p) {
    return Object.keys(p).length ? p : undefined;
}
