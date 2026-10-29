import { DEFAULT_TEXT_INSETS, FALLBACK_FONT_SIZE, isVerticalStack, paragraphFallbackFontSize, stackedColumnsLtr, vertRotateDeg } from "./text-shared.js";
import { mapVisualAlignWithAnchorCtr, wrapParagraphIntoLines } from "./text-layout.js";
import { buildStackedGlyphs, wrapGlyphsIntoColumns } from "./text-stacked.js";
let measureCtx;
function fallbackMeasureCtx() {
    let font = "16px sans-serif";
    return {
        get font() {
            return font;
        },
        set font(v) {
            font = v;
        },
        measureText(text) {
            const fs = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1]) || 16;
            let w = 0;
            for (const ch of Array.from(text)) {
                w += ch === " " || ch === "\t" ? fs * 0.3 : fs * 0.6;
            }
            return { width: w };
        },
    };
}
function getMeasureCtx() {
    if (measureCtx !== undefined)
        return measureCtx;
    if (typeof document === "undefined") {
        measureCtx = fallbackMeasureCtx();
        return measureCtx;
    }
    const c = document.createElement("canvas");
    measureCtx = c.getContext("2d") ?? fallbackMeasureCtx();
    return measureCtx;
}
function rotatePoint(x, y, cx, cy, deg) {
    if (!deg)
        return { x, y };
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = x - cx;
    const dy = y - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}
/**
 * 按与渲染层相同的换行 / 对齐 / 边距，命中文字框内某个 run。
 * 竖排堆叠走列布局；`vert`/`vert270`/`bodyRot` 先把点逆旋转到布局坐标系。
 */
