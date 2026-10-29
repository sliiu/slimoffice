export interface ScreenshotResult {
    dataUrl: string;
    w: number;
    h: number;
}
export declare function isScreenshotSupported(): boolean;
/** Insert → Screenshot：捕获屏幕/窗口一帧为 PNG data URL。 */
export declare function captureScreenshot(doc: Document): Promise<ScreenshotResult | null>;
