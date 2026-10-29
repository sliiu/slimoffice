/** ECMA-376 §19.2.1.38 `p:showPr` — 放映方式（循环 / 窗口 / 排练时间 / 旁白）。 */
export type ShowKind = "present" | "browse" | "kiosk";
export interface ShowSlideRange {
    /** 1-based inclusive. */
    start: number;
    end: number;
}
export interface ShowProperties {
    loop?: boolean;
    showNarration?: boolean;
    showAnimation?: boolean;
    useTimings?: boolean;
    kind?: ShowKind;
    browseShowScrollbar?: boolean;
    slides?: "all" | ShowSlideRange;
    customShowId?: number;
    /** `#RRGGBB` 墨迹笔色。 */
    penColor?: string;
    showMediaControls?: boolean;
}
export interface ShowUiState {
    loop: boolean;
    windowed: boolean;
    useTimings: boolean;
    playNarrations: boolean;
    showMediaControls: boolean;
}
export declare function showPropertiesSnapshot(s: ShowProperties | undefined): string;
export declare function showPropertiesHasContent(s: ShowProperties | undefined): boolean;
export declare function showPropertiesToUi(s: ShowProperties | undefined): ShowUiState;
export declare function applyUiToShowProperties(prev: ShowProperties | undefined, ui: ShowUiState): ShowProperties;
/** 放映页序：自定义放映 / `sldRg`；全选时返回 undefined（沿用默认可见页）。 */
export declare function showPropertiesSlideOrder(s: ShowProperties | undefined, slideCount: number, customShows?: Array<{
    id: string;
    slideIndices?: number[];
}>): number[] | undefined;
export declare function clampSlideIndexToOrder(startIdx: number, order: number[] | undefined): number;
