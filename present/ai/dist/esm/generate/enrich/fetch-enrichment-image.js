// 图像增强统一拉图：Unsplash/Pexels 优先，失败或未配置时回退 AI 生图（Settings.imageProvider）。
import { clampImageGenConcurrency } from "../../config/presets.js";
import { generateAiImage, resolveImageSizes, resolvedImageRequest } from "../../tools/helpers/images.js";
import { fetchStockImageDataUrl } from "./fetch-stock.js";
/**
 * 双源都配了时的默认顺序。
 *
 * 选 ai-first 而不是 stock-first：图库只能按关键词检索既有照片，命中的是"和标题
 * 沾点边"的通用素材，且完全吃不到主题色 / 风格族 / 本页内容这些上下文（tryStock
 * 根本不消费 promptContext）。生图拿得到完整的 ImagePromptContext，出来的画面
 * 跟这一篇的主题与配色是一路的。图库退居兜底：生图失败 / 限流时仍然有图可用。
 */
export const DEFAULT_IMAGE_ENRICHMENT_PRIORITY = "ai-first";
export function imageEnrichmentSources(config) {
    const stock = !!(config.imagery.unsplashKey.trim() || config.imagery.pexelsKey.trim());
    const apiKey = config.image.apiKey.trim() || config.text.apiKey.trim();
    const ai = !!(config.image.provider && apiKey);
    return { stock, ai };
}
export function imageEnrichmentAvailable(config) {
    const { stock, ai } = imageEnrichmentSources(config);
    return stock || ai;
}
export function resolveImageGenConcurrency(config) {
    return clampImageGenConcurrency(config.image.concurrency);
}
/** 429 / 账户额度耗尽：继续重试只会烧配额，应熔断本轮 AI 生图。 */
export function isImageRateLimitError(err) {
    const msg = err instanceof Error ? err.message : String(err ?? "");
    return /HTTP\s*429|SetLimitExceeded|Too Many Requests|rate.?limit|inference limit|has been paused/i.test(msg);
}
const STOCK_TIMEOUT_MS = 8_000;
const AI_TIMEOUT_MS = 90_000;
/**
 * 按图的角色分化生图 prompt。共同原则：**内容主体优先** —— prompt 的第一句就是
 * "画什么"（deck 主题 / 本页内容），slide LLM 给的 query 降级为风格/取景修饰词；
 * 并显式禁止抽象虚幻画面（此前内容锚点放在句尾、query 当主体，生成结果普遍
 * 偏"梦幻抽象光影"，与内容无关）。
 *   - bg（全屏底图）：真实环境/场景承载主题氛围，主体偏移留负空间给文字。
 *   - hero/inline（内容配图）：单一清晰主体，具体描绘这一页实际在讲的东西。
 */
