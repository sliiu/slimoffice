"use strict";
// 竖排堆叠（eaVert / wordArtVert / mongolianVert）共享类型与列拆分工具。
// svg-backend 与 canvas-backend 同时依赖：保证两个后端的列拆分 / 列宽计算完全一致。
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildStackedGlyphs = buildStackedGlyphs;
exports.wrapGlyphsIntoColumns = wrapGlyphsIntoColumns;
const core_1 = require("@sliiu/present-core");
const text_layout_1 = require("./text-layout");
const text_shared_1 = require("./text-shared");
// 半 / 全 / 零宽空白 + \t：作为竖排"列拆分点"，并在拆列后丢弃位于新列首部的此类空白。
function isStackBreakWs(ch) {
    return ch === " " || ch === "\t" || ch === "\u3000" || ch === "\u200B";
}
// 从段构建字符级 glyph：letterSpacing 加进 stepY；upright 标记是否直立
// （仅 eaVert 下非 CJK 字符旋转 90° 侧躺）。
function buildStackedGlyphs(p, para, vert, fieldCtx) {
    const baseLh = (0, text_shared_1.lineHeightFactor)(p);
    const glyphs = [];
    for (const run of p.runs) {
        const runText = fieldCtx ? (0, core_1.runDisplayText)(run, fieldCtx) : run.text;
        const fs = (para?.fontSize ?? run.fontSize) ?? text_shared_1.FALLBACK_FONT_SIZE;
        // ECMA-376 §21.1.2.3.10 rPr@spc — 竖排时 letterSpacing 作为字符间垂直额外步进。
        const ls = run.letterSpacing ?? 0;
        const stepY = (p.lineHeightPx ?? fs * baseLh) + ls;
        for (const ch of Array.from(runText)) {
            const cp = ch.codePointAt(0);
            const upright = vert === "wordArtVert" || vert === "wordArtVertRtl" || vert === "mongolianVert"
                ? true
                : (0, text_layout_1.isEastAsianChar)(cp); // eaVert：仅 CJK 直立
            glyphs.push({ ch, run, fontSize: fs, stepY, upright });
        }
    }
    return glyphs;
}
// 把段内字符流按列高 maxH 拆成多列：
// - 优先在最近一个空白字符处拆（空白随后丢弃，类似横排首字空白处理）；
// - 若当前列还没有空白可拆，则在当前位置硬拆（避免单字单列死锁）；
// - 新列首部一律去除空白。
// 例：para 文本 "abc def" 高度 maxH 容下 5 个字符 → 拆为 ["abc", "def"]（首列尾空格被吃掉）。
function wrapGlyphsIntoColumns(glyphs, maxH) {
    const columns = [];
    let curCol = [];
    let curH = 0;
    let lastBreakBefore = -1; // curCol 内"最近的空白"索引；在该位置拆 → 空白进下一列后被丢弃
    for (const g of glyphs) {
        const ws = isStackBreakWs(g.ch);
        // 1) 列首抑制空白：当前列空 + 当前字符是空白 → 丢弃
        if (curCol.length === 0 && ws)
            continue;
        // 2) 即将溢出：先尝试在 lastBreakBefore 拆，否则硬拆封口
        if (curCol.length > 0 && curH + g.stepY > maxH) {
            if (lastBreakBefore > 0) {
                const left = curCol.slice(0, lastBreakBefore);
                let right = curCol.slice(lastBreakBefore);
                columns.push(left);
                let i = 0;
                while (i < right.length && isStackBreakWs(right[i].ch))
                    i++;
                right = right.slice(i);
                curCol = right;
                curH = curCol.reduce((acc, gg) => acc + gg.stepY, 0);
                lastBreakBefore = -1;
            }
            else {
                columns.push(curCol);
                curCol = [];
                curH = 0;
                lastBreakBefore = -1;
                if (ws)
                    continue; // 新列首部继续抑制
            }
        }
        if (ws && curCol.length > 0) {
            lastBreakBefore = curCol.length; // 标记空白位置（"空白前可拆"）
        }
        curCol.push(g);
        curH += g.stepY;
    }
    if (curCol.length > 0)
        columns.push(curCol);
    return columns;
}
