/** ECMA-376 §19.2.2.11 `p:guide` — `pos` 用旧 PPT 母版单位：每英寸 576。 */
export declare const GUIDE_UNITS_PER_INCH = 576;
export type GuideOrient = "vert" | "horz";
/** `ppt/viewProps.xml` 里一条绘图参考线，`pos` 为 slide 像素。 */
export interface DrawingGuide {
    orient: GuideOrient;
    pos: number;
}
/**
 * ECMA-376 §19.2.2 `viewPr`：幻灯片视图参考线 + 网格吸附。
 * 放在 Presentation 上（可 JSON 克隆），缓存恢复丢掉 `__source` 后仍能 from-scratch 写回。
 */
export interface ViewGuides {
    slide: DrawingGuide[];
    notes?: DrawingGuide[];
    showGuides?: boolean;
    snapToGrid?: boolean;
    snapToObjects?: boolean;
    gridSpacing?: {
        x: number;
        y: number;
    };
}
export declare function guidePosToPx(pos: number): number;
export declare function pxToGuidePos(px: number): number;
export declare function viewGuidesSnapshot(g: ViewGuides | undefined): string;
export declare function viewGuidesHasContent(g: ViewGuides | undefined): boolean;
