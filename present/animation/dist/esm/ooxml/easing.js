// ECMA-376 §19.5.18 cTn@accel / @decel
// 取值 0..100000，分别表示加速段与减速段占总时长的比例。
// 实现按规范：在加速区间使用 y=(x/a)^2 * a/2 比例累计、匀速段线性、减速段 1 - ((1-x)/d)^2 * d/2。
// 这里采用通用规范实现（参考 SMIL 2.1）。
import { cubicBezier as standardCubicBezier, Easings } from "../easing.js";
const PCT = 100000;
export function accelDecelEasing(accelRaw, decelRaw) {
    const a = clamp01((accelRaw ?? 0) / PCT);
    const d = clamp01((decelRaw ?? 0) / PCT);
    if (a <= 0 && d <= 0)
        return undefined;
    const cruise = Math.max(0, 1 - a - d);
    // 单位时长内总位移 = a/2 + cruise + d/2，按 SMIL 规范归一化。
    const total = a / 2 + cruise + d / 2;
    if (total <= 0)
        return (t) => t;
    return (t) => {
        if (t <= 0)
            return 0;
        if (t >= 1)
            return 1;
        let s;
        if (a > 0 && t < a) {
            s = (t * t) / (2 * a);
        }
        else if (t < a + cruise) {
            s = a / 2 + (t - a);
        }
        else if (d > 0) {
            const td = t - (a + cruise);
            s = a / 2 + cruise + td - (td * td) / (2 * d);
        }
        else {
            s = a / 2 + cruise;
        }
        return s / total;
    };
}
export function bySplineEasing(spl) {
    if (!spl)
        return undefined;
    const nums = spl.split(/[,;\s]+/).filter(Boolean).map(Number).filter((n) => Number.isFinite(n));
    if (nums.length < 4)
        return undefined;
    const [x1, y1, x2, y2] = nums;
    return standardCubicBezier(x1, y1, x2, y2);
}
export function namedEasing(name) {
    if (!name)
        return undefined;
    if (typeof name === "function")
        return name;
    return Easings[name];
}
function clamp01(x) {
    if (!Number.isFinite(x))
        return 0;
    return x < 0 ? 0 : x > 1 ? 1 : x;
}
