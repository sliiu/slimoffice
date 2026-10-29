import type { Presentation } from "@sliiu/present-core";
import type { PluginUIOptions } from "@sliiu/present-plugin-sdk";
export interface FontEmbed {
    family: string;
    src: string;
    weight?: number | string;
    style?: "normal" | "italic";
    format?: string;
}
/**
 * 插件注入项 — 可以是：
 *   - 内联代码：`{ code: "PPTPlayer.definePlugin({...})" }`
 *   - 外部脚本：`{ src: "./plugins/my-plugin.js" }`（可与 buildHtmlBundle 配合使用）
 *   - ES module：`{ src: "...", type: "module" }`
 *
 * 注入的 `<script>` 会插在 player IIFE 之后、bootstrap mount() 之前 —— 所以脚本
 * 里调用 `PPTPlayer.definePlugin(...)` 注册的插件会在 mount 时被自动激活。
 */
export interface PluginScriptInjection {
    /** 内联脚本内容。 */
    code?: string;
    /** 外部脚本 URL（相对路径或 http(s)）。 */
    src?: string;
    /** type 属性（"module" 表示原生 ES module）。 */
    type?: "module" | "text/javascript";
    /** async / defer 属性。 */
    async?: boolean;
    defer?: boolean;
}
export interface ExportHtmlOptions {
    title?: string;
    background?: string;
    autoplay?: boolean;
    backend?: "svg" | "canvas" | "hybrid";
    extraHead?: string;
    fonts?: FontEmbed[];
    pwa?: boolean;
    noFooter?: boolean;
    /**
     * 导出 HTML 里 player UI 的语言（右键菜单 / 白板 / 激光笔等文本）。
     * 透传给 bootstrap 的 `PPTPlayer.mount(..., { locale })`。受支持 `"en"` / `"zh-CN"`。
     */
    locale?: string;
    /**
     * 注入到 HTML 的插件脚本。脚本应在内部调用 `PPTPlayer.definePlugin(...)` 注册
     * 插件；mount() 时会自动激活全局插件队列里的所有插件。
     *
     * 也可以接受字符串数组（语法糖，等价于 `{ code: "..." }`）。
     */
    plugins?: Array<string | PluginScriptInjection>;
    /**
     * Plugin UI 选项（位置 / 主题 / headless / CSS 变量）；会被 bootstrap 脚本
     * 透传给 `PPTPlayer.mount(..., { ui })`。
     */
    ui?: PluginUIOptions;
    /**
     * 放映页角标水印（Free 导出 HTML / 分享等）。固定定位在视口一角。
     * 传入 `watermarkHref` 时角标可点，用于分享裂变。
     */
    watermark?: string;
    /** http(s) 链接；与 `watermark` 同时出现时角标变为可点击。 */
    watermarkHref?: string;
    /**
     * 为 true 时，导出 HTML 里内嵌 player 会把非基础切换（3D / morph / WebGL）降级为
     * 简单淡入淡出。SaaS 免费/Lite 导出走这条路 —— 高级动效仅付费套餐可导出，但在线放映
     * 对所有套餐开放（见 playground 的 playbackMountOptions）。透传给 `mount(..., { basicTransitionsOnly })`。
     */
    basicTransitionsOnly?: boolean;
    /**
     * 在页面左上角显示"仅供查看"/"View-only"标识（分享页专用，禁止保存/导出）。
     */
    viewOnlyIndicator?: string;
    /**
     * 结束屏「首页」打开的产品站。只接受 `https://slimppt.com` 或 `https://slimppt.cn`。
     * 有这个地址时，结束屏是从头播放和首页，黑底单击没有动作。
     */
    endHomeHref?: string;
}
/**
 * `buildHtml` 历史行为：把 player 脚本、presentation JSON、字体全部内联到单个 HTML
 * 文件里（资源经 base64 dataURL 嵌入）。适合"一文件分发"场景，但单文件可能巨大。
 *
 * 如果需要"独立资源文件 + 相对路径"输出，请用 {@link buildHtmlBundle}。
 */
export declare function buildHtml(presentation: Presentation, playerScript: string, opts?: ExportHtmlOptions): string;
export interface BundleFile {
    /** 相对 bundle 根目录的路径（始终用 `/` 分隔，不含开头 `/`）。 */
    path: string;
    data: Uint8Array;
    mime: string;
}
export interface HtmlBundle {
    files: BundleFile[];
    /** Bundle 入口 HTML 在 `files` 中的相对路径。 */
    rootHtml: string;
}
export interface BuildHtmlBundleOptions extends ExportHtmlOptions {
    /** 资源子目录名，默认 `assets`。 */
    assetsDir?: string;
    /** 入口 HTML 文件名，默认 `index.html`。 */
    htmlName?: string;
}
/**
 * 把 Presentation 中嵌入的 dataURL 资源（图片 / 视频 / 音频 / 字体）抽出到独立文件，
 * HTML 中改用相对路径引用；player.js 同样写到 `assets/` 目录下。返回的 `BundleFile[]`
 * 可以直接打包成 ZIP（参考 {@link bundleToZip}）或写入到任意文件系统。
 *
 * 复用规则：相同的 dataURL / 远端 URL 只会写入一次；扩展名优先依据 MIME 推导。
 */
export declare function buildHtmlBundle(presentation: Presentation, playerScript: string, opts?: BuildHtmlBundleOptions): HtmlBundle;
/** 把 {@link HtmlBundle} 打包成 ZIP（stored，无压缩）。 */
export declare function bundleToZip(bundle: HtmlBundle): Uint8Array;
export declare function urlToDataUrl(input: string, fetcher?: typeof fetch): Promise<string>;
export declare function inlineMediaInPresentation(pres: Presentation): Promise<Presentation>;
