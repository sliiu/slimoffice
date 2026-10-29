import { allowedProductHome } from "./end-screen.js";
import { resolvePlayerLocale } from "./i18n.js";
import { buildStoredZip } from "./zip-store.js";
/**
 * `buildHtml` 历史行为：把 player 脚本、presentation JSON、字体全部内联到单个 HTML
 * 文件里（资源经 base64 dataURL 嵌入）。适合"一文件分发"场景，但单文件可能巨大。
 *
 * 如果需要"独立资源文件 + 相对路径"输出，请用 {@link buildHtmlBundle}。
 */
export function buildHtml(presentation, playerScript, opts = {}) {
    return renderHtmlDocument({
        presentation,
        inlinePlayer: playerScript,
        fontTags: (opts.fonts ?? []).map((f) => fontFaceCss(f)),
        opts,
    });
}
/**
 * 把 Presentation 中嵌入的 dataURL 资源（图片 / 视频 / 音频 / 字体）抽出到独立文件，
 * HTML 中改用相对路径引用；player.js 同样写到 `assets/` 目录下。返回的 `BundleFile[]`
 * 可以直接打包成 ZIP（参考 {@link bundleToZip}）或写入到任意文件系统。
 *
 * 复用规则：相同的 dataURL / 远端 URL 只会写入一次；扩展名优先依据 MIME 推导。
 */
