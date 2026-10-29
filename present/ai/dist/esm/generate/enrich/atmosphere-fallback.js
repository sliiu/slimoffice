// 配图失败（额度 / 未配置）时的非图像氛围兜底：
// 给仍是 solid / 过平背景的页叠电影感渐变 + aurora 光晕，避免 dark-launch 等
// 全出血风格在无图时退化成「一块纯色 + 白字」。
import { buildDecorationShapesShared } from "../../decorations.js";
function isFlatSolidBg(bg) {
    return !bg || bg.kind === "solid" || bg.kind === "none";
}
function cinematicFallback(theme, role) {
    if (role === "soft" && theme.backgroundPaint)
        return theme.backgroundPaint;
    return {
        kind: "linear",
        angle: role === "accent" ? 145 : 120,
        stops: [
            { offset: 0, color: role === "accent" ? theme.palette.accent1 : theme.palette.bgAlt },
            { offset: 0.45, color: theme.palette.bg },
            { offset: 1, color: theme.palette.bg },
        ],
    };
}
function hasDeco(shapes) {
    return shapes.some((s) => s.id.startsWith("dec_"));
}
/**
 * 在 enrich 插入 0 张图或 AI 熔断后调用。原地 mutate presentation。
 * @returns 升级了背景或补了装饰的页数。
 */
export function applyNoImageryAtmosphere(pres, theme, slideKinds) {
    if (!theme)
        return { upgraded: 0 };
    let upgraded = 0;
    const W = pres.size.width;
    const H = pres.size.height;
    for (let i = 0; i < pres.slides.length; i++) {
        const slide = pres.slides[i];
        if (!slide)
            continue;
        const kind = slideKinds[i] ?? "";
        const wantsAtmosphere = kind === "cover" ||
            kind === "closing" ||
            kind === "hero" ||
            kind === "section" ||
            kind === "stat" ||
            kind === "banner";
        if (!wantsAtmosphere)
            continue;
        // 已有真实配图 → 不动。
        if (slide.background?.kind === "image")
            continue;
        let changed = false;
        if (isFlatSolidBg(slide.background)) {
            const role = kind === "section" ? "soft" : "accent";
            slide.background = cinematicFallback(theme, role);
            changed = true;
        }
        const layer = slide.layers[0];
        if (layer && !hasDeco(layer.shapes)) {
            // 无主题装饰时补 aurora 光晕（暗色发布会最常见缺口）。
            const dec = buildDecorationShapesShared("aurora", {
                palette: theme.palette,
                size: { width: W, height: H },
                locked: false,
                idPrefix: `nofall_${i}_${Date.now().toString(36)}`,
            });
            if (dec.length > 0) {
                layer.shapes = [...dec, ...layer.shapes];
                changed = true;
            }
        }
        if (changed)
            upgraded += 1;
    }
    return { upgraded };
}
