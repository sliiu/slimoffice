// ECMA-376 §20.1.8.45 effectLst — shape 级效果链的渲染归一化。
//
// 数据来源：parser 把 spPr/effectLst（或 effectRef 解析结果）放进 `shape.effects`，
// 并把第一个 outer/inner shadow 冗余到 `shape.shadow`（兼容字段）。渲染端以
// `effects` 为唯一事实，`shadow` 仅在 effects 缺失时兜底 —— 避免同一个阴影画两遍。
//
// 各效果的渲染策略：
//   - outerShdw → CSS `drop-shadow()`（SVG/Canvas 通用）
//   - glow      → 双层 0-offset `drop-shadow()` 近似（CSS 无原生 glow）
//   - innerShdw → SVG <filter> 原语（反相 alpha + blur + offset + composite）
//   - softEdge  → SVG <filter> 原语（alpha blur 后 composite in，边缘羽化）
//   - reflection→ SVG <use> 克隆 + 渐变 mask（svg-backend 内实现）
// Canvas 后端只消费 cssFilter 部分（inner/softEdge/reflection 在 hybrid 模式下
// 交给 SVG 层；纯 Canvas 后端为已知近似）。
import type { GlowEffect, ReflectionEffect, ShadowEffect, Shape, ShapeEffect, SoftEdgeEffect } from "@ppt/core";

export interface CollectedShapeEffects {
  outer: ShadowEffect[];
  glow: GlowEffect[];
  inner?: ShadowEffect;
  softEdge?: SoftEdgeEffect;
  reflection?: ReflectionEffect;
}

const EMPTY: CollectedShapeEffects = { outer: [], glow: [] };

export function collectShapeEffects(s: Shape): CollectedShapeEffects {
  const list: ShapeEffect[] | undefined =
    s.effects && s.effects.length ? s.effects : s.shadow ? [s.shadow] : undefined;
  if (!list) return EMPTY;
  const out: CollectedShapeEffects = { outer: [], glow: [] };
  for (const fx of list) {
    switch (fx.kind) {
      case "outer":
        out.outer.push(fx);
        break;
      case "inner":
        if (!out.inner) out.inner = fx;
        break;
      case "glow":
        out.glow.push(fx);
        break;
      case "softEdge":
        if (!out.softEdge) out.softEdge = fx;
        break;
      case "reflection":
        if (!out.reflection) out.reflection = fx;
        break;
      default:
        // blur/duotone/alphaMod 等位图效果由 paint-canvas 的图像通道处理，不在此列。
        break;
    }
  }
  return out;
}

export function hasAnyEffect(fx: CollectedShapeEffects): boolean {
  return fx.outer.length > 0 || fx.glow.length > 0 || !!fx.inner || !!fx.softEdge || !!fx.reflection;
}

export function effectHexWithAlpha(color: string, alpha: number): string {
  if (alpha >= 1) return color;
  if (/^#([0-9a-f]{6})$/i.test(color)) {
    const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
      .toString(16)
      .padStart(2, "0");
    return color + a;
  }
  return color;
}

/** outer shadow + glow 的 CSS filter 链（SVG style.filter / Canvas ctx.filter 通用）。 */
export function cssFilterForEffects(fx: CollectedShapeEffects): string {
  const parts: string[] = [];
  for (const sh of fx.outer) {
    parts.push(`drop-shadow(${sh.dx}px ${sh.dy}px ${sh.blur}px ${effectHexWithAlpha(sh.color, sh.alpha)})`);
  }
  for (const g of fx.glow) {
    const c = effectHexWithAlpha(g.color, g.alpha);
    parts.push(`drop-shadow(0 0 ${g.radius}px ${c})`);
    parts.push(`drop-shadow(0 0 ${g.radius}px ${c})`);
  }
  return parts.join(" ");
}
