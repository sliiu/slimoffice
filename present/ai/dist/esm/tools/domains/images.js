// AI 图像工具：
//   - generateImage          → 通过用户配置的 image provider（OpenAI Images / 任何
//                              OpenAI-Compatible）生成图片，落地为 image shape。
//   - fillImagePlaceholders  → 把编译产物里的灰底图片占位符换成真实图库照片。
//
// 注：stock_images_search / stock_images_use 在 mcp/client/builtin/stock-images.ts
//（作为可独立启停的能力项）；本文件是"永远在场"的内置图像工具。
import { z } from "zod";
import { defineTool, err } from "../types.js";
import { generateAiImage, insertImageToSlide, probeImageSize, resolveImageSizes, resolvedImageRequest, toDataUrl, } from "../helpers/images.js";
import { fillImagePlaceholdersViaCommands } from "../../generate/enrich/placeholders.js";
import { imageEnrichmentAvailable } from "../../generate/enrich/fetch-enrichment-image.js";
import { findShapeDeep } from "../summaries.js";
export const imageTools = [
    defineTool({
        name: "generateImage",
        description: [
            "Generate an AI image from a text prompt (via the Image provider in Settings: OpenAI / OpenRouter / FLUX / Stability / Fal / Seedream / any OpenAI-compatible endpoint).",
            "The generated image is inserted as a new image shape on the chosen slide (or focused slide by default). Use this when the user asks for a custom/original illustration, icon, scene, or any image that does not need to be a real-world photograph.",
            "If you only need a photograph (real product, real place, real person), prefer `stock_images_search` instead — it produces commercially-usable Unsplash/Pexels photos without any per-image cost.",
            "Ripple effect: the new shape lands on TOP of the layer — if it overlaps existing text, immediately reorderShape { direction: \"back\" } or moveShape it clear.",
        ].join(" "),
        inputSchema: z.object({
            prompt: z
                .string()
                .min(3)
                .describe("Detailed English prompt describing the desired image (style, subject, mood, composition)."),
            slideIdx: z
                .number()
                .int()
                .min(0)
                .optional()
                .describe("Target slide index. Defaults to the first focused slide (from [TURN SCOPE])."),
            size: z
                .enum(["1024x1024", "1792x1024", "1024x1792", "auto"])
                .optional()
                .describe("Output canvas size; defaults to 'auto' (let the model decide)."),
            background: z
                .enum(["transparent", "opaque", "auto"])
                .optional()
                .describe("Use 'transparent' for icons / cutouts; 'opaque' for full scenes."),
            name: z.string().optional().describe("Shape display name (shown in editor layer panel)."),
        }),
        tags: ["mutate", "image", "llm"],
        execute: async (rt, { prompt, slideIdx, size, background, name }) => {
            const config = rt.getConfig();
            const req = resolvedImageRequest(config);
            if (!req) {
                return err("Image generation is not configured. Ask user to open AI panel → Settings and set Image provider + API key. (You may still try stock_images_search if Unsplash/Pexels keys are configured.)");
            }
            const { endpoint, model, apiKey, provider } = req;
            const targetSlide = slideIdx ?? rt.port.getFocusedSlideIndices()[0] ?? 0;
            try {
                const sizes = size && size !== "auto" ? [size] : resolveImageSizes(endpoint, model, config.image.size);
                let hit = null;
                let lastErr = null;
                for (const candidate of sizes) {
                    try {
                        hit = await generateAiImage({
                            provider,
                            endpoint,
                            apiKey,
                            model,
                            prompt,
                            size: candidate,
                            ...(background ? { background } : {}),
                        });
                        lastErr = null;
                        break;
                    }
                    catch (e) {
                        lastErr = e;
                        if (!/HTTP\s+4\d\d/.test(e?.message ?? ""))
                            break;
                    }
                }
                if (lastErr)
                    throw lastErr;
                if (!hit)
                    throw new Error("Image generation failed: no size candidate succeeded");
                const { dataUrl, size: nat } = hit;
                const res = insertImageToSlide(rt, targetSlide, dataUrl, nat, name ?? "AI image");
                if (!res.ok)
                    return res;
                return {
                    ok: true,
                    slideIdx: targetSlide,
                    shapeId: res.shapeId,
                    model,
                    naturalSize: nat,
                };
            }
            catch (e) {
                return err(`Image generation failed: ${e.message}`);
            }
        },
    }),
    defineTool({
        name: "insertImage",
        description: [
            "Insert an existing image onto a slide as a normal image shape (not AI-generated, not a stock search).",
            "Provide `src` (data URL or https URL) OR `copyFromShapeId` to reuse another image shape's src.",
            "Use this when the user already has a picture (uploaded data URL, URL they pasted, or 'copy that photo to this slide').",
            "Distinct from `generateImage` (creates a new picture) and `stock_images_use` (Unsplash/Pexels search).",
            "Ripple: the shape lands on TOP of the layer (~60% wide, centered, unless you pass bbox). If it covers existing text, immediately reorderShape { direction: \"back\" } or moveShape it clear. For a full-slide background use setSlideBackground { kind: \"image\" } instead.",
        ].join(" "),
        inputSchema: z.object({
            slideIdx: z
                .number()
                .int()
                .min(0)
                .optional()
                .describe("Target slide index. Defaults to the first focused slide."),
            src: z
                .string()
                .optional()
                .describe("Image data URL (data:image/...) or https URL. Required unless copyFromShapeId is set."),
            copyFromShapeId: z
                .string()
                .optional()
                .describe("Id of an existing image shape whose src should be reused. Searched on the target slide first, then the whole deck."),
            bbox: z
                .object({
                x: z.number(),
                y: z.number(),
                w: z.number().positive(),
                h: z.number().positive(),
            })
                .optional()
                .describe("Optional placement. Omit for the default centered ~60% width box."),
            name: z.string().optional().describe("Shape display name (layer panel)."),
        }),
        tags: ["mutate", "image"],
        execute: async (rt, { slideIdx, src, copyFromShapeId, bbox, name }) => {
            if (!src && !copyFromShapeId) {
                return err("Provide src (data URL / https URL) or copyFromShapeId.");
            }
            const pres = rt.getPres();
            const targetSlide = slideIdx ?? rt.port.getFocusedSlideIndices()[0] ?? 0;
            if (!pres.slides[targetSlide]) {
                return err(`slideIdx ${targetSlide} out of range (have ${pres.slides.length})`);
            }
            try {
                let dataUrl = src ?? "";
                let nat = { w: 1600, h: 1066 };
                if (copyFromShapeId) {
                    let found = findShapeDeep(pres.slides[targetSlide], copyFromShapeId);
                    if (!found) {
                        for (const slide of pres.slides) {
                            found = findShapeDeep(slide, copyFromShapeId);
                            if (found)
                                break;
                        }
                    }
                    if (!found)
                        return err(`copyFromShapeId ${copyFromShapeId} not found`);
                    if (found.kind !== "image") {
                        return err(`copyFromShapeId ${copyFromShapeId} is kind=${found.kind}, not image`);
                    }
                    dataUrl = found.src;
                    if (found.natural && found.natural.w > 0 && found.natural.h > 0) {
                        nat = { w: found.natural.w, h: found.natural.h };
                    }
                }
                else if (src) {
                    dataUrl = src.startsWith("data:") ? src : await toDataUrl({ kind: "url", url: src });
                }
                if (!dataUrl)
                    return err("Resolved image src is empty.");
                nat = await probeImageSize(dataUrl).catch(() => nat);
                const res = insertImageToSlide(rt, targetSlide, dataUrl, nat, name ?? "Image", bbox);
                if (!res.ok)
                    return res;
                return {
                    ok: true,
                    slideIdx: targetSlide,
                    shapeId: res.shapeId,
                    naturalSize: nat,
                };
            }
            catch (e) {
                return err(`Insert image failed: ${e.message}`);
            }
        },
    }),
    defineTool({
        name: "fillImagePlaceholders",
        description: [
            "Replace compiled image-text PLACEHOLDERS (gray box + '🖼 english keywords' hint) with real stock photos.",
            "Scans the deck for shapes named 'Image placeholder' / 'Image hint', fetches via Unsplash/Pexels, and swaps in an image at the same bbox.",
            "Call this when you see 🖼 hints left on slides after generation, or when the user asks to 'fill images' / '补图' / '把占位图换成真图'.",
            "Requires Unsplash/Pexels API key and/or image generation (Image provider) in AI Settings.",
            "Does NOT touch slides that already have a real 'Image' shape. Optional slideIdx limits to one page.",
        ].join(" "),
        inputSchema: z.object({
            slideIdx: z
                .number()
                .int()
                .min(0)
                .optional()
                .describe("Only fill placeholders on this slide. Omit to process the whole deck."),
        }),
        tags: ["mutate", "image"],
        execute: async (rt, { slideIdx }) => {
            const config = rt.getConfig();
            if (!imageEnrichmentAvailable(config)) {
                return err("Image enrichment not configured. Add Unsplash/Pexels key and/or enable Image provider in AI Settings → Stock images / Image generation, then retry.");
            }
            const result = await fillImagePlaceholdersViaCommands(rt.port, {
                config,
                ...(slideIdx !== undefined ? { slideIndices: [slideIdx] } : {}),
            });
            if (result.filled === 0 && result.skipped === 0 && result.details[0]?.reason === "no_image_sources") {
                return err("Image enrichment not configured.");
            }
            return {
                ok: true,
                filled: result.filled,
                skipped: result.skipped,
                details: result.details,
            };
        },
    }),
];
