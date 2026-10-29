// ECMA-376 §21.1.2.1.1 bodyPr/normAutofit — 运行时 autofit 重算。
//
// parser 在解析期把文件里 baked 的 fontScale/lnSpcReduction 乘进 run.fontSize /
// paragraph 行距（见 parser/inherit.ts:applyAutoFit）。但编辑器里继续输入文字后
// 没有任何环节重算缩放 → 文字直接溢出文本框，而 PowerPoint 会继续缩小字号。
//
// 这里在**渲染期**做等价重算：normAutofit 的 text shape 若排版总高超出 inner box，
// 迭代逼近一个额外缩放比（下限 0.25，对齐 PowerPoint 的 25% 下限），返回一个
// fontSize / 行距 / 段距等比缩小的派生 shape 供本帧渲染 —— **不改数据模型**，
// 导出仍写原字号 + 原 fontScale（PowerPoint 打开后按自身规则重算，行为一致）。
//
// 稳定性防御：解析期 baked 结果与我们的文本测量存在字体级差异，未编辑的文件可能
// "轻微溢出"。为避免打开旧文件就整体变小字（视觉基线漂移），仅当溢出超过 5% 时
// 才启用重算；5% 以内视为测量误差按原样渲染（顶多贴边）。
import type { TextParagraph, TextRun, TextShape } from "@ppt/core";
import { FALLBACK_FONT_SIZE } from "./text-shared";

const MIN_SCALE = 0.25;
const OVERFLOW_TOLERANCE = 1.05;

export function scaleTextShapeForAutofit(s: TextShape, scale: number): TextShape {
  const scaleRun = (r: TextRun): TextRun => ({ ...r, fontSize: (r.fontSize ?? FALLBACK_FONT_SIZE) * scale });
  const scalePara = (p: TextParagraph): TextParagraph => ({
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
export function autofitTextShape(
  s: TextShape,
  innerH: number,
  measureTotalH: (shape: TextShape) => number,
): TextShape {
  if (s.autoFit?.kind !== "normAutofit") return s;
  if (innerH <= 0 || s.paragraphs.length === 0) return s;
  let baseH: number;
  try {
    baseH = measureTotalH(s);
  } catch {
    return s;
  }
  if (!Number.isFinite(baseH) || baseH <= innerH * OVERFLOW_TOLERANCE) return s;
  // 缩字号后 wrap 行数会变（通常变少），单次比例外推不够准 —— 迭代 3 轮逼近。
  let scale = Math.max(MIN_SCALE, innerH / baseH);
  let candidate = scaleTextShapeForAutofit(s, scale);
  for (let i = 0; i < 3; i++) {
    const h = measureTotalH(candidate);
    if (h <= innerH || scale <= MIN_SCALE) break;
    scale = Math.max(MIN_SCALE, scale * (innerH / h));
    candidate = scaleTextShapeForAutofit(s, scale);
  }
  return candidate;
}
