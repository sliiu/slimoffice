import { applyThemeVariant, shiftBackgroundColor } from "./theme-variants.js";
function normHex(hex) {
    return hex.trim().toLowerCase();
}
/**
 * 变体色块：改主题色表，并让跟主题走的颜色一起变。
 * 母版 / 版式背景和 dec_ 装饰即使用的不是色表原值，也按背景算法偏色。
 * 正文里对得上旧色表的颜色跟着换；对不上的用户色不动。
 */
export class ApplyThemeVariantCmd {
    variant;
    label = "Apply theme variant";
    prev;
    patches;
    constructor(variant) {
        this.variant = variant;
    }
    apply(pres) {
        if (!pres.theme?.colors)
            return;
        if (!this.prev)
            this.prev = { ...pres.theme.colors };
        const nextColors = applyThemeVariant(this.prev, this.variant);
        if (!this.patches)
            this.patches = collectPatches(pres, this.prev, nextColors, this.variant);
        pres.theme = { ...pres.theme, colors: nextColors };
        for (const patch of this.patches)
            patch.set(patch.next);
    }
    revert(pres) {
        if (!pres.theme || !this.prev)
            return;
        pres.theme = { ...pres.theme, colors: { ...this.prev } };
        for (const patch of this.patches ?? [])
            patch.set(patch.prev);
    }
}
function collectPatches(pres, prev, next, variant) {
    const exact = new Map();
    for (const key of Object.keys(prev)) {
        const before = prev[key];
        const after = next[key];
        if (!before || !after || normHex(before) === normHex(after))
            continue;
        exact.set(normHex(before), after);
    }
    const patches = [];
    const mapColor = (current, themeCanvas) => {
        const hit = exact.get(normHex(current));
        if (hit)
            return hit;
        if (themeCanvas)
            return shiftBackgroundColor(current, variant);
        return current;
    };
    const take = (current, themeCanvas, set) => {
        if (!current)
            return;
        const mapped = mapColor(current, themeCanvas);
        if (normHex(mapped) === normHex(current))
            return;
        patches.push({ prev: current, next: mapped, set });
    };
    const visitPaint = (paint, themeCanvas) => {
        if (!paint)
            return;
        if (paint.kind === "solid")
            take(paint.color, themeCanvas, (color) => { paint.color = color; });
        else if (paint.kind === "linear" || paint.kind === "radial") {
            for (const stop of paint.stops)
                take(stop.color, themeCanvas, (color) => { stop.color = color; });
        }
    };
    const visitShape = (shape, themeCanvas) => {
        const owned = themeCanvas || shape.id.startsWith("dec_");
        visitPaint(shape.fill, owned);
        visitPaint(shape.stroke?.paint, owned);
        if (shape.kind === "text") {
            for (const para of shape.paragraphs) {
                for (const run of para.runs) {
                    take(run.color, false, (color) => { run.color = color; });
                    if (run.fill?.kind === "solid") {
                        const paint = run.fill;
                        take(paint.color, false, (color) => { paint.color = color; });
                    }
                }
            }
        }
        if (shape.kind === "group") {
            for (const child of shape.children)
                visitShape(child, themeCanvas);
        }
    };
    const visitShapes = (shapes, themeCanvas) => {
        for (const shape of shapes ?? [])
            visitShape(shape, themeCanvas);
    };
    for (const master of pres.masters ?? []) {
        visitPaint(master.background, true);
        visitShapes(master.shapes, true);
        for (const layout of master.layouts ?? []) {
            visitPaint(layout.background, true);
            visitShapes(layout.shapes, true);
        }
    }
    for (const slide of pres.slides) {
        visitPaint(slide.background, false);
        for (const layer of slide.layers)
            visitShapes(layer.shapes, false);
    }
    return patches;
}