export function buildHtmlBundle(presentation, playerScript, opts = {}) {
    const assetsDir = (opts.assetsDir ?? "assets").replace(/^\/+|\/+$/g, "");
    const htmlName = opts.htmlName ?? "index.html";
    const assets = [];
    const cache = new Map();
    let seq = 0;
    const extract = (url, hintFamily) => {
        if (!url)
            return url;
        if (cache.has(url))
            return cache.get(url);
        const extracted = extractDataUrlAsset(url, () => seq++, hintFamily);
        if (!extracted) {
            cache.set(url, url);
            return url;
        }
        const path = `${assetsDir}/${extracted.fileName}`;
        assets.push({ path, data: extracted.bytes, mime: extracted.mime });
        const rel = `./${path}`;
        cache.set(url, rel);
        return rel;
    };
    // 1) 深度遍历 presentation 树，重写所有"看起来像资源 URL"的字段。
    //    遵循下列字段名约定（见 @sliiu/present-core）：
    //      - image/media/picture 的 `src` 字段（图片、视频、音频）
    //      - 媒体 / 视频 fill 的 `poster`
    //      - hyperlink `href`（外链不动，只重写 data: 形式的内嵌）
    //      - bullet `src`（pic bullet）
    //    不重写普通字符串字段（text/title 等），仅当字符串以 `data:` 开头时才会被处理。
    const rewritten = rewriteAssets(presentation, (val) => extract(val) ?? val);
    // 2) 字体表 — 独立处理：family 名带出来作为文件名前缀，便于排查。
    const presFonts = rewritten.fonts ?? [];
    const rewrittenFonts = presFonts.map((f) => ({ ...f, src: extract(f.src, f.family) ?? f.src }));
    if (rewrittenFonts.length)
        rewritten.fonts = rewrittenFonts;
    // 3) ExportHtmlOptions.fonts（外部追加字体）一并处理。
    const extraFonts = (opts.fonts ?? []).map((f) => ({ ...f, src: extract(f.src, f.family) ?? f.src }));
    // 4) player.js 写入 assets。
    const playerPath = `${assetsDir}/player.js`;
    assets.push({
        path: playerPath,
        data: utf8(playerScript),
        mime: "application/javascript",
    });
    // 5) 渲染 HTML：player 用 <script src="./assets/player.js">，字体 CSS 使用相对路径。
    const fontTags = [
        ...rewrittenFonts.map((f) => fontFaceCss({
            family: f.family,
            src: f.src,
            weight: f.weight,
            style: f.style,
            format: f.format,
        })),
        ...extraFonts.map((f) => fontFaceCss(f)),
    ];
    const html = renderHtmlDocument({
        presentation: rewritten,
        playerSrc: `./${playerPath}`,
        fontTags,
        opts,
    });
    return {
        rootHtml: htmlName,
        files: [
            { path: htmlName, data: utf8(html), mime: "text/html" },
            ...assets,
        ],
    };
}
/** 把 {@link HtmlBundle} 打包成 ZIP（stored，无压缩）。 */
export function bundleToZip(bundle) {
    const files = bundle.files.map((f) => ({ name: f.path, data: f.data }));
    return buildStoredZip(files);
}
function renderHtmlDocument({ presentation, inlinePlayer, playerSrc, fontTags, opts }) {
    const title = escapeHtml(opts.title ?? (presentation.meta?.title ? String(presentation.meta?.title) : "Presentation"));
    const bg = opts.background ?? "#0f1115";
    const mountOpts = {
        backend: opts.backend ?? "hybrid",
        autoplay: opts.autoplay ?? true,
        clickAdvance: true,
        keyboard: true,
        showControls: true,
    };
    if (opts.ui)
        mountOpts.ui = opts.ui;
    if (opts.locale)
        mountOpts.locale = opts.locale;
    if (opts.basicTransitionsOnly)
        mountOpts.basicTransitionsOnly = true;
    if (presentation.showPr?.kind === "kiosk") {
        mountOpts.kiosk = true;
        mountOpts.clickAdvance = false;
    }
    if (presentation.showPr?.loop)
        mountOpts.endWithBlackSlide = false;
    else
        mountOpts.endWithBlackSlide = true;
    if (presentation.showPr?.showNarration === false)
        mountOpts.playSlideNarrations = false;
    const home = allowedProductHome(opts.endHomeHref);
    if (home)
        mountOpts.endHomeHref = home;
    const presJson = JSON.stringify(presentation).replace(/</g, "\\u003c");
    const fontCss = fontTags.join("\n");
    const pwaTags = opts.pwa
        ? `<link rel="manifest" href="data:application/manifest+json,${encodeURIComponent(JSON.stringify({
            name: presentation.meta?.title ?? "Presentation",
            short_name: "PPT",
            start_url: ".",
            display: "fullscreen",
            background_color: bg,
            theme_color: bg,
        }))}" />`
        : "";
    const playerTag = playerSrc
        ? `<script src="${escapeHtml(playerSrc)}"></script>`
        : `<script>${inlinePlayer ?? ""}</script>`;
    const pluginTags = (opts.plugins ?? [])
        .map((p) => renderPluginScript(typeof p === "string" ? { code: p } : p))
        .join("\n");
    const htmlLang = resolvePlayerLocale(opts.locale);
    return `<!doctype html>
<html lang="${htmlLang}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
${pwaTags}
<style>
html,body{margin:0;height:100%;background:${bg};overflow:hidden;font-family:ui-sans-serif,system-ui,sans-serif;}
#root{height:100vh;width:100vw;}
${fontCss}
.pp-export-watermark{position:fixed;bottom:10px;right:14px;z-index:var(--z-toast, 1400);pointer-events:none;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:rgba(255,255,255,.42);text-shadow:0 1px 2px rgba(0,0,0,.55);font-family:ui-sans-serif,system-ui,sans-serif;}
.pp-export-watermark.is-link{pointer-events:auto;color:rgba(255,255,255,.72);text-decoration:none;}
.pp-export-watermark.is-link:hover{color:#fff;}
.pp-view-only-indicator{position:fixed;top:12px;left:14px;z-index:var(--z-toast, 1400);pointer-events:none;padding:6px 12px;border-radius:6px;background:rgba(0,0,0,.7);backdrop-filter:blur(8px);font-size:12px;font-weight:500;color:rgba(255,255,255,.85);font-family:ui-sans-serif,system-ui,sans-serif;animation:pp-view-only-out .6s ease 2.4s forwards;}
@keyframes pp-view-only-out{to{opacity:0;visibility:hidden;}}
@media (prefers-reduced-motion:reduce){.pp-view-only-indicator{animation-duration:.01s;}}
</style>
${opts.extraHead ?? ""}
</head>
<body>
<div id="root"></div>
${renderViewOnlyIndicator(opts)}
${renderWatermark(opts)}
${playerTag}
${pluginTags}
<script>
(function(){
  var pres = ${presJson};
  var opts = ${JSON.stringify(mountOpts)};
  // 暴露 player handle 给自动化工具（visual-compare / e2e）。生产场景副作用为零，
  // 仅在 window.__player 上挂 PlayerHandle；URL ?driver=auto 时跳过 autoplay/clickAdvance/键盘。
  var qs = typeof window !== 'undefined' && window.location ? window.location.search : '';
  var auto = /[?&]driver=auto/.test(qs);
  var follow = /[?&]live=/.test(qs) || /[?&]driver=follow/.test(qs);
  if (auto) {
    opts.autoplay = false;
    opts.clickAdvance = false;
    opts.keyboard = false;
    opts.showControls = false;
    if (pres && pres.slides) {
      for (var i = 0; i < pres.slides.length; i++) {
        var s = pres.slides[i];
        if (s && s.transition) s.transition = { kind: "cut", duration: 0 };
      }
    }
  }
  if (follow) {
    opts.autoplay = false;
    opts.clickAdvance = false;
    opts.keyboard = false;
    opts.showControls = false;
    opts.kiosk = true;
    opts.endQuiet = true;
    opts.useSlideTimings = false;
    opts.suppressLecture = true;
    opts.contextMenu = true;
    opts.livePlugins = true;
    opts.hideBuiltinContextMenuItems = [
      "builtin:prev", "builtin:next", "builtin:first", "builtin:last",
      "builtin:black", "builtin:white", "builtin:grid", "builtin:help",
      "builtin:fullscreen", "builtin:end",
    ];
  }
  if (auto || follow) opts.skipNarrationPrompt = true;
  var slideEvents = [];
  if (auto) {
    opts.onSlideChange = function(i, total){ slideEvents.push({ i: i, total: total, t: Date.now() }); };
  }
  function doMount() {
    var handle = PPTPlayer.mount(document.getElementById('root'), pres, opts);
    if (typeof window !== 'undefined') {
      window.__player = handle;
      window.__pres = pres;
      window.__slideEvents = slideEvents;
    }
    return handle;
  }
  if (typeof window !== 'undefined' && /[?&]live=/.test(qs)) {
    window.__pptLiveMount = doMount;
  } else {
    doMount();
  }
})();
</script>
${opts.noFooter ? "" : "<noscript>Open in a browser with JavaScript enabled.</noscript>"}
</body>
</html>`;
}
function renderPluginScript(p) {
    if (!p)
        return "";
    const attrs = [];
    if (p.type)
        attrs.push(`type="${escapeHtml(p.type)}"`);
    if (p.async)
        attrs.push("async");
    if (p.defer)
        attrs.push("defer");
    if (p.src) {
        attrs.push(`src="${escapeHtml(p.src)}"`);
        return `<script ${attrs.join(" ")}></script>`;
    }
    if (p.code) {
        // 防止 </script> 出现在内联代码里把脚本提前关闭。
        const safe = p.code.replace(/<\/script/gi, "<\\/script");
        return `<script ${attrs.join(" ")}>${safe}</script>`;
    }
    return "";
}
function fontFaceCss(f) {
    return `@font-face{font-family:${JSON.stringify(f.family)};src:url(${JSON.stringify(f.src)}) format(${JSON.stringify(f.format ?? "woff2")});font-weight:${f.weight ?? 400};font-style:${f.style ?? "normal"};font-display:swap;}`;
}
/**
 * 深度遍历对象树，找到"看起来像 URL 资源的字符串字段"并调用 `rewrite(value)` 替换。
 * 仅作用于约定字段名（src / poster / href / data 等），其它字符串字段不动 —— 避免误改
 * 业务文本（slide text、标题、metadata）。
 */
