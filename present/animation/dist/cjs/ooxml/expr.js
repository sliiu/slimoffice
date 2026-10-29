"use strict";
// ECMA-376 §19.5.6 anim 中 by/from/to 的字符串值与 §19.5.71 tav.fmla
// 共用 PowerPoint formula 表达式语法：
//   - 字面量数字 / 颜色 / 布尔
//   - 变量：#ppt_x / #ppt_y / #ppt_w / #ppt_h / #ppt_c / #ppt_r（# 前缀代表 base value）
//   - 不带 # 的同名标识符也兼容（旧版 PowerPoint 写法）
//   - 进度变量 $（tav.fmla 内 = tav.tm / 100000；其他场景默认 0）
//   - 常量 pi
//   - 函数：sin / cos / tan / asin / acos / atan / atan2 / abs / sqrt /
//           min / max / floor / ceil / round / pow / log / exp
//   - 算术：+ - * / ^ ( )，^ 是乘方
Object.defineProperty(exports, "__esModule", { value: true });
exports.pptVars = pptVars;
exports.evalArithmetic = evalArithmetic;
exports.evalExpr = evalExpr;
exports.evalNumberValue = evalNumberValue;
exports.evalBool = evalBool;
const stripQuotes = (s) => s.replace(/^['"]|['"]$/g, "");
function pptVars(env) {
    const sw = env.slideWidth || 1;
    const sh = env.slideHeight || 1;
    return {
        ppt_x: (env.bbox.x + env.bbox.w / 2) / sw,
        ppt_y: (env.bbox.y + env.bbox.h / 2) / sh,
        ppt_w: env.bbox.w / sw,
        ppt_h: env.bbox.h / sh,
        ...(env.extra ?? {}),
    };
}
// 把 PowerPoint formula 字符串替换成白名单算术式，再用递归下降求值。
// 不能用 new Function：分享页 CSP 只有 script nonce，没有 unsafe-eval。
// 求值抛错时若退回 0，decodePos 会把形状中心放到幻灯片原点，动画看起来挤在左上角。
// 替换顺序很重要：先 # 前缀、再 $，最后再处理裸标识符（变量 + 内置函数）。
const FN_MAP = {
    sin: "Math.sin",
    cos: "Math.cos",
    tan: "Math.tan",
    asin: "Math.asin",
    acos: "Math.acos",
    atan: "Math.atan",
    atan2: "Math.atan2",
    abs: "Math.abs",
    sqrt: "Math.sqrt",
    min: "Math.min",
    max: "Math.max",
    floor: "Math.floor",
    ceil: "Math.ceil",
    round: "Math.round",
    pow: "Math.pow",
    log: "Math.log",
    exp: "Math.exp",
};
const MATH_FNS = {
    "Math.sin": Math.sin,
    "Math.cos": Math.cos,
    "Math.tan": Math.tan,
    "Math.asin": Math.asin,
    "Math.acos": Math.acos,
    "Math.atan": Math.atan,
    "Math.atan2": Math.atan2,
    "Math.abs": Math.abs,
    "Math.sqrt": Math.sqrt,
    "Math.min": Math.min,
    "Math.max": Math.max,
    "Math.floor": Math.floor,
    "Math.ceil": Math.ceil,
    "Math.round": Math.round,
    "Math.pow": Math.pow,
    "Math.log": Math.log,
    "Math.exp": Math.exp,
};
const isSpace = (c) => c === " " || c === "\t" || c === "\n" || c === "\r";
const isDigit = (c) => c !== undefined && c >= "0" && c <= "9";
const isIdent = (c) => c !== undefined && ((c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || c === "_" || c === ".");
// 求值已经过变量替换的算术式。只接受数字、四则、括号、逗号和白名单 Math.* 调用。
function evalArithmetic(input) {
    let i = 0;
    const skip = () => {
        while (isSpace(input[i]))
            i += 1;
    };
    const parseExpr = () => {
        let left = parseTerm();
        for (;;) {
            skip();
            const op = input[i];
            if (op !== "+" && op !== "-")
                break;
            i += 1;
            const right = parseTerm();
            left = op === "+" ? left + right : left - right;
        }
        return left;
    };
    const parseTerm = () => {
        let left = parsePow();
        for (;;) {
            skip();
            const op = input[i];
            if (op !== "*" && op !== "/")
                break;
            i += 1;
            const right = parsePow();
            left = op === "*" ? left * right : left / right;
        }
        return left;
    };
    // PowerPoint formula 的 ^ 是乘方，右结合，优先级高于 * /。
    const parsePow = () => {
        const left = parseUnary();
        skip();
        if (input[i] !== "^")
            return left;
        i += 1;
        return Math.pow(left, parsePow());
    };
    const parseUnary = () => {
        skip();
        if (input[i] === "-") {
            i += 1;
            return -parseUnary();
        }
        if (input[i] === "+") {
            i += 1;
            return parseUnary();
        }
        return parsePrimary();
    };
    const parsePrimary = () => {
        skip();
        const c = input[i];
        if (c === "(") {
            i += 1;
            const v = parseExpr();
            skip();
            if (input[i] !== ")")
                throw new Error("expected )");
            i += 1;
            return v;
        }
        if (isDigit(c) || c === ".")
            return parseNumber();
        if (c !== undefined && ((c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || c === "_"))
            return parseCall();
        throw new Error("unexpected");
    };
    const parseNumber = () => {
        const start = i;
        if (input[i] === ".")
            i += 1;
        while (isDigit(input[i]))
            i += 1;
        if (input[start] !== "." && input[i] === ".") {
            i += 1;
            while (isDigit(input[i]))
                i += 1;
        }
        if (input[i] === "e" || input[i] === "E") {
            const exp = i;
            i += 1;
            if (input[i] === "+" || input[i] === "-")
                i += 1;
            if (!isDigit(input[i])) {
                i = exp;
            }
            else {
                while (isDigit(input[i]))
                    i += 1;
            }
        }
        if (i === start || (input[start] === "." && i === start + 1))
            throw new Error("bad number");
        const n = Number(input.slice(start, i));
        if (!Number.isFinite(n))
            throw new Error("bad number");
        return n;
    };
    const parseCall = () => {
        const start = i;
        while (isIdent(input[i]))
            i += 1;
        const name = input.slice(start, i);
        skip();
        if (input[i] !== "(")
            throw new Error("expected call");
        i += 1;
        const args = [];
        skip();
        if (input[i] !== ")") {
            args.push(parseExpr());
            for (;;) {
                skip();
                if (input[i] !== ",")
                    break;
                i += 1;
                args.push(parseExpr());
            }
        }
        skip();
        if (input[i] !== ")")
            throw new Error("expected )");
        i += 1;
        const fn = MATH_FNS[name];
        if (!fn)
            throw new Error("fn");
        return fn(...args);
    };
    const v = parseExpr();
    skip();
    if (i !== input.length)
        throw new Error("trailing");
    return v;
}
function evalExpr(raw, env) {
    if (raw === undefined || raw === null)
        return 0;
    if (typeof raw === "number")
        return Number.isFinite(raw) ? raw : 0;
    let s = stripQuotes(String(raw)).trim();
    if (!s)
        return 0;
    const vars = pptVars(env);
    // 1) "#ppt_xxx" 是 PowerPoint formula 显式 base value 引用。先替换，避免后面被
    //    标识符正则误吞 # 字符。
    s = s.replace(/#([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
        const v = vars[name];
        return Number.isFinite(v) ? `(${v})` : "0";
    });
    // 2) $ 代表 fmla 求值时刻的归一化进度（仅在 tav.fmla 等少量场景有意义）。
    const progress = env.extra?.["$"] ?? 0;
    s = s.replace(/\$/g, `(${progress})`);
    // 3) pi 常量。
    s = s.replace(/\bpi\b/gi, `(${Math.PI})`);
    // 4) 内置函数 + 裸变量；同时把未识别的标识符替换为 0，避免无意义引用导致 JS 错误。
    // 数字里的指数标记（1e-18、2.5E+3）不是标识符，留下给算术解析器。
    s = s.replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, (name, offset) => {
        if ((name === "e" || name === "E") && offset > 0 && /[\d.]/.test(s[offset - 1] ?? ""))
            return name;
        if (Object.prototype.hasOwnProperty.call(FN_MAP, name))
            return FN_MAP[name];
        if (Object.prototype.hasOwnProperty.call(vars, name)) {
            const v = vars[name];
            return Number.isFinite(v) ? `(${v})` : "0";
        }
        return "0";
    });
    try {
        const v = evalArithmetic(s);
        return Number.isFinite(v) ? v : 0;
    }
    catch {
        return 0;
    }
}
function evalNumberValue(raw) {
    if (raw === undefined)
        return undefined;
    const s = stripQuotes(String(raw)).trim();
    if (!s)
        return undefined;
    if (/pt$/i.test(s)) {
        const v = Number(s.replace(/pt$/i, ""));
        return Number.isFinite(v) ? v * (96 / 72) : undefined;
    }
    if (/px$/i.test(s)) {
        const v = Number(s.replace(/px$/i, ""));
        return Number.isFinite(v) ? v : undefined;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
}
function evalBool(raw) {
    if (raw === undefined)
        return false;
    const s = stripQuotes(String(raw)).trim().toLowerCase();
    return s === "true" || s === "1" || s === "visible" || s === "show";
}
