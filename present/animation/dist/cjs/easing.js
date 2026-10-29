"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Easings = exports.easeInOutBounce = exports.easeInBounce = exports.easeOutBounce = exports.easeInOutElastic = exports.easeOutElastic = exports.easeInElastic = exports.easeInOutBack = exports.easeOutBack = exports.easeInBack = exports.easeInOutCirc = exports.easeOutCirc = exports.easeInCirc = exports.easeInOutExpo = exports.easeOutExpo = exports.easeInExpo = exports.easeInOutSine = exports.easeOutSine = exports.easeInSine = exports.easeInOutQuint = exports.easeOutQuint = exports.easeInQuint = exports.easeInOutQuart = exports.easeOutQuart = exports.easeInQuart = exports.easeInOutCubic = exports.easeOutCubic = exports.easeInCubic = exports.easeInOutQuad = exports.easeOutQuad = exports.easeInQuad = exports.linear = void 0;
exports.cubicBezier = cubicBezier;
exports.steps = steps;
const pow = Math.pow;
const sqrt = Math.sqrt;
const sin = Math.sin;
const cos = Math.cos;
const PI = Math.PI;
const linear = (t) => t;
exports.linear = linear;
const easeInQuad = (t) => t * t;
exports.easeInQuad = easeInQuad;
const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
exports.easeOutQuad = easeOutQuad;
const easeInOutQuad = (t) => t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2;
exports.easeInOutQuad = easeInOutQuad;
const easeInCubic = (t) => t * t * t;
exports.easeInCubic = easeInCubic;
const easeOutCubic = (t) => 1 - pow(1 - t, 3);
exports.easeOutCubic = easeOutCubic;
const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2;
exports.easeInOutCubic = easeInOutCubic;
const easeInQuart = (t) => t * t * t * t;
exports.easeInQuart = easeInQuart;
const easeOutQuart = (t) => 1 - pow(1 - t, 4);
exports.easeOutQuart = easeOutQuart;
const easeInOutQuart = (t) => t < 0.5 ? 8 * t * t * t * t : 1 - pow(-2 * t + 2, 4) / 2;
exports.easeInOutQuart = easeInOutQuart;
const easeInQuint = (t) => t * t * t * t * t;
exports.easeInQuint = easeInQuint;
const easeOutQuint = (t) => 1 - pow(1 - t, 5);
exports.easeOutQuint = easeOutQuint;
const easeInOutQuint = (t) => t < 0.5 ? 16 * t * t * t * t * t : 1 - pow(-2 * t + 2, 5) / 2;
exports.easeInOutQuint = easeInOutQuint;
const easeInSine = (t) => 1 - cos((t * PI) / 2);
exports.easeInSine = easeInSine;
const easeOutSine = (t) => sin((t * PI) / 2);
exports.easeOutSine = easeOutSine;
const easeInOutSine = (t) => -(cos(PI * t) - 1) / 2;
exports.easeInOutSine = easeInOutSine;
const easeInExpo = (t) => (t === 0 ? 0 : pow(2, 10 * t - 10));
exports.easeInExpo = easeInExpo;
const easeOutExpo = (t) => (t === 1 ? 1 : 1 - pow(2, -10 * t));
exports.easeOutExpo = easeOutExpo;
const easeInOutExpo = (t) => {
    if (t === 0)
        return 0;
    if (t === 1)
        return 1;
    return t < 0.5 ? pow(2, 20 * t - 10) / 2 : (2 - pow(2, -20 * t + 10)) / 2;
};
exports.easeInOutExpo = easeInOutExpo;
const easeInCirc = (t) => 1 - sqrt(1 - pow(t, 2));
exports.easeInCirc = easeInCirc;
const easeOutCirc = (t) => sqrt(1 - pow(t - 1, 2));
exports.easeOutCirc = easeOutCirc;
const easeInOutCirc = (t) => t < 0.5
    ? (1 - sqrt(1 - pow(2 * t, 2))) / 2
    : (sqrt(1 - pow(-2 * t + 2, 2)) + 1) / 2;
