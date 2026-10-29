const pow = Math.pow;
const sqrt = Math.sqrt;
const sin = Math.sin;
const cos = Math.cos;
const PI = Math.PI;
export const linear = (t) => t;
export const easeInQuad = (t) => t * t;
export const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
export const easeInOutQuad = (t) => t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2;
export const easeInCubic = (t) => t * t * t;
export const easeOutCubic = (t) => 1 - pow(1 - t, 3);
export const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2;
export const easeInQuart = (t) => t * t * t * t;
export const easeOutQuart = (t) => 1 - pow(1 - t, 4);
export const easeInOutQuart = (t) => t < 0.5 ? 8 * t * t * t * t : 1 - pow(-2 * t + 2, 4) / 2;
export const easeInQuint = (t) => t * t * t * t * t;
export const easeOutQuint = (t) => 1 - pow(1 - t, 5);
export const easeInOutQuint = (t) => t < 0.5 ? 16 * t * t * t * t * t : 1 - pow(-2 * t + 2, 5) / 2;
export const easeInSine = (t) => 1 - cos((t * PI) / 2);
export const easeOutSine = (t) => sin((t * PI) / 2);
export const easeInOutSine = (t) => -(cos(PI * t) - 1) / 2;
export const easeInExpo = (t) => (t === 0 ? 0 : pow(2, 10 * t - 10));
export const easeOutExpo = (t) => (t === 1 ? 1 : 1 - pow(2, -10 * t));
export const easeInOutExpo = (t) => {
    if (t === 0)
        return 0;
    if (t === 1)
        return 1;
    return t < 0.5 ? pow(2, 20 * t - 10) / 2 : (2 - pow(2, -20 * t + 10)) / 2;
};
export const easeInCirc = (t) => 1 - sqrt(1 - pow(t, 2));
export const easeOutCirc = (t) => sqrt(1 - pow(t - 1, 2));
export const easeInOutCirc = (t) => t < 0.5
    ? (1 - sqrt(1 - pow(2 * t, 2))) / 2
    : (sqrt(1 - pow(-2 * t + 2, 2)) + 1) / 2;
const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;
const c4 = (2 * PI) / 3;
const c5 = (2 * PI) / 4.5;
export const easeInBack = (t) => c3 * t * t * t - c1 * t * t;
export const easeOutBack = (t) => 1 + c3 * pow(t - 1, 3) + c1 * pow(t - 1, 2);
export const easeInOutBack = (t) => t < 0.5
    ? (pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
    : (pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
export const easeInElastic = (t) => {
    if (t === 0)
        return 0;
    if (t === 1)
        return 1;
    return -pow(2, 10 * t - 10) * sin((t * 10 - 10.75) * c4);
};
export const easeOutElastic = (t) => {
    if (t === 0)
        return 0;
    if (t === 1)
        return 1;
    return pow(2, -10 * t) * sin((t * 10 - 0.75) * c4) + 1;
};
export const easeInOutElastic = (t) => {
    if (t === 0)
        return 0;
    if (t === 1)
        return 1;
    return t < 0.5
        ? -(pow(2, 20 * t - 10) * sin((20 * t - 11.125) * c5)) / 2
        : (pow(2, -20 * t + 10) * sin((20 * t - 11.125) * c5)) / 2 + 1;
};
export const easeOutBounce = (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1)
        return n1 * t * t;
    if (t < 2 / d1)
        return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1)
        return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
};
export const easeInBounce = (t) => 1 - easeOutBounce(1 - t);
export const easeInOutBounce = (t) => t < 0.5
    ? (1 - easeOutBounce(1 - 2 * t)) / 2
    : (1 + easeOutBounce(2 * t - 1)) / 2;
export const Easings = {
    linear,
    easeInQuad,
    easeOutQuad,
    easeInOutQuad,
    easeInCubic,
    easeOutCubic,
    easeInOutCubic,
    easeInQuart,
    easeOutQuart,
    easeInOutQuart,
    easeInQuint,
    easeOutQuint,
    easeInOutQuint,
    easeInSine,
    easeOutSine,
    easeInOutSine,
    easeInExpo,
    easeOutExpo,
    easeInOutExpo,
    easeInCirc,
    easeOutCirc,
    easeInOutCirc,
    easeInBack,
    easeOutBack,
    easeInOutBack,
    easeInElastic,
    easeOutElastic,
    easeInOutElastic,
    easeInBounce,
    easeOutBounce,
    easeInOutBounce,
};
export function cubicBezier(x1, y1, x2, y2) {
    const NEWTON_ITERATIONS = 4;
    const NEWTON_MIN_SLOPE = 0.001;
    const SUBDIVISION_PRECISION = 1e-7;
    const SUBDIVISION_MAX_ITERATIONS = 10;
    const a = (a1, a2) => 1 - 3 * a2 + 3 * a1;
    const b = (a1, a2) => 3 * a2 - 6 * a1;
    const c = (a1) => 3 * a1;
    const calc = (t, a1, a2) => ((a(a1, a2) * t + b(a1, a2)) * t + c(a1)) * t;
    const slope = (t, a1, a2) => 3 * a(a1, a2) * t * t + 2 * b(a1, a2) * t + c(a1);
    function getT(x) {
        let t = x;
        for (let i = 0; i < NEWTON_ITERATIONS; i++) {
            const s = slope(t, x1, x2);
            if (s === 0)
                return t;
            const cx = calc(t, x1, x2) - x;
            t -= cx / s;
        }
        let lo = 0;
        let hi = 1;
        let cur = x;
        for (let i = 0; i < SUBDIVISION_MAX_ITERATIONS; i++) {
            const cx = calc(cur, x1, x2) - x;
            if (Math.abs(cx) < SUBDIVISION_PRECISION)
                return cur;
            if (cx > 0)
                hi = cur;
            else
                lo = cur;
            cur = (lo + hi) / 2;
        }
        return cur;
    }
    return (t) => {
        if (t <= 0)
            return 0;
        if (t >= 1)
            return 1;
        if (Math.abs(slope(getT(t), x1, x2)) < NEWTON_MIN_SLOPE)
            return calc(t, y1, y2);
        return calc(getT(t), y1, y2);
    };
}
export function steps(count, position = "end") {
    return (t) => {
        if (t <= 0)
            return 0;
        if (t >= 1)
            return 1;
        const k = position === "start" ? Math.ceil(t * count) : Math.floor(t * count);
        return k / count;
    };
}
