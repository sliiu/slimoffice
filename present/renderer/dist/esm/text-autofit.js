import { FALLBACK_FONT_SIZE } from "./text-shared.js";
const MIN_SCALE = 0.25;
const OVERFLOW_TOLERANCE = 1.05;
export function scaleTextShapeForAutofit(s, scale) {
    const scaleRun = (r) => ({ ...r, fontSize: (r.fontSize ?? FALLBACK_FONT_SIZE) * scale });
    const scalePara = (p) => ({
        ...p,
        ...(p.lineHeightPx !== undefined ? { lineHeightPx: p.lineHeightPx * scale } : {}),
        ...(p.spaceBeforePx !== undefined ? { spaceBeforePx: p.spaceBeforePx * scale } : {}),
        ...(p.spaceAfterPx !== undefined ? { spaceAfterPx: p.spaceAfterPx * scale } : {}),
        runs: p.runs.map(scaleRun),
    });
    return { ...s, paragraphs: s.paragraphs.map(scalePara) };
}
/**
 * normAutofit 文本溢出时返回缩小后的派生 shape；不溢出（或非 normAutofit）原样返回。
 * measureTotalH 由调用方注入（svg / canvas 后端的段落排版逻辑不同但签名一致）。
 */
export function autofitTextShape(s, innerH, measureTotalH) {
    if (s.autoFit?.kind !== "normAutofit")
        return s;
    if (innerH <= 0 || s.paragraphs.length === 0)
        return s;
    let baseH;
    try {
        baseH = measureTotalH(s);
    }
    catch {
        return s;
    }
    if (!Number.isFinite(baseH) || baseH <= innerH * OVERFLOW_TOLERANCE)
        return s;
    // 缩字号后 wrap 行数会变（通常变少），单次比例外推不够准 —— 迭代 3 轮逼近。
    let scale = Math.max(MIN_SCALE, innerH / baseH);
    let candidate = scaleTextShapeForAutofit(s, scale);
    for (let i = 0; i < 3; i++) {
        const h = measureTotalH(candidate);
        if (h <= innerH || scale <= MIN_SCALE)
            break;
        scale = Math.max(MIN_SCALE, scale * (innerH / h));
        candidate = scaleTextShapeForAutofit(s, scale);
    }
    return candidate;
}