export function toAiPrompt(query, kind, ctx) {
    const q = query.trim();
    if (kind === "bg") {
        const subject = [ctx?.deckTopic, ctx?.slideTitle].filter(Boolean).join(" — ");
        const lines = [];
        lines.push(subject
            ? `A real, recognizable environment or scene from the world of: ${subject}.`
            : `A real, recognizable environment or scene: ${q}.`);
        if (subject && q)
            lines.push(`Scene direction: ${q}.`);
        const style = ["Wide cinematic presentation slide background, 16:9 landscape"];
        if (ctx?.vibe)
            style.push(ctx.vibe);
        if (ctx?.themeMode === "dark")
            style.push("dark deep tones with room for light text overlay");
        else if (ctx?.themeMode === "light")
            style.push("bright airy tones with room for dark text overlay");
        if (ctx?.accent)
            style.push(`cohesive with accent color ${ctx.accent}`);
        style.push("main subject off-center, generous negative space for slide text");
        lines.push(`Style: ${style.join(", ")}.`);
        lines.push("Must be a concrete photographic scene — NOT abstract shapes, NOT dreamy blurs, NOT generic gradient art. No text, no words, no logos, no watermarks.");
        return lines.join(" ");
    }
    const content = [ctx?.slideTitle, ctx?.slideContent].filter(Boolean).join(" — ");
    const lines = [];
    lines.push(content
        ? `A concrete, recognizable depiction of: ${content}.`
        : `A concrete, recognizable depiction of: ${q}.`);
    if (ctx?.deckTopic)
        lines.push(`This is one slide in a presentation about: ${ctx.deckTopic}.`);
    if (content && q)
        lines.push(`Visual direction: ${q}.`);
    const style = [
        kind === "hero"
            ? "Presentation slide hero visual, clean composition, one clear focal subject"
            : "Presentation slide illustration, one clear focal subject",
    ];
    if (ctx?.vibe)
        style.push(ctx.vibe);
    if (ctx?.accent)
        style.push(`cohesive with accent color ${ctx.accent}`);
    lines.push(`Style: ${style.join(", ")}.`);
    lines.push("Show tangible real-world subject matter (people, devices, environments, objects, interfaces) — NOT abstract art, NOT floating geometric shapes, NOT dreamy particle effects. No text, no words, no logos, no watermarks.");
    return lines.join(" ");
}
async function fetchAiImageDataUrl(query, config, kind, signal, promptContext) {
    const req = resolvedImageRequest(config);
    if (!req)
        return null;
    const { endpoint, model, apiKey, provider } = req;
    const prompt = toAiPrompt(query, kind, promptContext);
    const sizes = resolveImageSizes(endpoint, model, config.image.size, kind);
    let lastErr = null;
    for (const size of sizes) {
        if (signal?.aborted)
            break;
        try {
            const { dataUrl, size: nat } = await generateAiImage({
                provider,
                endpoint,
                apiKey,
                model,
                prompt,
                size,
                background: "opaque",
                signal,
            });
            return { dataUrl, w: nat.w, h: nat.h, source: "ai" };
        }
        catch (e) {
            lastErr = e;
            // 额度 / 限流：立刻停，不要换尺寸再打一次（会连坐烧配额）。
            if (signal?.aborted || isImageRateLimitError(e))
                break;
            // 只有「看起来是尺寸/参数被拒的 4xx」才继续回退下一个尺寸；鉴权/网络等错误直接放弃。
            if (!/HTTP\s+4\d\d/.test(e?.message ?? ""))
                break;
        }
    }
    // 非阻断（外层会回退图库），但把带响应正文的真实错误打出来，方便诊断第三方图像 API。
    if (lastErr && !signal?.aborted) {
        console.warn("[enrich] AI image generation failed:", lastErr?.message ?? lastErr);
    }
    if (lastErr && isImageRateLimitError(lastErr)) {
        const err = lastErr instanceof Error ? lastErr : new Error(String(lastErr));
        err.code = "IMAGE_RATE_LIMITED";
        throw err;
    }
    return null;
}
/**
 * 为生成 pipeline / 占位补全拉图。`priority` 决定双源时的尝试顺序，单源时忽略。
 */
export async function fetchEnrichmentImageDataUrl(query, config, opts = {}) {
    const kind = opts.kind ?? "inline";
    const priority = opts.priority ?? DEFAULT_IMAGE_ENRICHMENT_PRIORITY;
    const { stock, ai } = imageEnrichmentSources(config);
    async function tryStock() {
        if (!stock)
            return null;
        const ac = new AbortController();
        const onAbort = () => ac.abort();
        opts.signal?.addEventListener("abort", onAbort, { once: true });
        const timer = setTimeout(() => ac.abort(), opts.stockTimeoutMs ?? STOCK_TIMEOUT_MS);
        try {
            const hit = await fetchStockImageDataUrl(query, config, {
                signal: ac.signal,
                ...(opts.targetAspect !== undefined ? { targetAspect: opts.targetAspect } : {}),
                ...(opts.usedUrls ? { usedUrls: opts.usedUrls } : {}),
                ...(opts.tone ? { tone: opts.tone } : {}),
            });
            if (!hit)
                return null;
            return { ...hit, source: config.imagery.unsplashKey.trim() ? "unsplash" : "pexels" };
        }
        catch {
            return null;
        }
        finally {
            clearTimeout(timer);
            opts.signal?.removeEventListener("abort", onAbort);
        }
    }
    async function tryAi() {
        if (!ai)
            return null;
        if (opts.aiGate?.aiPaused)
            return null;
        const ac = new AbortController();
        const onAbort = () => ac.abort();
        opts.signal?.addEventListener("abort", onAbort, { once: true });
        const timer = setTimeout(() => ac.abort(), opts.aiTimeoutMs ?? AI_TIMEOUT_MS);
        try {
            return await fetchAiImageDataUrl(query, config, kind, ac.signal, opts.promptContext);
        }
        catch (e) {
            if (isImageRateLimitError(e) && opts.aiGate) {
                opts.aiGate.aiPaused = true;
                opts.aiGate.reason = e?.message ?? "AI image rate limited";
                console.warn("[enrich] AI image circuit open — skipping remaining AI image calls this run.");
            }
            return null;
        }
        finally {
            clearTimeout(timer);
            opts.signal?.removeEventListener("abort", onAbort);
        }
    }
    if (!stock && !ai)
        return null;
    if (stock && !ai)
        return tryStock();
    if (ai && !stock)
        return tryAi();
    if (priority === "ai-first") {
        const aiHit = await tryAi();
        if (aiHit)
            return aiHit;
        return tryStock();
    }
    const stockHit = await tryStock();
    if (stockHit)
        return stockHit;
    return tryAi();
}
