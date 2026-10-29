const EMPTY = { outer: [], glow: [] };
export function collectShapeEffects(s) {
    const list = s.effects && s.effects.length ? s.effects : s.shadow ? [s.shadow] : undefined;
    if (!list)
        return EMPTY;
    const out = { outer: [], glow: [] };
    for (const fx of list) {
        switch (fx.kind) {
            case "outer":
                out.outer.push(fx);
                break;
            case "inner":
                if (!out.inner)
                    out.inner = fx;
                break;
            case "glow":
                out.glow.push(fx);
                break;
            case "softEdge":
                if (!out.softEdge)
                    out.softEdge = fx;
                break;
            case "reflection":
                if (!out.reflection)
                    out.reflection = fx;
                break;
            default:
                // blur/duotone/alphaMod 等位图效果由 paint-canvas 的图像通道处理，不在此列。
                break;
        }
    }
    return out;
}
export function hasAnyEffect(fx) {
    return fx.outer.length > 0 || fx.glow.length > 0 || !!fx.inner || !!fx.softEdge || !!fx.reflection;
}
export function effectHexWithAlpha(color, alpha) {
    if (alpha >= 1)
        return color;
    if (/^#([0-9a-f]{6})$/i.test(color)) {
        const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
            .toString(16)
            .padStart(2, "0");
        return color + a;
    }
    return color;
}
/** outer shadow + glow 的 CSS filter 链（SVG style.filter / Canvas ctx.filter 通用）。 */
export function cssFilterForEffects(fx) {
    const parts = [];
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
