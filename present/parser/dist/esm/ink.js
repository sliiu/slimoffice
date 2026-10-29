// Office `p:contentPart` + InkML → PathShape，供编辑器 / 放映显示墨迹。
import { attr, findAllByLocalName, findByLocalName } from "./xml.js";
function nodeText(n) {
    if (!n)
        return "";
    if (typeof n === "string")
        return n;
    const t = n["#text"];
    if (typeof t === "string")
        return t;
    return "";
}
function parseTracePoints(text) {
    const nums = text
        .split(/[\s,]+/)
        .map((s) => Number(s))
        .filter((n) => Number.isFinite(n));
    const out = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
        out.push([nums[i], nums[i + 1]]);
    }
    return out;
}
function pointsToSvgPath(pts) {
    if (pts.length === 0)
        return "";
    const [first, ...rest] = pts;
    let d = `M ${first[0]} ${first[1]}`;
    for (const p of rest)
        d += ` L ${p[0]} ${p[1]}`;
    return d;
}
function mapPointsToBBox(pts, bbox) {
    if (pts.length === 0)
        return pts;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of pts) {
        if (x < minX)
            minX = x;
        if (y < minY)
            minY = y;
        if (x > maxX)
            maxX = x;
        if (y > maxY)
            maxY = y;
    }
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    return pts.map(([x, y]) => [
        bbox.x + ((x - minX) / w) * bbox.w,
        bbox.y + ((y - minY) / h) * bbox.h,
    ]);
}
function parseBrush(ink) {
    let color = "#111827";
    let alpha = 1;
    let width = 3;
    let highlighter = false;
    for (const brush of findAllByLocalName(ink, "brush")) {
        for (const prop of findAllByLocalName(brush, "brushProperty")) {
            const name = (attr(prop, "name") ?? "").toLowerCase();
            const value = attr(prop, "value") ?? nodeText(prop);
            if (name === "color" && value)
                color = value.startsWith("#") ? value : `#${value}`;
            if (name === "width") {
                const n = Number(value);
                if (Number.isFinite(n) && n > 0)
                    width = n;
            }
            if (name === "transparency") {
                const n = Number(value);
                if (Number.isFinite(n))
                    alpha = n > 1 ? 1 - n / 255 : 1 - n;
            }
            if (name === "rasterop" && /mask/i.test(value))
                highlighter = true;
        }
    }
    return { color, alpha: Math.max(0, Math.min(1, alpha)), width, highlighter };
}
export function parseInkMlToPath(xml, meta, bbox, transform) {
    const ink = findByLocalName(xml, "ink") ?? xml;
    const traces = findAllByLocalName(ink, "trace");
    const all = [];
    for (const tr of traces) {
        all.push(...parseTracePoints(nodeText(tr)));
    }
    if (all.length < 2)
        return null;
    const mapped = mapPointsToBBox(all, bbox);
    const brush = parseBrush(ink);
    return {
        ...meta,
        kind: "path",
        bbox,
        transform,
        d: pointsToSvgPath(mapped),
        fill: { kind: "none" },
        stroke: {
            paint: { kind: "solid", color: brush.color, alpha: brush.alpha },
            width: brush.width,
            cap: "round",
            join: "round",
        },
        ink: { mode: brush.highlighter ? "highlighter" : "pen" },
    };
}
export function looksLikeInkMl(xml) {
    if (!xml)
        return false;
    return !!findByLocalName(xml, "ink") || !!findByLocalName(xml, "trace");
}
