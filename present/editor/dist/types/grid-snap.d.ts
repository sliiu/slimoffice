/** 视图条网格的间距，和 renderGrid 画出来的线是同一组。 */
export declare const VISUAL_GRID_STEP = 50;
/** 幻灯片上实际画出的最近一条网格线。max 不是步长整数时，不吸到幻灯片外。 */
export declare function closestGridLine(value: number, step: number, max: number): number;
/** 边或中心离网格线不超过 threshold 时，返回要补上的位移。 */
export declare function pickGridSnap(positions: number[], step: number, max: number, threshold: number): {
    delta: number;
    at: number;
} | null;
