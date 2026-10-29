"use strict";
/**
 * Lucide icon → native stroke-only PathShape (no DOM, no raster).
 * Lucide nodes are [tag, attrs] in a 24×24 box; we rewrite circle / rect /
 * line / polyline / polygon into path data so one PathShape carries the icon
 * and exports as `<a:custGeom>` with a real stroke — recolorable in the editor.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.absolutizeLeadingMove = absolutizeLeadingMove;
exports.lucidePathData = lucidePathData;
exports.scalePathData = scalePathData;
exports.iconPathShape = iconPathShape;
const core_1 = require("@sliiu/present-core");
const lucide_1 = require("lucide");
function kebabToPascal(id) {
    return id.replace(/[-_]+(.)/g, (_, c) => c.toUpperCase()).replace(/^(.)/, (m) => m.toUpperCase());
}
function nodeOf(id) {
    const rec = lucide_1.icons;
    const n = (rec[id] ?? rec[kebabToPascal(id)]);
    return Array.isArray(n) ? n : undefined;
}
function num(v, fallback = 0) {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}
function circlePath(cx, cy, r) {
    return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;
}
function ellipsePath(cx, cy, rx, ry) {
    return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;
}
function rectPath(x, y, w, h, rx) {
    if (rx <= 0)
        return `M${x} ${y}h${w}v${h}h${-w}Z`;
    const r = Math.min(rx, w / 2, h / 2);
    return [
        `M${x + r} ${y}`,
        `h${w - 2 * r}`,
        `a${r} ${r} 0 0 1 ${r} ${r}`,
        `v${h - 2 * r}`,
        `a${r} ${r} 0 0 1 ${-r} ${r}`,
        `h${-(w - 2 * r)}`,
        `a${r} ${r} 0 0 1 ${-r} ${-r}`,
        `v${-(h - 2 * r)}`,
        `a${r} ${r} 0 0 1 ${r} ${-r}`,
        "Z",
    ].join("");
}
function pointsPath(points, close) {
    const nums = points
        .trim()
        .split(/[\s,]+/)
        .map(Number)
        .filter((n) => Number.isFinite(n));
    if (nums.length < 4)
        return "";
    let d = `M${nums[0]} ${nums[1]}`;
    for (let i = 2; i + 1 < nums.length; i += 2)
        d += `L${nums[i]} ${nums[i + 1]}`;
    return close ? `${d}Z` : d;
}
const NUM = String.raw `-?\d*\.?\d+(?:e-?\d+)?`;
const LEADING_REL_MOVE = new RegExp(String.raw `^\s*m\s*(${NUM})[\s,]*(${NUM})\s*`);
/**
 * SVG treats a *leading* relative `m` as absolute (§9.3.3). Lucide writes many
 * children that way (`m9 12 2 2 4-4`). Once several children are concatenated
 * into one `d` and later scaled, that `m` becomes a real delta — from the end of
 * the previous child, or from the slide origin for the first one — which drew
 * stray lines from the top-left corner of the slide to the icon. Rewrite it as
 * `M x y` and keep any implicit follow-up pairs relative via an explicit `l`.
 */
function absolutizeLeadingMove(d) {
    const m = LEADING_REL_MOVE.exec(d);
    if (!m)
        return d;
    const rest = d.slice(m[0].length);
    const restIsCoords = rest.length > 0 && !/^[a-zA-Z]/.test(rest);
    return `M${m[1]} ${m[2]}${restIsCoords ? `l${rest}` : rest}`;
}
function childToPath(node) {
    const [tag, a, children] = node;
    switch (tag) {
        case "path":
            return absolutizeLeadingMove(String(a.d ?? ""));
        case "circle":
            return circlePath(num(a.cx), num(a.cy), num(a.r));
        case "ellipse":
            return ellipsePath(num(a.cx), num(a.cy), num(a.rx), num(a.ry));
        case "rect":
            return rectPath(num(a.x), num(a.y), num(a.width), num(a.height), num(a.rx, num(a.ry)));
        case "line":
            return `M${num(a.x1)} ${num(a.y1)}L${num(a.x2)} ${num(a.y2)}`;
        case "polyline":
            return pointsPath(String(a.points ?? ""), false);
        case "polygon":
            return pointsPath(String(a.points ?? ""), true);
        default:
            return (children ?? []).map(childToPath).join("");
    }
}
/** Icon path data in lucide's 24×24 space, or undefined for unknown ids. */
function lucidePathData(id) {
    const node = nodeOf(id);
    if (!node)
        return undefined;
    const d = node.map(childToPath).filter(Boolean).join(" ");
    return d || undefined;
}
/**
 * Scale a 24-unit path into `bbox` (uniform scale, centered). Path commands
 * are rewritten numerically so the result is a plain absolute-or-relative
 * SVG path in slide pixels. Arc flags are preserved.
 */