export function hitTestTextRunAt(shape, x, y) {
    if (shape.kind !== "text")
        return undefined;
    if (isVerticalStack(shape.vert)) {
        return hitTestStackedRunAt(shape, x, y);
    }
    const ctx = getMeasureCtx();
    if (!ctx)
        return undefined;
    const b = shape.bbox;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const rot = (shape.bodyRot ?? 0) + vertRotateDeg(shape.vert);
    const p = rotatePoint(x, y, cx, cy, -rot);
    const ins = shape.insets ?? DEFAULT_TEXT_INSETS;
    const swap = vertRotateDeg(shape.vert) !== 0;
    const baseW = Math.max(1, b.w - ins.l - ins.r);
    const baseH = Math.max(1, b.h - ins.t - ins.b);
    const innerW = swap ? baseH : baseW;
    const innerH = swap ? baseW : baseH;
    const innerX = swap ? b.x + b.w / 2 - innerW / 2 : b.x + ins.l;
    const innerY = swap ? b.y + b.h / 2 - innerH / 2 : b.y + ins.t;
    return hitTestHorizontalAt(shape, p.x, p.y, innerX, innerY, innerW, innerH, ctx);
}
function hitTestHorizontalAt(shape, x, y, innerX, innerY, innerW, innerH, ctx) {
    const paras = shape.paragraphs ?? [];
    const numCol = Math.max(1, Math.floor(shape.numCol ?? 1));
    const spcCol = Math.max(0, shape.spcCol ?? 0);
    const colW = numCol > 1 ? Math.max(0, (innerW - spcCol * (numCol - 1)) / numCol) : innerW;
    const layouts = paras.map((p) => layoutPara(shape, p, colW, ctx));
    const cols = numCol > 1 ? distributeParaCols(layouts, innerH, numCol) : [layouts.map((_, i) => i)];
    const rtlCol = !!shape.rtlCol;
    const respectFirstLast = shape.spcFirstLastPara !== false;
    const lastIdx = layouts.length - 1;
    const effBefore = (k) => (!respectFirstLast && k === 0 ? 0 : layouts[k].before);
    const effAfter = (k) => (!respectFirstLast && k === lastIdx ? 0 : layouts[k].after);
    const vertOverflow = shape.vertOverflow ?? "overflow";
    const clampMiddle = (space) => Math.max(0, space);
    const clampBottom = (space) => (vertOverflow === "overflow" ? space : Math.max(0, space));
    for (let ci = 0; ci < cols.length; ci++) {
        const visualCol = rtlCol ? cols.length - 1 - ci : ci;
        const colX = innerX + visualCol * (colW + spcCol);
        if (x < colX - 2 || x > colX + colW + 2)
            continue;
        const colParas = cols[ci];
        const totalH = colParas.reduce((acc, k) => acc + effBefore(k) + layouts[k].totalH + effAfter(k), 0);
        let yCursor = innerY;
        if (shape.vAlign === "middle")
            yCursor = innerY + clampMiddle((innerH - totalH) / 2);
        else if (shape.vAlign === "bottom")
            yCursor = innerY + clampBottom(innerH - totalH);
        for (const k of colParas) {
            const pl = layouts[k];
            const yStart = yCursor + effBefore(k);
            const hit = hitPara(pl, colX, colW, yStart, x, y);
            if (hit)
                return hit;
            yCursor += effBefore(k) + pl.totalH + effAfter(k);
        }
    }
    return undefined;
}
function distributeParaCols(layouts, innerH, numCol) {
    const cols = Array.from({ length: numCol }, () => []);
    const heights = new Array(numCol).fill(0);
    let curCol = 0;
    for (let i = 0; i < layouts.length; i++) {
        const l = layouts[i];
        const h = l.before + l.totalH + l.after;
        if (curCol < numCol - 1 && heights[curCol] > 0 && heights[curCol] + h > innerH) {
            curCol += 1;
        }
        cols[curCol].push(i);
        heights[curCol] += h;
    }
    return cols;
}
function hitTestStackedRunAt(s, x, y) {
    const vert = s.vert;
    const b = s.bbox;
    const ins = s.insets ?? DEFAULT_TEXT_INSETS;
    const innerX = b.x + ins.l;
    const innerY = b.y + ins.t;
    const innerW = Math.max(1, b.w - ins.l - ins.r);
    const innerH = Math.max(1, b.h - ins.t - ins.b);
    const ltrColumns = stackedColumnsLtr(vert, s.rtlCol);
    const spcCol = Math.max(0, s.spcCol ?? 0);
    const allowVertOverflow = (s.vertOverflow ?? "overflow") === "overflow";
    const clampMiddle = (sp) => Math.max(0, sp);
    const clampEnd = (sp) => (allowVertOverflow ? sp : Math.max(0, sp));
    const paraColumns = [];
    for (const p of s.paragraphs ?? []) {
        const glyphs = buildStackedGlyphs(p, undefined, vert);
        if (glyphs.length === 0) {
            const fs = p.runs.find((r) => r.fontSize)?.fontSize ?? FALLBACK_FONT_SIZE;
            paraColumns.push({ paragraph: p, glyphs: [], width: fs, isFirstColOfPara: true });
            continue;
        }
        const wrapped = wrapGlyphsIntoColumns(glyphs, innerH);
        for (let wi = 0; wi < wrapped.length; wi++) {
            const colGlyphs = wrapped[wi];
            const colW = colGlyphs.reduce((m, g) => Math.max(m, g.fontSize), 0);
            paraColumns.push({
                paragraph: p,
                glyphs: colGlyphs,
                width: colW,
                isFirstColOfPara: wi === 0,
            });
        }
    }
    let cursorX = ltrColumns ? innerX : innerX + innerW;
    for (const col of paraColumns) {
        if (!ltrColumns)
            cursorX -= col.width;
        const colLeft = cursorX;
        const colRight = cursorX + col.width;
        const glyphs = col.glyphs;
        const totalH = glyphs.reduce((acc, g) => acc + g.stepY, 0);
        const space = innerH - totalH;
        let yCursor = innerY;
        let extraStep = 0;
        const pAlign = col.paragraph.align;
        if (pAlign === "middle")
            yCursor = innerY + clampMiddle(space / 2);
        else if (pAlign === "end")
            yCursor = innerY + clampEnd(space);
        else if (pAlign === "justify" && glyphs.length > 1 && space > 0) {
            extraStep = space / (glyphs.length - 1);
        }
        else {
            if (s.vAlign === "middle")
                yCursor = innerY + clampMiddle(space / 2);
            else if (s.vAlign === "bottom")
                yCursor = innerY + clampEnd(space);
        }
        if (col.isFirstColOfPara && glyphs.length > 0 && col.paragraph.bullet && col.paragraph.bullet.kind !== "none") {
            yCursor += glyphs[0].stepY;
        }
        for (let gi = 0; gi < glyphs.length; gi++) {
            const g = glyphs[gi];
            const y1 = yCursor;
            const y2 = yCursor + g.stepY + (gi < glyphs.length - 1 ? extraStep : 0);
            if (x >= colLeft && x <= colRight && y >= y1 && y <= y2)
                return g.run;
            yCursor = y2;
        }
        if (ltrColumns)
            cursorX += col.width + spcCol;
        else
            cursorX -= spcCol;
    }
    return undefined;
}
function layoutPara(s, p, maxWidth, ctx) {
    const fallbackFs = paragraphFallbackFontSize(p);
    const rtl = !!p.rtl;
    const align = mapVisualAlignWithAnchorCtr(s, p);
    const marL = (rtl ? p.marginRight : p.marginLeft) ?? 0;
    const indent = p.indent ?? 0;
    const hasBullet = !!p.bullet && p.bullet.kind !== "none";
    const firstLineIndent = hasBullet ? 0 : Math.max(0, indent);
    const textAreaW = Math.max(0, maxWidth - marL);
    const firstLineW = Math.max(0, textAreaW - firstLineIndent);
    const lines = wrapParagraphIntoLines(p, textAreaW, fallbackFs, ctx, firstLineW, s.wrap === false, undefined, s.compatLnSpc);
    const totalH = lines.reduce((acc, l) => acc + l.height, 0);
    return {
        lines,
        totalH,
        before: p.spaceBeforePx ?? 0,
        after: p.spaceAfterPx ?? 0,
        rtl,
        align,
        marL,
        firstLineIndent,
    };
}
function hitPara(pl, innerX, innerW, yStart, x, y) {
    const { rtl, align, marL, lines } = pl;
    const textLeft = rtl ? innerX : innerX + marL;
    const textRight = rtl ? innerX + innerW - marL : innerX + innerW;
    let yLine = yStart;
    for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        const y1 = yLine;
        const y2 = yLine + line.height;
        if (y >= y1 && y <= y2) {
            let lineLeft = textLeft;
            let lineRight = textRight;
            if (li === 0 && pl.firstLineIndent > 0) {
                if (rtl)
                    lineRight = textRight - pl.firstLineIndent;
                else
                    lineLeft = textLeft + pl.firstLineIndent;
            }
            const lineAreaW = Math.max(0, lineRight - lineLeft);
            const alignW = Math.max(0, line.width - line.hang);
            let x0 = lineLeft;
            if (align === "middle")
                x0 = lineLeft + (lineAreaW - alignW) / 2;
            else if (align === "end")
                x0 = lineRight - alignW;
            if (rtl) {
                let xr = lineRight;
                for (let i = line.segments.length - 1; i >= 0; i--) {
                    const seg = line.segments[i];
                    const x1 = xr - seg.width;
                    if (x >= x1 && x <= xr)
                        return seg.run;
                    xr = x1;
                }
            }
            else {
                let xl = x0;
                for (const seg of line.segments) {
                    const x1 = xl + seg.width;
                    if (x >= xl && x <= x1)
                        return seg.run;
                    xl = x1;
                }
            }
            // 点在行高内但落在空白：取最近 segment 的 run（仍可能是链接）。
            if (line.segments.length === 1)
                return line.segments[0].run;
        }
        yLine += line.height;
    }
    return undefined;
}
export function runLinkAt(shape, x, y, slot) {
    const run = hitTestTextRunAt(shape, x, y);
    return run?.[slot];
}
