import type { Presentation } from "@sliiu/present-core";
/** 长边上限。多图模型对单张图的边长通常卡在这附近。 */
export declare const SCREENSHOT_MAX_EDGE = 1920;
/** 一次交给 agent 的页数上限。再多就改成指定页码。 */
export declare const SCREENSHOT_SHEET_LIMIT = 8;
export declare class BrowserScreenshotError extends Error {
    constructor(message: string);
}
export interface BrowserScreenshotOptions {
    /** 0-based。每一页单独起一次浏览器。 */
    slideIndices: number[];
    /** CSS 视口宽度。高度按幻灯片比例。长边不超过 {@link SCREENSHOT_MAX_EDGE}。 */
    width?: number;
    browserPath?: string;
    /** 单次浏览器进程的墙钟上限。默认 45 秒。 */
    timeoutMs?: number;
}
export interface SlideScreenshot {
    slideIdx: number;
    png: Uint8Array;
}
export declare function slideViewport(size: {
    width: number;
    height: number;
}, width?: number): {
    width: number;
    height: number;
};
export declare function screenshotPageUrl(htmlPath: string, slideIdx: number): string;
export declare function chromeScreenshotArgs(url: string, outPath: string, width: number, height: number): string[];
/** 无头窗口比页面视口大一圈。按浏览器报出的 inner 尺寸把窗口补正到目标视口。 */
export declare function nextWindowSize(windowSize: {
    width: number;
    height: number;
}, inner: {
    width: number;
    height: number;
}, target: {
    width: number;
    height: number;
}): {
    width: number;
    height: number;
};
export declare function readViewportLog(stderr: string): {
    width: number;
    height: number;
} | null;
export declare function findChromeBrowsers(env?: NodeJS.ProcessEnv): Promise<string[]>;
export declare function findChromeBrowser(env?: NodeJS.ProcessEnv): Promise<string | null>;
/** 多页缩成一张总览。给 agent 看整本，不必一页一次看图。 */
export declare function composeContactSheet(pngs: Uint8Array[], opts?: {
    columns?: number;
    cellWidth?: number;
}): Uint8Array;
export declare function screenshotSlidesViaBrowser(pres: Presentation, playerScript: string, opts: BrowserScreenshotOptions): Promise<SlideScreenshot[]>;
