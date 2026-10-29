"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shapeFrontImageSrc = shapeFrontImageSrc;
const canvas_backend_1 = require("./canvas-backend");
const cache = new Map();
/** 文字 3D 的正面：字形画进 PNG，再贴到挤出体上。非文字返回 undefined。 */
function shapeFrontImageSrc(scene, shape) {
    if (shape.kind !== "text" || typeof document === "undefined")
        return undefined;
    const key = JSON.stringify({
        id: shape.id,
        w: Math.round(shape.bbox.w),
        h: Math.round(shape.bbox.h),
        p: shape.paragraphs,
        f: shape.fill ?? null,
        i: shape.insets ?? null,
    });
    const hit = cache.get(key);
    if (hit)
        return hit;
    const canvas = (0, canvas_backend_1.rasterizeShapeFront)(scene, shape.id);
    if (!canvas)
        return undefined;
    let url;
    try {
        url = canvas.toDataURL("image/png");
    }
    catch {
        return undefined;
    }
    cache.set(key, url);
    if (cache.size > 40) {
        const oldest = cache.keys().next().value;
        if (oldest)
            cache.delete(oldest);
    }
    return url;
}
