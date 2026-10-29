/** 参考线 / 网格的线芯颜色。只记在这台浏览器，不写进 pptx。 */
export declare const GUIDE_AID_COLOR_KEY = "pp.aid.guideColor";
export declare const GRID_AID_COLOR_KEY = "pp.aid.gridColor";
export declare const GUIDE_AID_OPACITY_KEY = "pp.aid.guideOpacity";
export declare const GRID_AID_OPACITY_KEY = "pp.aid.gridOpacity";
/** 视图条「参考线」现在的线色。拖动时的对齐线另画，不走这里。 */
export declare const DEFAULT_GUIDE_AID_COLOR = "#22d3ee";
export declare const DEFAULT_GRID_AID_COLOR = "#3b82f6";
/** 屏幕像素（non-scaling-stroke）。一条线，不再叠细边。 */
export declare const GUIDE_AID_WIDTH = 1;
export declare const GRID_AID_WIDTH = 1;
/** 默认半透，避免网格铺满页面。可在右键条里改到 5%–100%。 */
export declare const DEFAULT_AID_OPACITY = 0.4;
export declare function normalizeAidColor(raw: string): string | null;
export declare function readAidColor(store: Storage | null, key: string, fallback: string): string;
export declare function writeAidColor(store: Storage | null, key: string, color: string): boolean;
export declare function normalizeAidOpacity(raw: string): number | null;
export declare function readAidOpacity(store: Storage | null, key: string, fallback: number): number;
export declare function writeAidOpacity(store: Storage | null, key: string, opacity: number): boolean;
export declare function clearAidColor(store: Storage | null, key: string): void;
export declare function aidColorStore(): Storage | null;
/** 一条实线，颜色就是用户选的线色。 */
export declare function appendAidLine(doc: Document, parent: SVGElement, applyGeom: (ln: SVGLineElement) => void, color: string, width: number, opacity: number): void;
export interface AidColorPopoverOptions {
    anchor: HTMLElement;
    label: string;
    resetLabel: string;
    value: string;
    fallback: string;
    onColor: (color: string) => void;
    opacityLabel: string;
    opacity: number;
    opacityFallback: number;
    onOpacity: (opacity: number) => void;
    onReset: () => void;
}
/** 右键视图条按钮后的取色条。左键开关不走这里。 */
export declare function openAidColorPopover(doc: Document, opts: AidColorPopoverOptions): void;