function scalePathData(d, bbox) {
    const side = Math.min(bbox.w, bbox.h);
    const k = side / 24;
    const ox = bbox.x + (bbox.w - side) / 2;
    const oy = bbox.y + (bbox.h - side) / 2;
    const out = [];
    let i = 0;
    let cmd = "";
    let idx = 0;
    const arity = {
        m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0,
    };
    const skipSep = () => {
        while (i < d.length && /[\s,]/.test(d[i]))
            i++;
    };
    const readNumber = () => {
        skipSep();
        const m = /^-?\d*\.?\d+(?:e[+-]?\d+)?/i.exec(d.slice(i));
        if (!m)
            return 0;
        i += m[0].length;
        return Number(m[0]);
    };
    // Arc flags are a single 0 or 1. Lucide writes them concatenated (`0 00-2.47`).
    const readFlag = () => {
        skipSep();
        const c = d[i];
        if (c !== "0" && c !== "1")
            return readNumber();
        i += 1;
        return Number(c);
    };
    while (i < d.length) {
        skipSep();
        if (i >= d.length)
            break;
        const c = d[i];
        if (/[a-zA-Z]/.test(c)) {
            cmd = c;
            idx = 0;
            out.push(c);
            i++;
            if (cmd.toLowerCase() === "z")
                continue;
        }
        if (!cmd || cmd.toLowerCase() === "z")
            break;
        const lower = cmd.toLowerCase();
        const abs = cmd !== lower;
        const ar = arity[lower] ?? 2;
        const pos = ar ? idx % ar : 0;
        const n = lower === "a" && (pos === 3 || pos === 4) ? readFlag() : readNumber();
        let val;
        if (lower === "a") {
            // rx ry rot large sweep x y
            if (pos <= 1)
                val = n * k;
            else if (pos === 2)
                val = n;
            else if (pos <= 4)
                val = n;
            else if (pos === 5)
                val = abs ? n * k + ox : n * k;
            else
                val = abs ? n * k + oy : n * k;
        }
        else if (lower === "h") {
            val = abs ? n * k + ox : n * k;
        }
        else if (lower === "v") {
            val = abs ? n * k + oy : n * k;
        }
        else {
            const isX = pos % 2 === 0;
            val = n * k + (abs ? (isX ? ox : oy) : 0);
        }
        out.push(String(Math.round(val * 100) / 100));
        idx++;
    }
    return out.join(" ").replace(/\s+([a-zA-Z])/g, "$1");
}
/** Stroke-only PathShape for a lucide icon fitted (uniformly) in `bbox`. */
function iconPathShape(icon, bbox, opts) {
    const d24 = lucidePathData(icon);
    if (!d24)
        return undefined;
    const side = Math.min(bbox.w, bbox.h);
    const d = scalePathData(d24, bbox);
    const width = opts.strokeWidth ?? Math.max(1.25, (side / 24) * 2);
    return {
        id: opts.id,
        name: opts.name,
        zIndex: 0,
        visible: true,
        locked: false,
        opacity: 1,
        transform: (0, core_1.identityTransform)(),
        kind: "path",
        bbox: { x: bbox.x + (bbox.w - side) / 2, y: bbox.y + (bbox.h - side) / 2, w: side, h: side },
        d,
        stroke: { paint: { kind: "solid", color: opts.color }, width, cap: "round", join: "round" },
    };
}
