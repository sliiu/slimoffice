"use strict";
// 阶段 3.2：模板缩略图生成。
//
// generateTemplate 拿到 master + layout 后，要生成一份"卡片预览图"挂到
// Template.thumbnailUrl 上。完整渲染要拉 @sliiu/present-renderer/SvgBackend（依赖巨大），
// 而模板缩略图只要"看出风格"就行。
//
// 策略：手写一份极简的 SVG 序列化，覆盖 rect / ellipse / line + solid/linear/radial fill。
// 不支持 text / image / group / 复杂滤镜 —— 模板装饰本来就只用这几种 shape，足够。
//
// 输出 `data:image/svg+xml;utf8,<encoded svg>`，可直接塞 <img src>。
Object.defineProperty(exports, "__esModule", { value: true });
exports.snapshotThemeShapes = snapshotThemeShapes;
function snapshotThemeShapes(input) {
    const { size, background, shapes } = input;
    const defs = [];
    const body = [];
    // 背景
    if (background) {
        const fillRef = paintToFillRef(background, defs, "tplBgGrad");
        body.push(`<rect x="0" y="0" width="${size.width}" height="${size.height}" fill="${fillRef}" />`);
    }
    // shape：只画 rect/ellipse/line；text 用矩形条占位（"模板预览"不必显示真实字）。
    let i = 0;
    for (const shape of shapes) {
        const opacity = shape.opacity ?? 1;
        const visible = shape.visible !== false;
        if (!visible)
            continue;
        if (shape.kind === "rect") {
            const fill = paintToFillRef(shape.fill, defs, `g${++i}`);
            body.push(`<rect x="${shape.bbox.x}" y="${shape.bbox.y}" width="${shape.bbox.w}" height="${shape.bbox.h}" fill="${fill}" opacity="${opacity}" />`);
        }
        else if (shape.kind === "ellipse") {
            const cx = shape.bbox.x + shape.bbox.w / 2;
            const cy = shape.bbox.y + shape.bbox.h / 2;
            const rx = shape.bbox.w / 2;
            const ry = shape.bbox.h / 2;
            const fill = paintToFillRef(shape.fill, defs, `g${++i}`);
            body.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" opacity="${opacity}" />`);
        }
        else if (shape.kind === "line") {
            const stroke = paintToColor(shape.stroke?.paint) ?? "#888";
            const w = shape.stroke?.width ?? 1;
            body.push(`<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" stroke="${stroke}" stroke-width="${w}" opacity="${opacity}" />`);
        }
        else if (shape.kind === "text") {
            // 文本占位：用半透明灰条暗示文字区域。
            body.push(`<rect x="${shape.bbox.x}" y="${shape.bbox.y + shape.bbox.h * 0.3}" width="${shape.bbox.w * 0.7}" height="${shape.bbox.h * 0.18}" fill="#888" opacity="0.18" />`);
        }
        // image / video / table / chart / group：跳过 —— 模板装饰里基本不出现。
    }
    const defsXml = defs.length > 0 ? `<defs>${defs.join("")}</defs>` : "";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.width} ${size.height}" preserveAspectRatio="xMidYMid slice">${defsXml}${body.join("")}</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
function paintToFillRef(paint, defs, gradId) {
    if (!paint)
        return "transparent";
    switch (paint.kind) {
        case "solid":
            return paint.alpha !== undefined ? rgbaFromHex(paint.color, paint.alpha) : paint.color;
        case "linear": {
            const stops = paint.stops.map((s) => `<stop offset="${(s.offset * 100).toFixed(0)}%" stop-color="${s.color}"${s.alpha !== undefined ? ` stop-opacity="${s.alpha}"` : ""} />`).join("");
            // svg 的 linearGradient 默认 x1=0 y1=0 x2=1 y2=0 (即 0°，左→右)
            // theme.linear.angle: 0 = L→R, 90 = T→B. 转 svg 坐标 (cos/sin)
            const rad = (paint.angle * Math.PI) / 180;
            const dx = Math.cos(rad);
            const dy = Math.sin(rad);
            defs.push(`<linearGradient id="${gradId}" x1="${(0.5 - dx / 2).toFixed(2)}" y1="${(0.5 - dy / 2).toFixed(2)}" x2="${(0.5 + dx / 2).toFixed(2)}" y2="${(0.5 + dy / 2).toFixed(2)}">${stops}</linearGradient>`);
            return `url(#${gradId})`;
        }
        case "radial": {
            const stops = paint.stops.map((s) => `<stop offset="${(s.offset * 100).toFixed(0)}%" stop-color="${s.color}"${s.alpha !== undefined ? ` stop-opacity="${s.alpha}"` : ""} />`).join("");
            defs.push(`<radialGradient id="${gradId}" cx="50%" cy="50%" r="50%">${stops}</radialGradient>`);
            return `url(#${gradId})`;
        }
        default:
            return "transparent";
    }
}
function paintToColor(paint) {
    if (!paint)
        return undefined;
    if (paint.kind === "solid")
        return paint.color;
    if (paint.kind === "linear" || paint.kind === "radial")
        return paint.stops[0]?.color;
    return undefined;
}
function rgbaFromHex(hex, alpha) {
    const m = hex.match(/^#([0-9a-fA-F]{6})$/);
    if (!m)
        return hex;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 0xff;
    const g = (n >> 8) & 0xff;
    const b = n & 0xff;
    return `rgba(${r},${g},${b},${alpha})`;
}
