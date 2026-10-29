"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FALLBACK_FONT_SIZE = exports.DEFAULT_LINE_HEIGHT_FACTOR = exports.DEFAULT_TEXT_INSETS = void 0;
exports.vertRotateDeg = vertRotateDeg;
exports.isVerticalStack = isVerticalStack;
exports.stackedColumnsLtr = stackedColumnsLtr;
exports.textTotalRotationDeg = textTotalRotationDeg;
exports.paragraphFallbackFontSize = paragraphFallbackFontSize;
exports.lineHeightFactor = lineHeightFactor;
exports.paragraphLineHeightPx = paragraphLineHeightPx;
exports.newBulletNumState = newBulletNumState;
exports.formatBulletNumber = formatBulletNumber;
exports.bulletFontSize = bulletFontSize;
exports.advanceBulletLabel = advanceBulletLabel;
exports.hexWithAlpha = hexWithAlpha;
exports.textEffectsCssFilter = textEffectsCssFilter;
exports.pickRunEffectsCssFilter = pickRunEffectsCssFilter;
/**
 * §21.1.2.1.1 bodyPr@lIns/tIns/rIns/bIns 的 OOXML 缺省值：
 * 左右 91440 EMU = 7.2pt ≈ 9.6px，上下 45720 EMU = 3.6pt ≈ 4.8px。
 */
exports.DEFAULT_TEXT_INSETS = { l: 9.6, t: 4.8, r: 9.6, b: 4.8 };
/** 未写 lnSpc 时的行框系数。§21.1.2.2.5 只说由字号决定，这里取 1.2。 */
exports.DEFAULT_LINE_HEIGHT_FACTOR = 1.2;
/** 继承链都没写 sz 时的绘制字号（px）。schema 不给 sz 缺省值；Office 用 18pt。 */
exports.FALLBACK_FONT_SIZE = (1800 / 100) * (96 / 72);
/**
 * §21.1.2.1.1 bodyPr@vert — 整框旋转角度。
 * 仅 vert/vert270 走"外层 rotate"路径；其余竖排模式靠自定义竖排 layout。
 */
function vertRotateDeg(v) {
    if (v === "vert")
        return 90;
    if (v === "vert270")
        return -90;
    return 0;
}
function isVerticalStack(v) {
    return v === "wordArtVert" || v === "wordArtVertRtl" || v === "eaVert" || v === "mongolianVert";
}
/**
 * 竖排堆叠的列推进方向。
 * wordArtVertRtl = 从右到左（WPS「行顺序：从右到左」）。
 * wordArtVert = 从左到右（WPS「行顺序：从左到右」）。rtlCol 对这两种 vert 无效。
 */
function stackedColumnsLtr(vert, rtlCol) {
    if (vert === "wordArtVertRtl")
        return false;
    if (vert === "wordArtVert")
        return true;
    if (vert === "mongolianVert")
        return !rtlCol;
    return !!rtlCol;
}
/**
 * §21.1.2.1.1 bodyPr@rot / @vert / @upright 叠加后，文字内容相对 slide 的总旋转角。
 * 渲染端把 shape 自身的 rotation 加在 scene node 上、把 bodyRot+vert 加在文本组上，
 * upright 再抵消掉 shape 的 rotation —— 三者之和就是文字最终看起来的旋转角度。
 */
function textTotalRotationDeg(s) {
    const shapeRot = s.transform?.rotation ?? 0;
    return (shapeRot + (s.bodyRot ?? 0) + vertRotateDeg(s.vert) + (s.upright ? -shapeRot : 0));
}
/** 段落缺省字号：取段内最大显式字号，全缺省时用 FALLBACK_FONT_SIZE。 */
function paragraphFallbackFontSize(p) {
    const sizes = p.runs.map((r) => r.fontSize ?? 0).filter((n) => n > 0);
    return sizes.length ? Math.max(...sizes) : exports.FALLBACK_FONT_SIZE;
}
/**
 * §21.1.2.2.5 spcPct 是最大字号的百分比：120000 = 1.2 × 字号，不再乘第二层系数。
 * 未写 lnSpc 时用 DEFAULT_LINE_HEIGHT_FACTOR；compatLnSpc 时按 1 × 字号。
 */
