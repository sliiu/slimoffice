import type { GlowEffect, ReflectionEffect, ShadowEffect, Shape, SoftEdgeEffect } from "@sliiu/present-core";
export interface CollectedShapeEffects {
    outer: ShadowEffect[];
    glow: GlowEffect[];
    inner?: ShadowEffect;
    softEdge?: SoftEdgeEffect;
    reflection?: ReflectionEffect;
}
export declare function collectShapeEffects(s: Shape): CollectedShapeEffects;
export declare function hasAnyEffect(fx: CollectedShapeEffects): boolean;
export declare function effectHexWithAlpha(color: string, alpha: number): string;
/** outer shadow + glow 的 CSS filter 链（SVG style.filter / Canvas ctx.filter 通用）。 */
export declare function cssFilterForEffects(fx: CollectedShapeEffects): string;
