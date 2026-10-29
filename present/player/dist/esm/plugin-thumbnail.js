// ThumbnailAPI 实现 — 与编辑器 slide list 同源：用 SvgBackend 直接渲染矢量缩略图。
//
// 为什么不用 canvas 截图：
//   1) 字体异步加载，snapshotSlide 用 toBlob 时常常截到 fallback 字形
//   2) 滤镜 / 渐变 / 复杂路径在 canvas 上的实现保真度较低
//   3) 矢量 SVG 可以任意缩放、序列化体积小、可以直接嵌入 PDF / 导出
//
// 实现策略：
//   - `mount(host, target)` —— 在 host 上 `new SvgBackend(scene, host)`，返回 handle
//   - `toSvgString(target)` —— 创建临时 div 渲染再 serialize，最后销毁
//   - 缓存：相同 (slideId, transparent) 的 SVG 字符串只生成一次
//
// SVG 输出是设计稿（入场动画的目标保持可见），供放映缩略图 / 总览跳转：
//   - shape 几何 / 填充 / 边框
//   - 文本（含字体、段落样式）
//   - 图片（嵌入或外链 URL）
//   - 渐变 / 滤镜 / 阴影 / 路径裁剪
// 播放舞台另走 applyEntranceHideToScene，缩略图不跟「点击前隐藏」。
import { SvgBackend, createScene, revealDesignedAppearance, stageChromeBackground } from "@sliiu/present-renderer";
export function createThumbnailAPI(pres) {
    const stringCache = new Map();
    const resolveSlide = (target) => {
        if (typeof target === "number") {
            let v = -1;
            for (let i = 0; i < pres.slides.length; i++) {
                if (pres.slides[i].show === false)
                    continue;
                v++;
                if (v === target) {
                    return { slide: pres.slides[i], cacheKey: pres.slides[i].id };
                }
            }
            throw new Error(`thumbnail: visibleIndex ${target} not found`);
        }
        if ("visibleIndex" in target)
            return resolveSlide(target.visibleIndex);
        if ("absoluteIndex" in target) {
            const i = target.absoluteIndex;
            if (i < 0 || i >= pres.slides.length) {
                throw new Error(`thumbnail: absoluteIndex ${i} out of range [0,${pres.slides.length})`);
            }
            return { slide: pres.slides[i], cacheKey: pres.slides[i].id };
        }
        const slide = pres.slides.find((s) => s.id === target.id);
        if (!slide)
            throw new Error(`thumbnail: slide id '${target.id}' not found`);
        return { slide, cacheKey: slide.id };
    };
    const renderSvgString = (target, opts = {}) => {
        const { slide, cacheKey } = resolveSlide(target);
        const key = `${cacheKey}|${opts.transparent ? "tp" : "wt"}`;
        const cached = stringCache.get(key);
        if (cached)
            return cached.svgString;
        // 用 detached host 渲染并序列化 —— 不挂载到 document 树。
        const host = typeof document !== "undefined"
            ? document.createElement("div")
            : null;
        if (!host) {
            throw new Error("thumbnail.toSvgString: requires a DOM (no `document` available)");
        }
        let svgString;
        let be = null;
        try {
            const scene = createScene(slide, pres.size, { masters: pres.masters });
            revealDesignedAppearance(scene, slide);
            const chrome = stageChromeBackground(slide);
            const transparent = opts.transparent === true || chrome === "transparent";
            be = new SvgBackend(scene, host, { transparent, preview: true });
            if (!transparent)
                be.root.style.background = chrome;
            // SvgBackend 默认走 rAF 调度 redraw；这里同步取 SVG 字符串，必须强制 flush
            // 一次把所有属性写到 DOM 上，否则 serialize 只能拿到占位 <g>。
            be.flush();
            be.root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
            be.root.setAttribute("preserveAspectRatio", "xMidYMid meet");
            svgString = new XMLSerializer().serializeToString(be.root);
        }
        finally {
            be?.destroy();
        }
        stringCache.set(key, { svgString });
        return svgString;
    };
    const renderSvgBlob = (target, opts = {}) => {
        const { cacheKey } = resolveSlide(target);
        const key = `${cacheKey}|${opts.transparent ? "tp" : "wt"}`;
        const entry = stringCache.get(key) ?? { svgString: renderSvgString(target, opts) };
        if (entry.blob)
            return entry.blob;
        const blob = new Blob([entry.svgString], { type: "image/svg+xml" });
        entry.blob = blob;
        stringCache.set(key, entry);
        return blob;
    };
    const renderDataUrl = (target, opts = {}) => {
        const { cacheKey } = resolveSlide(target);
        const key = `${cacheKey}|${opts.transparent ? "tp" : "wt"}`;
        const entry = stringCache.get(key) ?? { svgString: renderSvgString(target, opts) };
        if (entry.dataUrl)
            return entry.dataUrl;
        const url = svgStringToDataUrl(entry.svgString);
        entry.dataUrl = url;
        stringCache.set(key, entry);
        return url;
    };
    return {
        mount(host, target, opts = {}) {
            const { slide } = resolveSlide(target);
            const scene = createScene(slide, pres.size, { masters: pres.masters });
            revealDesignedAppearance(scene, slide);
            const chrome = stageChromeBackground(slide);
            const transparent = opts.transparent === true || chrome === "transparent";
            const be = new SvgBackend(scene, host, { transparent, preview: true });
            if (!transparent)
                be.root.style.background = chrome;
            be.root.setAttribute("preserveAspectRatio", "xMidYMid meet");
            // 同步 flush 一次，避免挂载后 rAF 之间空一帧导致闪屏。
            be.flush();
            return {
                element: be.root,
                destroy: () => be.destroy(),
            };
        },
        toSvgString: (target, opts) => renderSvgString(target, opts),
        toSvgBlob: (target, opts) => renderSvgBlob(target, opts),
        toDataUrl: (target, opts) => renderDataUrl(target, opts),
        // --- 兼容旧 API（统一返回 SVG Blob）---
        byVisibleIndex: (v, opts = {}) => Promise.resolve(renderSvgBlob(v, { transparent: opts.transparent })),
        byAbsoluteIndex: (abs, opts = {}) => Promise.resolve(renderSvgBlob({ absoluteIndex: abs }, { transparent: opts.transparent })),
        byId: (id, opts = {}) => Promise.resolve(renderSvgBlob({ id }, { transparent: opts.transparent })),
        dataUrlByVisibleIndex: (v, opts = {}) => Promise.resolve(renderDataUrl(v, { transparent: opts.transparent })),
        clearCache: () => stringCache.clear(),
    };
}
function svgStringToDataUrl(svg) {
    if (typeof btoa === "function") {
        // 处理非 ASCII 字符（btoa 在 Latin-1 范围外抛错）
        const utf8 = typeof TextEncoder !== "undefined"
            ? new TextEncoder().encode(svg)
            : null;
        if (utf8) {
            let bin = "";
            for (let i = 0; i < utf8.length; i++)
                bin += String.fromCharCode(utf8[i]);
            return `data:image/svg+xml;base64,${btoa(bin)}`;
        }
        return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    }
    const buf = globalThis.Buffer;
    if (buf) {
        return `data:image/svg+xml;base64,${buf.from(svg, "utf8").toString("base64")}`;
    }
    // 极端 fallback：URI 编码
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