function lineHeightFactor(p, compatLnSpc) {
    if (p.lineHeight != null)
        return p.lineHeight;
    return compatLnSpc ? 1 : exports.DEFAULT_LINE_HEIGHT_FACTOR;
}
/** 段落行高（px）：显式 lineHeightPx 优先，否则按 §21.1.2.2.5 的百分比系数算。 */
function paragraphLineHeightPx(p, fallbackFs, compatLnSpc) {
    if (typeof p.lineHeightPx === "number")
        return p.lineHeightPx;
    const fs = fallbackFs ?? paragraphFallbackFontSize(p);
    return fs * lineHeightFactor(p, compatLnSpc);
}
function newBulletNumState() {
    return { lastLevel: -1, lastType: "", count: 0 };
}
const NUM_LATIN_LC = "abcdefghijklmnopqrstuvwxyz";
const NUM_LATIN_UC = NUM_LATIN_LC.toUpperCase();
const NUM_ROMAN = [
    ["", "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix"],
    ["", "x", "xx", "xxx", "xl", "l", "lx", "lxx", "lxxx", "xc"],
    ["", "c", "cc", "ccc", "cd", "d", "dc", "dcc", "dccc", "cm"],
    ["", "m", "mm", "mmm"],
];
/** §21.1.2.4.1 buAutoNum@type — 把序号按 ST_TextAutonumberScheme 格式化。 */
function formatBulletNumber(n, type) {
    const idx = Math.max(1, n);
    const base = (() => {
        if (type.startsWith("alphaLc")) {
            const k = (idx - 1) % NUM_LATIN_LC.length;
            const reps = Math.max(1, Math.floor((idx - 1) / NUM_LATIN_LC.length) + 1);
            return NUM_LATIN_LC[k].repeat(reps);
        }
        if (type.startsWith("alphaUc")) {
            const k = (idx - 1) % NUM_LATIN_UC.length;
            const reps = Math.max(1, Math.floor((idx - 1) / NUM_LATIN_UC.length) + 1);
            return NUM_LATIN_UC[k].repeat(reps);
        }
        if (type.startsWith("romanLc") || type.startsWith("romanUc")) {
            let v = Math.min(idx, 3999);
            const out = [];
            let pos = 0;
            while (v > 0 && pos < NUM_ROMAN.length) {
                const digit = v % 10;
                out.unshift(NUM_ROMAN[pos]?.[digit] ?? "");
                v = Math.floor(v / 10);
                pos += 1;
            }
            const s = out.join("");
            return type.startsWith("romanUc") ? s.toUpperCase() : s;
        }
        return String(idx);
    })();
    if (type.endsWith("Period"))
        return `${base}.`;
    if (type.endsWith("ParenR"))
        return `${base})`;
    if (type.endsWith("ParenBoth"))
        return `(${base})`;
    if (type.endsWith("Plain"))
        return base;
    return `${base}.`;
}
/**
 * §21.1.2.4.5 buSzPts 优先于 §21.1.2.4.4 buSzPct；两者都缺省时跟随 run 字号（buSzTx）。
 */
function bulletFontSize(bullet, runFs) {
    const sizePts = "sizePts" in bullet ? bullet.sizePts : undefined;
    const sizePct = "sizePct" in bullet ? bullet.sizePct : undefined;
    if (sizePts !== undefined)
        return sizePts * (96 / 72);
    if (sizePct)
        return runFs * sizePct;
    return runFs;
}
/**
 * 推进自动编号状态机，返回该段 bullet 的显示文本。
 * none / picture 返回 null（picture bullet 由各消费者自行绘制图片）。
 *
 * 编号连续性规则：连续的同 level buAutoNum 段落累加；一旦遇到 buChar / buNone /
 * level 变化就重置，与 PowerPoint 表现一致。
 */
function advanceBulletLabel(p, state) {
    const bullet = p.bullet;
    const lvl = p.level ?? 0;
    if (!bullet || bullet.kind === "none") {
        if (state.lastType === "number") {
            state.lastType = "";
            state.count = 0;
        }
        state.lastLevel = lvl;
        return null;
    }
    if (bullet.kind === "char") {
        if (state.lastType === "number") {
            state.lastType = "";
            state.count = 0;
        }
        state.lastLevel = lvl;
        return bullet.char;
    }
    if (bullet.kind === "number") {
        if (state.lastType !== "number" || state.lastLevel !== lvl) {
            state.count = (bullet.startAt ?? 1) - 1;
            state.lastType = "number";
        }
        state.count += 1;
        state.lastLevel = lvl;
        return formatBulletNumber(state.count, bullet.numType);
    }
    state.lastLevel = lvl;
    return null;
}
// ============================================================================
// 颜色 / 效果
// ============================================================================
function hexWithAlpha(color, alpha) {
    if (alpha >= 1)
        return color;
    if (/^#([0-9a-f]{6})$/i.test(color)) {
        const a = Math.round(alpha * 255)
            .toString(16)
            .padStart(2, "0");
        return color + a;
    }
    return color;
}
/**
 * §21.1.2.3.9 rPr/effectLst → CSS `filter` 串（drop-shadow 链式叠加）。
 *
 * `scale` 用来把 slide 单位换算成目标坐标系的 px：SVG 里 filter 走 user-space
 * 会随 viewBox 自动缩放，所以后端传 1；HTML overlay（编辑器）按屏幕 px 绘制，
 * 必须传当前 stageScale，否则缩放后阴影 / 光晕的偏移和模糊半径会明显不对。
 *
 * inner shadow 与 reflection 不走这条 CSS 链：SVG 用 feComposite / 镜像 <use>，
 * Canvas 在 drawText 里单独画。这里若把 reflection 收成 drop-shadow，倒影会变成一团光。
 */
function textEffectsCssFilter(effects, scale = 1) {
    if (!effects || effects.length === 0)
        return undefined;
    const parts = [];
    for (const fx of effects) {
        if (fx.kind === "outer") {
            const c = hexWithAlpha(fx.color, fx.alpha);
            parts.push(`drop-shadow(${fx.dx * scale}px ${fx.dy * scale}px ${fx.blur * scale}px ${c})`);
        }
        else if (fx.kind === "glow") {
            const c = hexWithAlpha(fx.color, fx.alpha);
            const r = fx.radius * scale;
            parts.push(`drop-shadow(0 0 ${r}px ${c})`);
            parts.push(`drop-shadow(0 0 ${r}px ${c})`);
        }
        else if (fx.kind === "blur") {
            parts.push(`blur(${Math.max(0.3, fx.radius * scale)}px)`);
        }
    }
    return parts.length ? parts.join(" ") : undefined;
}
/** 取 paragraph 内首个声明 effects 的 run 的 CSS filter（paragraph 级近似）。 */
function pickRunEffectsCssFilter(runs, scale = 1) {
    for (const r of runs) {
        const f = textEffectsCssFilter(r.effects, scale);
        if (f)
            return f;
    }
    return undefined;
}
