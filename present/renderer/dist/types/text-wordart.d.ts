export interface WordArtBox {
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface WordArtFit {
    sx: number;
    sy: number;
    tx: number;
    ty: number;
}
/**
 * 把已排好的墨迹框映射到形状框。
 * 变换顺序是先缩放再平移：`x' = x * sx + tx`。
 * 近乎 1:1 或比例离谱时返回 null，调用方保持原排版。
 */
export declare function wordArtFitTransform(ink: WordArtBox, box: WordArtBox): WordArtFit | null;