const ASSET_FIELD_NAMES = new Set([
    "src", // image / media / picture / fill image / sym font / bullet picture
    "poster", // video/media poster
    "blip", // 极少数 paint 内嵌图片
]);
function rewriteAssets(obj, rewrite) {
    return walk(obj, rewrite);
}
function walk(obj, rewrite) {
    if (obj == null)
        return obj;
    if (Array.isArray(obj))
        return obj.map((v) => walk(v, rewrite));
    if (typeof obj === "object") {
        const o = obj;
        const next = {};
        for (const k of Object.keys(o)) {
            const v = o[k];
            if (typeof v === "string" && ASSET_FIELD_NAMES.has(k)) {
                next[k] = rewrite(v);
            }
            else {
                next[k] = walk(v, rewrite);
            }
        }
        return next;
    }
    return obj;
}
function extractDataUrlAsset(url, nextSeq, hintFamily) {
    if (!url.startsWith("data:"))
        return undefined;
    const m = /^data:([^;,]+)?(;base64)?,/.exec(url);
    if (!m)
        return undefined;
    const mime = (m[1] || "application/octet-stream").trim();
    const isB64 = m[2] === ";base64";
    const payload = url.slice(m[0].length);
    let bytes;
    if (isB64) {
        bytes = base64ToBytes(payload);
    }
    else {
        bytes = utf8(decodeURIComponent(payload));
    }
    const ext = mimeToExt(mime);
    const safeName = hintFamily ? sanitizeFileBase(hintFamily) : "r";
    const fileName = `${safeName}-${nextSeq()}${ext ? "." + ext : ""}`;
    return { fileName, bytes, mime };
}
function sanitizeFileBase(s) {
    return s.replace(/[^A-Za-z0-9_\-]+/g, "_").slice(0, 40) || "r";
}
function mimeToExt(mime) {
    switch (mime.toLowerCase()) {
        case "image/png":
            return "png";
        case "image/jpeg":
        case "image/jpg":
            return "jpg";
        case "image/gif":
            return "gif";
        case "image/webp":
            return "webp";
        case "image/svg+xml":
            return "svg";
        case "image/bmp":
            return "bmp";
        case "image/tiff":
            return "tiff";
        case "image/x-emf":
        case "image/emf":
            return "emf";
        case "image/x-wmf":
        case "image/wmf":
            return "wmf";
        case "video/mp4":
            return "mp4";
        case "video/webm":
            return "webm";
        case "video/ogg":
            return "ogv";
        case "audio/mpeg":
            return "mp3";
        case "audio/wav":
            return "wav";
        case "audio/ogg":
            return "ogg";
        case "audio/x-m4a":
        case "audio/mp4":
            return "m4a";
        case "font/woff2":
        case "application/font-woff2":
            return "woff2";
        case "font/woff":
        case "application/font-woff":
            return "woff";
        case "font/ttf":
        case "application/x-font-ttf":
        case "application/font-sfnt":
            return "ttf";
        case "font/otf":
        case "application/x-font-otf":
            return "otf";
        case "application/vnd.ms-fontobject":
            return "eot";
        case "application/javascript":
        case "text/javascript":
            return "js";
        case "text/css":
            return "css";
        case "application/json":
            return "json";
        default:
            return "";
    }
}
function base64ToBytes(b64) {
    if (typeof atob === "function") {
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++)
            out[i] = bin.charCodeAt(i);
        return out;
    }
    // Node fallback — global Buffer is typed via @types/node.
    const buf = globalThis.Buffer;
    if (buf)
        return new Uint8Array(buf.from(b64, "base64"));
    throw new Error("base64 decoder unavailable");
}
function utf8(s) {
    return new TextEncoder().encode(s);
}
export async function urlToDataUrl(input, fetcher) {
    if (input.startsWith("data:"))
        return input;
    const f = fetcher ?? (typeof fetch !== "undefined" ? fetch : undefined);
    if (!f)
        return input;
    try {
        const resp = await f(input);
        const blob = await resp.blob();
        return await blobToDataUrl(blob);
    }
    catch {
        return input;
    }
}
function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : "");
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
    });
}
export async function inlineMediaInPresentation(pres) {
    const visit = async (obj) => {
        if (Array.isArray(obj)) {
            const out = [];
            for (const it of obj)
                out.push(await visit(it));
            return out;
        }
        if (obj && typeof obj === "object") {
            const o = obj;
            const next = {};
            for (const k of Object.keys(o)) {
                const v = o[k];
                if (typeof v === "string" && (k === "src" || k === "poster") && /^https?:\/\//.test(v)) {
                    next[k] = await urlToDataUrl(v);
                }
                else {
                    next[k] = await visit(v);
                }
            }
            return next;
        }
        return obj;
    };
    return (await visit(pres));
}
function safeHttpUrl(raw) {
    if (!raw)
        return undefined;
    try {
        const u = new URL(raw);
        if (u.protocol === "http:" || u.protocol === "https:")
            return u.href;
    }
    catch {
        /* ignore */
    }
    return undefined;
}
function renderViewOnlyIndicator(opts) {
    const text = opts.viewOnlyIndicator?.trim();
    if (!text)
        return "";
    return `<div class="pp-view-only-indicator" aria-label="View-only share">${escapeHtml(text)}</div>`;
}
function renderWatermark(opts) {
    const text = opts.watermark?.trim();
    if (!text)
        return "";
    const href = safeHttpUrl(opts.watermarkHref);
    const body = escapeHtml(text);
    if (!href) {
        return `<div class="pp-export-watermark" aria-hidden="true">${body}</div>`;
    }
    return `<a class="pp-export-watermark is-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${body}</a>`;
}
function escapeHtml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
