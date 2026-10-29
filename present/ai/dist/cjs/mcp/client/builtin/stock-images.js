"use strict";
// builtin 工具组: stock-images
//
// 两个工具：
//   - stock_images_search → 并行查 Unsplash + Pexels（任一 key 即启用），返回候选。
//   - stock_images_use    → 把选中 URL 下载、转 dataURL、作为背景或 image shape 应用。
//
// 启用条件：至少一个 (imagery.unsplashKey | imagery.pexelsKey) 已填。
Object.defineProperty(exports, "__esModule", { value: true });
exports.stockImagesGroup = void 0;
const zod_1 = require("zod");
const commands_1 = require("@sliiu/present-editor/commands");
const images_1 = require("../../../tools/helpers/images");
const types_1 = require("../../../tools/types");
const searchTool = (0, types_1.defineTool)({
    name: "stock_images_search",
    description: [
        "Search commercially-usable stock photos via Unsplash and/or Pexels.",
        "Returns up to 10 candidate images with URL, dimensions, alt text, and photographer attribution.",
        "Use for real-world photographs. After picking the best candidate, call `stock_images_use` with its url.",
    ].join(" "),
    inputSchema: zod_1.z.object({
        query: zod_1.z
            .string()
            .min(2)
            .describe("English search query. Be specific: 'team meeting in modern office', not 'meeting'."),
    }),
    tags: ["read", "image"],
    execute: async (rt, { query }) => {
        const imagery = rt.getConfig().imagery;
        const unsplashKey = imagery.unsplashKey.trim();
        const pexelsKey = imagery.pexelsKey.trim();
        const tasks = [];
        if (unsplashKey)
            tasks.push((0, images_1.searchUnsplash)(query, unsplashKey).catch((e) => {
                console.warn("[unsplash]", e);
                return [];
            }));
        if (pexelsKey)
            tasks.push((0, images_1.searchPexels)(query, pexelsKey).catch((e) => {
                console.warn("[pexels]", e);
                return [];
            }));
        const buckets = await Promise.all(tasks);
        const results = buckets.flat().slice(0, 10);
        if (results.length === 0) {
            return { ok: false, error: `No results for "${query}". Try a different query or generateImage.` };
        }
        return {
            ok: true,
            query,
            count: results.length,
            results: results.map((r) => ({
                url: r.url,
                alt: r.alt,
                source: r.source,
                w: r.w,
                h: r.h,
                author: r.authorName,
                authorUrl: r.authorUrl,
            })),
        };
    },
});
const useTool = (0, types_1.defineTool)({
    name: "stock_images_use",
    description: [
        "Apply a stock image (or any https image URL) to a slide. AFTER stock_images_search, call this with the chosen url.",
        "Two modes (`asBackground` parameter):",
        "  - asBackground=true → set as the slide BACKGROUND (kind=image, fit=cover) — text remains on top, no z-order issues. Use this whenever the user said 'background image / 背景图 / 全屏图' or whenever the photo is intended to span the whole slide.",
        "  - asBackground=false (default) → insert as a normal image shape (~60% width, centered). Use this for inline photos sitting beside text. If it visually covers text, immediately reorderShape { direction: \"back\" }.",
    ].join(" "),
    inputSchema: zod_1.z.object({
        url: zod_1.z.string().url().describe("Image URL returned by stock_images_search (or any reachable https image)."),
        slideIdx: zod_1.z
            .number()
            .int()
            .min(0)
            .optional()
            .describe("Target slide index. Defaults to the first focused slide."),
        name: zod_1.z.string().optional().describe("Shape display name (e.g. 'Hero photo'). Ignored when asBackground=true."),
        asBackground: zod_1.z
            .boolean()
            .optional()
            .describe("true → set slide.background (ImagePaint, fit=cover); false → insert as a normal image shape. Default false."),
        bgAlpha: zod_1.z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe("Only when asBackground=true. Image opacity (e.g. 0.5 to dim the photo so text stays readable). Default 1 (fully opaque)."),
    }),
    tags: ["mutate", "image"],
    execute: async (rt, { url, slideIdx, name, asBackground, bgAlpha }) => {
        try {
            const dataUrl = await (0, images_1.toDataUrl)({ kind: "url", url });
            const nat = await (0, images_1.probeImageSize)(dataUrl).catch(() => ({ w: 1600, h: 1066 }));
            const targetSlide = slideIdx ?? rt.port.getFocusedSlideIndices()[0] ?? 0;
            if (asBackground) {
                // 走 slide.background 路径：渲染层负责把 ImagePaint 铺满整张 slide，
                // 自动放在所有 shape 之下，文本永远不会被遮挡。
                const pres = rt.getPres();
                if (!pres.slides[targetSlide]) {
                    return { ok: false, error: `slideIdx ${targetSlide} out of range (have ${pres.slides.length})` };
                }
                const paint = {
                    kind: "image",
                    src: dataUrl,
                    fit: "cover",
                    ...(bgAlpha !== undefined ? { alpha: bgAlpha } : {}),
                    // 导出 cover → <a:srcRect> 换算需要自然尺寸（服务端分离生成时嗅探不到字节）。
                    ...(nat.w > 0 && nat.h > 0 ? { natural: { w: nat.w, h: nat.h } } : {}),
                };
                const res = rt.apply(new commands_1.SetSlideBackgroundCmd(targetSlide, paint));
                if (!res.ok)
                    return res;
                return { ok: true, slideIdx: targetSlide, mode: "background", naturalSize: nat };
            }
            const res = (0, images_1.insertImageToSlide)(rt, targetSlide, dataUrl, nat, name ?? "Stock photo");
            if (!res.ok)
                return res;
            return { ok: true, slideIdx: targetSlide, mode: "shape", shapeId: res.shapeId, naturalSize: nat };
        }
        catch (e) {
            return { ok: false, error: `Insert failed: ${e.message}` };
        }
    },
});
exports.stockImagesGroup = {
    id: "stock_images",
    name: "Stock Images",
    description: "可商用图片搜索（Unsplash + Pexels）；插入为带作者署名的 image shape。",
    detail: "提供 `stock_images_search`（搜索）与 `stock_images_use`（应用）两个工具。\n" +
        "需在 AI Settings → 可商用图片搜索 段落里填入 Unsplash Access Key 或 Pexels API Key 之一。",
    icon: "image",
    defaultEnabled: true,
    requirements: (config) => {
        const has = !!(config.imagery.unsplashKey.trim() || config.imagery.pexelsKey.trim());
        return has ? null : ["unsplashKey", "pexelsKey"];
    },
    tools: [searchTool, useTool],
};