exports.easeInOutCirc = easeInOutCirc;
const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;
const c4 = (2 * PI) / 3;
const c5 = (2 * PI) / 4.5;
const easeInBack = (t) => c3 * t * t * t - c1 * t * t;
exports.easeInBack = easeInBack;
const easeOutBack = (t) => 1 + c3 * pow(t - 1, 3) + c1 * pow(t - 1, 2);
exports.easeOutBack = easeOutBack;
const easeInOutBack = (t) => t < 0.5
    ? (pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
    : (pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
exports.easeInOutBack = easeInOutBack;
const easeInElastic = (t) => {
    if (t === 0)
        return 0;
    if (t === 1)
        return 1;
    return -pow(2, 10 * t - 10) * sin((t * 10 - 10.75) * c4);
};
exports.easeInElastic = easeInElastic;
const easeOutElastic = (t) => {
    if (t === 0)
        return 0;
    if (t === 1)
        return 1;
    return pow(2, -10 * t) * sin((t * 10 - 0.75) * c4) + 1;
};
exports.easeOutElastic = easeOutElastic;
const easeInOutElastic = (t) => {
    if (t === 0)
        return 0;
    if (t === 1)
        return 1;
    return t < 0.5
        ? -(pow(2, 20 * t - 10) * sin((20 * t - 11.125) * c5)) / 2
        : (pow(2, -20 * t + 10) * sin((20 * t - 11.125) * c5)) / 2 + 1;
};
exports.easeInOutElastic = easeInOutElastic;
const easeOutBounce = (t) => {
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
exports.easeOutBounce = easeOutBounce;
const easeInBounce = (t) => 1 - (0, exports.easeOutBounce)(1 - t);
exports.easeInBounce = easeInBounce;
const easeInOutBounce = (t) => t < 0.5
    ? (1 - (0, exports.easeOutBounce)(1 - 2 * t)) / 2
    : (1 + (0, exports.easeOutBounce)(2 * t - 1)) / 2;
exports.easeInOutBounce = easeInOutBounce;
exports.Easings = {
    linear: exports.linear,
    easeInQuad: exports.easeInQuad,
    easeOutQuad: exports.easeOutQuad,
    easeInOutQuad: exports.easeInOutQuad,
    easeInCubic: exports.easeInCubic,
    easeOutCubic: exports.easeOutCubic,
    easeInOutCubic: exports.easeInOutCubic,
    easeInQuart: exports.easeInQuart,
    easeOutQuart: exports.easeOutQuart,
    easeInOutQuart: exports.easeInOutQuart,
    easeInQuint: exports.easeInQuint,
    easeOutQuint: exports.easeOutQuint,
    easeInOutQuint: exports.easeInOutQuint,
    easeInSine: exports.easeInSine,
    easeOutSine: exports.easeOutSine,
    easeInOutSine: exports.easeInOutSine,
    easeInExpo: exports.easeInExpo,
    easeOutExpo: exports.easeOutExpo,
    easeInOutExpo: exports.easeInOutExpo,
    easeInCirc: exports.easeInCirc,
    easeOutCirc: exports.easeOutCirc,
    easeInOutCirc: exports.easeInOutCirc,
    easeInBack: exports.easeInBack,
    easeOutBack: exports.easeOutBack,
    easeInOutBack: exports.easeInOutBack,
    easeInElastic: exports.easeInElastic,
    easeOutElastic: exports.easeOutElastic,
    easeInOutElastic: exports.easeInOutElastic,
    easeInBounce: exports.easeInBounce,
    easeOutBounce: exports.easeOutBounce,
    easeInOutBounce: exports.easeInOutBounce,
};
function cubicBezier(x1, y1, x2, y2) {
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
function steps(count, position = "end") {
    return (t) => {
        if (t <= 0)
            return 0;
        if (t >= 1)
            return 1;
        const k = position === "start" ? Math.ceil(t * count) : Math.floor(t * count);
        return k / count;
    };
}
