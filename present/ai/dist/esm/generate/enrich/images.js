// 生成 pipeline 的"图像增强 pass"：把 SlideSpec 上的 *ImageQuery hint
// 转化为实际的图片（dataURL）并写回到 Presentation IR。
//
// 设计要点：
//   1. 这是 *post-compile* pass —— 不修改 layouts / compile 本体（不引入网络依赖）。
//      有 Key 的 live 路径先走 acquire-page-images（画布摄影）；本 pass 仍由
//      polish 调用，给 outline 兜底 spec / 占位图补真实 dataURL。
//      调用顺序（polish）：deckgen emit → **enrichImages** → QA → art-director。
//   2. 数据源：Unsplash/Pexels 优先；未命中或未配图库 Key 时，若 Settings 已配置
//      imageProvider，则回退 OpenAI Images / 兼容 endpoint 生图。
//      两者都未配置则整 pass noop（不报错，不阻断生成）。
//   3. 所有图统一 fetch 为 dataURL —— 离线 / localStorage / pptx 导出都能用。
//   4. 高并发（默认 4），每张图 2.5s 超时（防止某张图阻塞整篇）；超时即跳过那一张。
//   5. 写回方式：
//        - bgImageQuery → slide.background = ImagePaint (fit: cover)；并在 layer 0 头部
//          push 一个 "BG overlay" rect（黑色半透明）确保文字可读性。layouts 不再自己
//          产 overlay rect（违反"shape 不应是全屏底色"规则），统一在此处理。
//        - heroImageQuery → 在 slide.layers[0].shapes 顶部 push 一个 ImageShape
//          （右半屏 / 顶部 hero band，按 layout kind 决定）。
//        - image-text 的 imageQuery → 替换 compile 留下的 "Image placeholder" +
//          "Image hint" 为真实 ImageShape（占 layout 预留的 bbox）。
import { identityTransform } from "@sliiu/present-core";
import { imageryForFamily } from "../schema.js";
import { DEFAULT_IMAGE_ENRICHMENT_PRIORITY, fetchEnrichmentImageDataUrl, imageEnrichmentAvailable, imageEnrichmentSources, resolveImageGenConcurrency, } from "./fetch-enrichment-image.js";
import { collectInlineImageTasks, fillInlinePlaceholdersInPresentation, slideContentDigest } from "./placeholders.js";
export async function enrichImagesInPresentation(pres, spec, opts) {
    const hasSource = imageEnrichmentAvailable(opts.config);
    if (!hasSource) {
        opts.onProgress?.({ done: 0, total: 0, skippedAll: true });
        return { inserted: 0, skipped: 0 };
    }
    const stockTimeoutMs = opts.perImageTimeoutMs ?? 8000;
    const priority = opts.imageEnrichmentPriority ?? DEFAULT_IMAGE_ENRICHMENT_PRIORITY;
    // 主题 / 风格上下文：解析该族图像气质（imageVibe + fullBleedPhoto），拼成透传给
    // AI 生图 prompt 的 promptContext，并决定是否抑制全屏底图。
    const imagery = imageryForFamily(opts.styleFamily);
    const deckTopic = (opts.topic ?? spec.title ?? "").trim();
    const vibe = opts.imageVibe?.trim() || imagery?.imageVibe;
    const promptContext = {
        ...(opts.styleFamily ? { styleFamily: opts.styleFamily } : {}),
        ...(opts.themeMode ? { themeMode: opts.themeMode } : {}),
        ...(opts.accent ? { accent: opts.accent } : {}),
        ...(opts.language ? { language: opts.language } : {}),
        ...(vibe ? { vibe } : {}),
        ...(deckTopic ? { deckTopic } : {}),
    };
    // 全屏底图抑制：Swiss / 数据新闻 / Memphis 等版式语言不吃大照片；这些族直接跳过 bg 任务，
    // 保留主题原本的 solid/gradient 底 + 装饰层，避免全屏图破坏网格 / 数据感。
    const suppressFullBleed = imagery ? imagery.fullBleedPhoto === false : false;
    const tasks = [];
    spec.slides.forEach((s, i) => {
        const ss = s;
        if (ss.bgImageQuery?.trim() && !suppressFullBleed) {
            tasks.push({
                slideIdx: i,
                kind: "bg",
                query: ss.bgImageQuery.trim(),
                ...(ss.bgOverlay !== undefined ? { overlay: ss.bgOverlay } : {}),
            });
        }
        if (ss.heroImageQuery?.trim()) {
            tasks.push({ slideIdx: i, kind: "hero", query: ss.heroImageQuery.trim() });
        }
    });
    const inlineTasks = collectInlineImageTasks(pres, spec.slides);
    if (tasks.length === 0 && inlineTasks.length === 0)
        return { inserted: 0, skipped: 0 };
    const total = tasks.length + inlineTasks.length;
    opts.onProgress?.({ done: 0, total });
    let done = 0;
    let inserted = 0;
    let skipped = 0;
    const { stock, ai } = imageEnrichmentSources(opts.config);
    const aiConcurrency = resolveImageGenConcurrency(opts.config);
    // 凡是可能打到 AI 生图的路径（纯 AI / ai-first / stock 失败回退 AI），一律遵守
    // settings.imageGenConcurrency。以前 stock-first 时用默认 4，stock 全 miss 后
    // 会以 4 并发砸 AI → 429。纯 stock 才允许更高并发。
    const concurrency = Math.max(1, ai ? aiConcurrency : (opts.concurrency ?? 4));
    if (typeof console !== "undefined" && opts.debug !== false) {
        // 轻量诊断：用户设了并发 1 仍 429 时，先确认生效值。
        console.info(`[enrich] concurrency=${concurrency} (ai=${ai} stock=${stock} priority=${priority} setting=${aiConcurrency})`);
    }
    const aiGate = { aiPaused: false, reason: undefined };
    const queue = [...tasks];
    const W = pres.size.width;
    const H = pres.size.height;
    // hero 预留槽位（内容带内的右侧半屏）——选图比例、图片摆放、正文收缩都以它为准。
    const heroSlot = { x: W * 0.545, y: H * 0.26, w: W * 0.41, h: H * 0.62 };
    // deck 级去重：同一篇里避免多页命中同一张 stock 照片（弱模型常给近似 query）。
    const usedUrls = new Set();
    async function runOne(task) {
        // AI-only 且已熔断：快速跳过，别再打空请求。
        if (aiGate.aiPaused && !stock) {
            skipped += 1;
            done += 1;
            opts.onProgress?.({ done, total });
            return;
        }
        const ac = new AbortController();
        const onAbort = () => ac.abort();
        opts.signal?.addEventListener("abort", onAbort, { once: true });
        try {
            const targetAspect = task.kind === "bg" ? W / H : heroSlot.w / heroSlot.h;
            // 按图的角色喂内容（stock 路径不消费）：bg 只给页标题作意境锚点；
            // hero 是内容配图，额外附上本页要点摘要让模型具体作画。
            const specSlide = spec.slides[task.slideIdx];
            const slideTitle = (specSlide?.title ?? "").trim();
            const digest = task.kind === "hero" ? slideContentDigest(specSlide) : undefined;
            const result = await fetchEnrichmentImageDataUrl(task.query, opts.config, {
                kind: task.kind,
                priority,
                signal: ac.signal,
                stockTimeoutMs,
                targetAspect,
                usedUrls,
                promptContext: {
                    ...promptContext,
                    ...(slideTitle ? { slideTitle } : {}),
                    ...(digest ? { slideContent: digest } : {}),
                },
                aiGate,
            });
            if (!result) {
                skipped += 1;
                return;
            }
            const slide = pres.slides[task.slideIdx];
            if (!slide) {
                skipped += 1;
                return;
            }
            if (task.kind === "bg") {
                // 写到 slide.background；保留主题原本 backgroundPaint 作为底色（在图下方）通过 ImagePaint
                // 的 fit="cover" 完整铺满，所以底色仅作 fallback。
                const bg = {
                    kind: "image",
                    src: result.dataUrl,
                    fit: "cover",
                    // 自然尺寸随手带上：serializer 导出 cover 时靠它换算 <a:srcRect>，
                    // 服务端「分离生成」模式（media 只有引用 token）嗅探不到字节。
                    ...(result.w > 0 && result.h > 0 ? { natural: { w: result.w, h: result.h } } : {}),
                };
                slide.background = bg;
                // 若 overlay > 0，自动 push 一个 "BG overlay" rect 到 layer 0 头部把图压暗，保证
                // 文字对比度。layouts 已不再手画 overlay（rect 全屏底色违反设计规则），全部交给
                // 这里统一处理。重复 enrich 时通过 name 去重，避免叠多层。
                const layer = slide.layers[0];
                if (layer) {
                    const hasOverlay = layer.shapes.some((sh) => sh.name === "BG overlay");
                    if (!hasOverlay) {
                        const overlay = task.overlay ?? 0.45;
                        if (overlay > 0.001) {
                            layer.shapes.unshift({
                                id: `bgov_${Date.now().toString(36)}_${task.slideIdx}`,
                                kind: "rect",
                                name: "BG overlay",
                                bbox: { x: 0, y: 0, w: pres.size.width, h: pres.size.height },
                                zIndex: -10,
                                visible: true,
                                // 不锁定：用户可在画布上选中 / 调整 overlay（如改 alpha / 颜色 / 大小）。
                                // overlay 通过 name === "BG overlay" 在重复 enrich 时去重，与 locked 无关。
                                locked: false,
                                opacity: 1,
                                transform: identityTransform(),
                                fill: { kind: "solid", color: "#000000", alpha: overlay },
                            });
                        }
                    }
                }
                inserted += 1;
            }
            else {
                // hero 图：占内容带右侧预留槽位（heroSlot），保持比例 fit 进槽位（不拉伸）。
                // 关键修复（P0-2）：
                //   1. 把与槽位横向重叠的正文 text shape 收缩到左侧，避免文字跑到图下面。
                //   2. 插入到"第一个 text shape 之前"（z 底部），即便有残余重叠文字也压在图上，
                //      符合设计规则 §2「图不得盖文字」。
                const layer = slide.layers[0];
                if (!layer) {
                    skipped += 1;
                    return;
                }
                const aspect = result.h > 0 ? result.w / result.h : 4 / 3;
                let w = heroSlot.w;
                let h = w / aspect;
                if (h > heroSlot.h) {
                    h = heroSlot.h;
                    w = h * aspect;
                }
                const x = heroSlot.x + (heroSlot.w - w) / 2;
                const y = heroSlot.y + (heroSlot.h - h) / 2;
                // 收缩与 hero 槽位横向重叠、且落在槽位竖直带内的正文 text（title 在 slotY 之上不受影响）。
                const gutter = W * 0.04;
                const bodyRight = heroSlot.x - gutter;
                for (const sh of layer.shapes) {
                    if (sh.kind !== "text")
                        continue;
                    const b = sh.bbox;
                    const vertOverlap = b.y < heroSlot.y + heroSlot.h && b.y + b.h > heroSlot.y;
                    const runsUnder = b.x + b.w > heroSlot.x;
                    if (vertOverlap && runsUnder && b.x < bodyRight - W * 0.1) {
                        b.w = bodyRight - b.x;
                    }
                }
                const heroShape = {
                    // `sp_` prefix is the animation stack's shape-id contract (spid = id minus `sp_`).
                    id: `sp_hero_${Date.now().toString(36)}_${task.slideIdx}`,
                    kind: "image",
                    name: "Hero image",
                    bbox: { x, y, w, h },
                    zIndex: 5,
                    visible: true,
                    locked: false,
                    opacity: 1,
                    transform: identityTransform(),
                    src: result.dataUrl,
                    natural: { w: result.w, h: result.h },
                };
                const firstTextIdx = layer.shapes.findIndex((sh) => sh.kind === "text");
                if (firstTextIdx >= 0)
                    layer.shapes.splice(firstTextIdx, 0, heroShape);
                else
                    layer.shapes.push(heroShape);
                inserted += 1;
            }
        }
        catch {
            skipped += 1;
        }
        finally {
            opts.signal?.removeEventListener("abort", onAbort);
            done += 1;
            opts.onProgress?.({ done, total });
        }
    }
    const workers = [];
    for (let k = 0; k < Math.min(concurrency, total); k++) {
        workers.push((async () => {
            while (queue.length > 0) {
                const t = queue.shift();
                if (!t)
                    return;
                if (opts.signal?.aborted)
                    return;
                await runOne(t);
            }
        })());
    }
    await Promise.all(workers);
    if (inlineTasks.length > 0 && !opts.signal?.aborted) {
        const inline = await fillInlinePlaceholdersInPresentation(pres, inlineTasks, {
            config: opts.config,
            imageEnrichmentPriority: priority,
            ...(opts.signal ? { signal: opts.signal } : {}),
            perImageTimeoutMs: stockTimeoutMs,
            usedUrls,
            promptContext,
            aiGate,
        });
        inserted += inline.filled;
        skipped += inline.skipped;
        done = total;
        opts.onProgress?.({ done: total, total });
    }
    return {
        inserted,
        skipped,
        concurrency,
        ...(aiGate.aiPaused ? { aiRateLimited: true } : {}),
    };
}
