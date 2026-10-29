// 插值器：number / color / string / discrete
// 颜色按 sRGB 线性插值（与 PowerPoint 实际行为一致；规范未强制色彩空间）。
// 接受带或不带 # 的 6 位 hex；parser/theme.ts 存的 schemeColors 没带 # 前缀，
// 而 attr-map.ts decodeColor 输出的总带 #，两边都需要解析为 RgbColor。
const HEX_RE = /^#?([0-9a-fA-F]{6})$/;
const RGB_RE = /^rgb\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)\s*\)$/i;
const RGBA_RE = /^rgba\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9.]+)\s*\)$/i;
export function parseColor(input) {
    if (input == null)
        return null;
    if (typeof input === "object" && "r" in input) {
        const c = input;
        return { r: c.r, g: c.g, b: c.b, a: c.a ?? 1 };
    }
    if (typeof input !== "string")
        return null;
    const s = input.trim();
    const hex = HEX_RE.exec(s);
    if (hex) {
        const n = parseInt(hex[1], 16);
        return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff, a: 1 };
    }
    const rgba = RGBA_RE.exec(s);
    if (rgba) {
        return {
            r: clampByte(Number(rgba[1])),
            g: clampByte(Number(rgba[2])),
            b: clampByte(Number(rgba[3])),
            a: clamp01(Number(rgba[4])),
        };
    }
    const rgb = RGB_RE.exec(s);
    if (rgb) {
        return {
            r: clampByte(Number(rgb[1])),
            g: clampByte(Number(rgb[2])),
            b: clampByte(Number(rgb[3])),
            a: 1,
        };
    }
    return null;
}
export function formatColor(c) {
    if (c.a < 1)
        return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${c.a.toFixed(3)})`;
    const h = (n) => clampByte(n).toString(16).padStart(2, "0");
    return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}
export function lerpNumber(a, b, t) {
    return a + (b - a) * t;
}
export function lerpColor(a, b, t) {
    return {
        r: lerpNumber(a.r, b.r, t),
        g: lerpNumber(a.g, b.g, t),
        b: lerpNumber(a.b, b.b, t),
        a: lerpNumber(a.a, b.a, t),
    };
}
// 通用 keyframe 求值。
// calcMode: "discrete" 仅在 keyframe 时刻切换；"lin" / 默认 线性 + easing；"fmla" 由调用方在外部处理后传入数值。
export function sampleKeyframes(keys, time, kind, calcMode = "lin") {
    if (keys.length === 0)
        return undefined;
    if (keys.length === 1)
        return keys[0].value;
    if (time <= keys[0].time)
        return keys[0].value;
    const last = keys[keys.length - 1];
    if (time >= last.time)
        return last.value;
    let lo = 0;
    let hi = keys.length - 1;
    for (let i = 0; i < keys.length - 1; i++) {
        if (time >= keys[i].time && time <= keys[i + 1].time) {
            lo = i;
            hi = i + 1;
            break;
        }
    }
    const a = keys[lo];
    const b = keys[hi];
    if (calcMode === "discrete")
        return a.value;
    const span = b.time - a.time;
    let local = span <= 0 ? 0 : (time - a.time) / span;
    const easing = b.easing ?? a.easing;
    if (easing)
        local = easing(local);
    switch (kind) {
        case "number":
            return lerpNumber(toNumber(a.value), toNumber(b.value), local);
        case "color": {
            const ca = parseColor(a.value);
            const cb = parseColor(b.value);
            if (!ca || !cb)
                return local < 1 ? a.value : b.value;
            return formatColor(lerpColor(ca, cb, local));
        }
        case "bool":
            return local < 1 ? Boolean(a.value) : Boolean(b.value);
        case "point": {
            const pa = a.value;
            const pb = b.value;
            return {
                x: lerpNumber(pa.x, pb.x, local),
                y: lerpNumber(pa.y, pb.y, local),
            };
        }
        case "string":
        default:
            return local < 1 ? a.value : b.value;
    }
}
function clamp01(x) {
    if (!Number.isFinite(x))
        return 0;
    return x < 0 ? 0 : x > 1 ? 1 : x;
}
function clampByte(x) {
    if (!Number.isFinite(x))
        return 0;
    return x < 0 ? 0 : x > 255 ? 255 : x;
}
function toNumber(v) {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
}
