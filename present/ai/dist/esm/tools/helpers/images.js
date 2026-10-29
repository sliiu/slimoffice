// 图片共享辅助：dataURL 转换 / 尺寸探测 / OpenAI Images 调用 / Unsplash & Pexels
// 搜索 / 插图 shape 构造。供 images 工具域、enrich pipeline、stock-images 工具组复用。
//
// 通用设计要点：
//   1. 所有图都落地为 dataURL 存进 ImageShape.src —— 后续保存 .pptx / localStorage /
//      HTML 导出都不依赖外部图床，离线也能继续编辑。
//   2. 浏览器与 Node 双环境：FileReader / Image 不存在时走 Buffer/btoa 与
//      "探测失败回退默认尺寸"路径（headless MCP server 可用）。
import { AddShapeCmd } from "@sliiu/present-editor/commands";
import { identityTransform } from "@sliiu/present-core";
import { applyProxyUrl, getImageProviderPreset, resolveImageConfig, } from "../../config/presets.js";
import { systemImageRoute } from "../../llm/offline-route.js";
// ===========================================================================
// 默认插入位置：slide 中央、占满约 60% 宽，按图像 aspect ratio 等比裁。
// ===========================================================================
export function defaultBboxFor(pres, slideIdx, natural) {
    const slideSize = pres.size;
    const slide = pres.slides[slideIdx];
    if (!slide)
        throw new Error(`slideIdx ${slideIdx} out of range`);
    const targetW = slideSize.width * 0.6;
    const aspect = natural.h > 0 ? natural.w / natural.h : 16 / 9;
    const targetH = targetW / aspect;
    return {
        x: (slideSize.width - targetW) / 2,
        y: (slideSize.height - targetH) / 2,
        w: targetW,
        h: targetH,
    };
}
export function makeImageShape(args) {
    return {
        id: args.id,
        name: args.name,
        kind: "image",
        bbox: args.bbox,
        transform: identityTransform(),
        zIndex: 0,
        visible: true,
        locked: false,
        opacity: 1,
        src: args.src,
        ...(args.natural ? { natural: args.natural } : {}),
    };
}
// 用于 id 唯一性。Date.now+random 足够 dedup 单会话。
export function genId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
// ===========================================================================
// 把任意 fetch 到的 image bytes / dataURL / blob 转为 dataURL（用于离线落地）。
// ===========================================================================
export async function toDataUrl(input) {
    if (input.kind === "b64") {
        return `data:${input.mime || "image/png"};base64,${input.data}`;
    }
    if (input.url.startsWith("data:"))
        return input.url;
    const resp = await fetch(input.url, typeof window === "undefined" ? {} : { mode: "cors" });
    if (!resp.ok)
        throw new Error(`fetch image failed: HTTP ${resp.status}`);
    const blob = await resp.blob();
    return await blobToDataUrl(blob);
}
async function blobToDataUrl(blob) {
    if (typeof FileReader !== "undefined") {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ""));
            reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
            reader.readAsDataURL(blob);
        });
    }
    // Node：无 FileReader，走 base64 手动拼。
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    const b64 = typeof btoa !== "undefined" ? btoa(binary) : Buffer.from(bytes).toString("base64");
    return `data:${blob.type || "image/png"};base64,${b64}`;
}
// ===========================================================================
// 读图的 natural size。浏览器用 Image 解码；Node 环境直接 reject，
// 调用方一律 .catch 回退默认尺寸。
// ===========================================================================
export function probeImageSize(dataUrl) {
    return new Promise((resolve, reject) => {
        if (typeof Image === "undefined") {
            reject(new Error("Image decode not available in this environment"));
            return;
        }
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
        img.onerror = () => reject(new Error("Failed to decode image for size probe"));
        img.src = dataUrl;
    });
}
// ===========================================================================
// 生图尺寸：OpenAI vs 火山方舟 Seedream 等 provider 的 `size` 契约不同。
// Seedream 4.5 / 5.x 最低 3,686,400 像素（≈1920×1920）；官方示例用 `2K`。
// ===========================================================================
/** 火山方舟 Ark / Seedream（endpoint 或 model 名命中即视为 seedream 族）。 */
export function isArkSeedreamImageProvider(endpoint, model) {
    const e = endpoint.toLowerCase();
    const m = model.toLowerCase();
    return (e.includes("volces.com") ||
        e.includes("volcengine") ||
        m.includes("seedream") ||
        m.includes("doubao-seed"));
}
/**
 * 按 provider + slot 类型解析 Images API `size` 候选列表（按优先级尝试，4xx 时回退下一项）。
 * 用户在设置里显式填写 image.size 时只返回该项（尊重配置）。
 */
