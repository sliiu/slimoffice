export type SplitMotion = {
    kind: "expand";
    clip: string;
} | {
    kind: "meet";
    axis: "x" | "y";
};
/** orient=vert 左右分开，horz 上下分开。dir=in 从两侧收到中间，其余从中间向外展开。 */
export declare function splitMotion(orient: unknown, dir: unknown): SplitMotion;
/** 面板上的四档（中央向左右展开 / 左右向中央收缩 / …）和 OOXML orient+dir 互转。 */
export declare function splitToken(orient: unknown, dir: unknown): string;
export declare function splitParamsFromToken(token: string): {
    orient: "horz" | "vert";
    dir: "in" | "out";
};
/** OOXML CT_WheelTransition 的 spokes。缺省 4。界面提供 1/2/3/4/8，其它 1–8 的整数照播。 */
export declare function wheelSpokes(pattern: unknown): number;
/** 固定点数的轮辐多边形，portion 0 收成射线，1 铺满画面。reverse 往反方向张开。 */
export declare function wheelPolygon(spokes: number, portion: number, reverse: boolean): string;
/** 条纹沿 dir 扫过。dir 是运动方向（topLeft = 朝左上，即从右下进来）。三点同点数，方便插值。 */
export declare function stripsClips(dir: string): [string, string, string];
/** 涟漪收缩的圆心。角方向用面板的 topLeft / topRight / bottomLeft / bottomRight。 */
export declare function rippleAt(dir: string): string;
/** 闪耀的菱形 / 六边形，以及蜂巢的疏六边形。mask 里黑色是露出的部分。 */
export declare function cellMask(kind: string): string;
/** 面板上「方向 · 图案」和 params.dir + params.pattern 互转。缺省向左、菱形。 */
export declare function glitterToken(dir: unknown, pattern: unknown): string;
export declare function glitterParamsFromToken(token: string): {
    dir: "left" | "right" | "up" | "down";
    pattern: "diamond" | "hexagon";
};
/** 闪耀扫过的起点和终点。向左从左缘扫到右缘，其余镜像。 */
export declare function glitterSweep(dir: string): {
    from: string;
    to: string;
};
/** 剥离后仍平贴的那一块。towardRight 从左下角往右揭，否则从右下角往左揭。amount 0 整页，1 几乎揭完。 */
export declare function peelFlatClip(towardRight: boolean, amount: number): string;