export function resolveImageSizes(endpoint, model, configuredSize, kind = "inline") {
    const configured = configuredSize.trim();
    if (configured)
        return [configured];
    if (isArkSeedreamImageProvider(endpoint, model)) {
        // 16:9 长图优先给 bg/hero；inline 方图。均满足 Seedream 最低像素门槛。
        if (kind === "bg" || kind === "hero") {
            return ["2848x1600", "2K", "2048x2048"];
        }
        return ["2048x2048", "2K"];
    }
    if (kind === "bg" || kind === "hero") {
        return ["1792x1024", "1024x1024"];
    }
    return ["1024x1024"];
}
export function resolveImageApi(provider, endpoint) {
    const fromPreset = provider ? getImageProviderPreset(provider)?.api : undefined;
    if (fromPreset && fromPreset !== "openai")
        return fromPreset;
    const e = endpoint.toLowerCase();
    if (e.includes("openrouter.ai") && /\/images\/?$/.test(e.replace(/\/$/, "")))
        return "openrouter";
    if (e.includes("stability.ai"))
        return "stability";
    if (e.includes("fal.run") || e.includes("fal.ai"))
        return "fal";
    if (e.includes("huggingface.co") && !e.includes("images/generations"))
        return "huggingface";
    return "openai";
}
/** 从完整 AiConfig 解析出发请求所需的 endpoint / model / key（含 proxy）。 */
export function resolvedImageRequest(config) {
    const system = systemImageRoute();
    if (system) {
        return {
            provider: "openai-compatible",
            endpoint: system.endpoint,
            model: system.model,
            apiKey: "session",
        };
    }
    const image = resolveImageConfig(config.image);
    const apiKey = image.apiKey.trim() || config.text.apiKey.trim();
    if (!image.provider || !apiKey)
        return null;
    return {
        provider: image.provider,
        endpoint: applyProxyUrl(image.baseURL, config.text.proxyUrl),
        model: image.model,
        apiKey,
    };
}
export async function generateAiImage(args) {
    const api = resolveImageApi(args.provider, args.endpoint);
    if (api === "openrouter")
        return callOpenRouterImages(args);
    if (api === "stability")
        return callStabilityImage(args);
    if (api === "fal")
        return callFalImage(args);
    if (api === "huggingface")
        return callHuggingFaceImage(args);
    return callOpenAIImages(args);
}
export async function callOpenAIImages(args) {
    const body = {
        model: args.model,
        prompt: args.prompt,
    };
    if (args.size && args.size !== "auto")
        body.size = args.size;
    if (args.background && args.background !== "auto")
        body.background = args.background;
    // gpt-image-1 默认 b64_json；dall-e-3 默认 url，强制要求 b64。
    // 部分兼容端（Together / 硅基）不认该字段，4xx 时去掉再试一次。
    body.response_format = "b64_json";
    let resp = await postJson(args.endpoint, args.apiKey, body, args.signal);
    if (!resp.ok && resp.status === 400) {
        const retryBody = { ...body };
        delete retryBody.response_format;
        resp = await postJson(args.endpoint, args.apiKey, retryBody, args.signal);
    }
    if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Image API HTTP ${resp.status}: ${text.slice(0, 300)}`);
    }
    const json = (await resp.json());
    return await imageResultFromUnknownJson(json);
}
async function callOpenRouterImages(args) {
    const body = {
        model: args.model,
        prompt: args.prompt,
    };
    const aspect = sizeToAspectRatio(args.size);
    if (aspect)
        body.aspect_ratio = aspect;
    if (args.background && args.background !== "auto")
        body.background = args.background;
    const resp = await fetch(args.endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${args.apiKey}`,
            "HTTP-Referer": "https://slimppt.app",
            "X-Title": "SlimPPT",
        },
        body: JSON.stringify(body),
        signal: args.signal,
    });
    if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`OpenRouter Image API HTTP ${resp.status}: ${text.slice(0, 300)}`);
    }
    return await imageResultFromUnknownJson((await resp.json()));
}
async function callStabilityImage(args) {
    const endpoint = stabilityEndpoint(args.endpoint, args.model);
    const form = new FormData();
    form.append("prompt", args.prompt);
    form.append("output_format", "png");
    const aspect = sizeToAspectRatio(args.size);
    if (aspect)
        form.append("aspect_ratio", aspect);
    const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${args.apiKey}`,
            Accept: "image/*",
        },
        body: form,
        signal: args.signal,
    });
    if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Stability API HTTP ${resp.status}: ${text.slice(0, 300)}`);
    }
    return await imageResultFromBlob(await resp.blob());
}
async function callFalImage(args) {
    const url = joinModelPath(args.endpoint, args.model);
    const resp = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Key ${args.apiKey}`,
        },
        body: JSON.stringify({ prompt: args.prompt }),
        signal: args.signal,
    });
    if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Fal API HTTP ${resp.status}: ${text.slice(0, 300)}`);
    }
    const json = (await resp.json());
    const first = json.images?.[0] ?? json.image;
    const href = typeof first === "string" ? first : first?.url;
    if (!href)
        throw new Error("Fal API returned no image url");
    return await imageResultFromDataUrl(await toDataUrl({ kind: "url", url: href }));
}
async function callHuggingFaceImage(args) {
    const url = joinModelPath(args.endpoint, args.model);
    const resp = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${args.apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: args.prompt }),
        signal: args.signal,
    });
    if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Hugging Face Image API HTTP ${resp.status}: ${text.slice(0, 300)}`);
    }
    const ct = resp.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
        return await imageResultFromUnknownJson((await resp.json()));
    }
    return await imageResultFromBlob(await resp.blob());
}
function postJson(endpoint, apiKey, body, signal) {
    const session = apiKey === "session";
    return fetch(endpoint, {
        method: "POST",
        credentials: session ? "include" : "same-origin",
        headers: {
            "Content-Type": "application/json",
            ...(session ? {} : { Authorization: `Bearer ${apiKey}` }),
        },
        body: JSON.stringify(body),
        signal,
    });
}
function joinModelPath(base, model) {
    const b = base.replace(/\/$/, "");
    const m = model.trim();
    if (!m)
        return b;
    if (b.endsWith(`/${m}`) || b.includes(m))
        return b;
    return `${b}/${m}`;
}
function stabilityEndpoint(base, model) {
    const engine = model.trim().toLowerCase();
    if (!engine || engine === "core")
        return base;
    if (/\/generate\/[^/]+\/?$/.test(base) && (engine === "ultra" || engine === "sd3")) {
        return base.replace(/\/generate\/[^/]+\/?$/, `/generate/${engine}`);
    }
    return base;
}
function sizeToAspectRatio(size) {
    if (!size || size === "auto")
        return undefined;
    if (size === "2K" || size === "4K")
        return "16:9";
    const m = /^(\d+)x(\d+)$/i.exec(size.trim());
    if (!m)
        return undefined;
    const w = Number(m[1]);
    const h = Number(m[2]);
    if (!w || !h)
        return undefined;
    if (w === h)
        return "1:1";
    return w > h ? "16:9" : "9:16";
}
async function imageResultFromUnknownJson(json) {
    const data = json.data;
    const images = json.images;
    const first = (Array.isArray(data) ? data[0] : undefined) ??
        (Array.isArray(images) ? images[0] : undefined) ??
        json.image;
    if (!first)
        throw new Error("Image API returned no data");
    if (typeof first === "string") {
        const dataUrl = first.startsWith("data:") ? first : await toDataUrl({ kind: "url", url: first });
        return await imageResultFromDataUrl(dataUrl);
    }
    if (typeof first === "object" && first) {
        const row = first;
        if (row.b64_json) {
            return await imageResultFromDataUrl(await toDataUrl({ kind: "b64", mime: "image/png", data: row.b64_json }));
        }
        if (row.url)
            return await imageResultFromDataUrl(await toDataUrl({ kind: "url", url: row.url }));
        if (row.image) {
            const img = row.image;
            const dataUrl = img.startsWith("data:")
                ? img
                : img.startsWith("http")
                    ? await toDataUrl({ kind: "url", url: img })
                    : await toDataUrl({ kind: "b64", mime: "image/png", data: img });
            return await imageResultFromDataUrl(dataUrl);
        }
    }
    throw new Error("Image API returned neither b64_json nor url");
}
async function imageResultFromBlob(blob) {
    return await imageResultFromDataUrl(await blobToDataUrl(blob));
}
async function imageResultFromDataUrl(dataUrl) {
    const size = await probeImageSize(dataUrl).catch(() => ({ w: 1024, h: 1024 }));
    return { dataUrl, size };
}
export async function searchUnsplash(query, key, signal) {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=6&orientation=landscape`;
    const resp = await fetch(url, {
        headers: { Authorization: `Client-ID ${key}` },
        signal,
    });
    if (!resp.ok)
        throw new Error(`Unsplash HTTP ${resp.status}`);
    const json = (await resp.json());
    return (json.results ?? [])
        .map((r) => ({
        url: r.urls?.regular ?? r.urls?.small ?? "",
        thumb: r.urls?.thumb ?? r.urls?.small ?? "",
        w: r.width ?? 1600,
        h: r.height ?? 1066,
        source: "unsplash",
        alt: r.alt_description ?? undefined,
        authorName: r.user?.name ?? undefined,
        authorUrl: r.user?.links?.html ?? undefined,
        color: r.color ?? undefined,
    }))
        .filter((h) => !!h.url);
}
export async function searchPexels(query, key, signal) {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=6&orientation=landscape`;
    const resp = await fetch(url, {
        headers: { Authorization: key },
        signal,
    });
    if (!resp.ok)
        throw new Error(`Pexels HTTP ${resp.status}`);
    const json = (await resp.json());
    return (json.photos ?? [])
        .map((p) => ({
        url: p.src?.large ?? p.src?.medium ?? "",
        thumb: p.src?.tiny ?? p.src?.medium ?? "",
        w: p.width ?? 1600,
        h: p.height ?? 1066,
        source: "pexels",
        alt: p.alt ?? undefined,
        authorName: p.photographer ?? undefined,
        authorUrl: p.photographer_url ?? undefined,
        color: p.avg_color ?? undefined,
    }))
        .filter((h) => !!h.url);
}
/**
 * 把一张已经下载好的图片（dataUrl）插入到指定 slide。
 * 走 AddShapeCmd → port.execute，自然带 undo / redo。
 * 共享给 stock-images 工具组与 generateImage。
 */
export function insertImageToSlide(rt, slideIdx, dataUrl, natural, name, bbox) {
    try {
        const pres = rt.getPres();
        if (!pres.slides[slideIdx]) {
            return { ok: false, error: `slideIdx ${slideIdx} out of range (have ${pres.slides.length})` };
        }
        const box = bbox ?? defaultBboxFor(pres, slideIdx, natural);
        const shape = makeImageShape({
            id: genId("sp_img"),
            name,
            bbox: box,
            src: dataUrl,
            natural,
        });
        const res = rt.apply(new AddShapeCmd(slideIdx, 0, shape));
        if (!res.ok)
            return res;
        return { ok: true, shapeId: shape.id };
    }
    catch (e) {
        return { ok: false, error: e.message };
    }
}
